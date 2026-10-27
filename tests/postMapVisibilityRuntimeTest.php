<?php

// Real Flarum scopes/controllers, disposable forum only. No schema changes.
// All fixture writes roll back; do not use this on the owner's forum.
$root = $argv[1] ?? '';
if (!in_array('--isolated-forum', $argv, true) || !is_file($root.'/config.php')) {
    throw new RuntimeException('Pass the isolated Flarum root and --isolated-forum.');
}
$config = require $root.'/config.php';
if (!in_array(parse_url($config['url'] ?? '', PHP_URL_HOST), ['127.0.0.1', 'localhost'], true)
    || !preg_match('/^flarum_(smoke|grid_style_[0-9]+)$/D', $config['database']['database'] ?? '')) {
    throw new RuntimeException('Only the named disposable local/CI fixture databases are allowed.');
}
$site = require $root.'/site.php';
$container = $site->bootApp()->getContainer();

use ChakChakman\InteractiveMaps\Api\ShowPostMapController;
use ChakChakman\InteractiveMaps\Api\UpdateEmbedPresentationController;
use ChakChakman\InteractiveMaps\Api\SyncPostMapsController;
use ChakChakman\InteractiveMaps\Api\MovePostTokenController;
use ChakChakman\InteractiveMaps\Api\AttachMapToPostController;
use ChakChakman\InteractiveMaps\Access\MapPermissions;
use Flarum\Discussion\Discussion;
use Flarum\Post\Post;
use Flarum\User\User;
use Flarum\Http\RequestUtil;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\ServerRequest;

$db = $container->make(ConnectionInterface::class);
$tables = ['users', 'groups', 'group_user', 'group_permission', 'discussions', 'posts', 'chak_maps', 'chak_tokens', 'chak_map_embeds'];
$before = array_map(fn ($table) => $db->table($table)->count(), $tables);
$db->beginTransaction();
try {
    $suffix = bin2hex(random_bytes(5));
    $now = date('Y-m-d H:i:s');
    $admin = User::where('username', 'smokeadmin')->firstOrFail();
    if (!$admin->isAdmin()) throw new RuntimeException('Disposable admin fixture required.');
    $userId = $db->table('users')->insertGetId([
        'username' => 'scope'.$suffix, 'email' => 'scope'.$suffix.'@example.test',
        'password' => password_hash('Unused-disposable-runtime-fixture', PASSWORD_BCRYPT),
        'is_email_confirmed' => true, 'joined_at' => $now,
    ]);
    $groupId = $db->table('groups')->insertGetId(['name_singular' => 'Scope GM '.$suffix, 'name_plural' => 'Scope GMs '.$suffix]);
    $db->table('group_user')->insert(['user_id' => $userId, 'group_id' => $groupId]);
    foreach ([MapPermissions::MANAGE, MapPermissions::EMBED, 'discussion.editPosts'] as $permission) {
        $db->table('group_permission')->insert(['permission' => $permission, 'group_id' => $groupId]);
    }
    $actor = User::findOrFail($userId);
    if (!MapPermissions::canManage($actor) || !MapPermissions::canEmbed($actor) || $actor->isAdmin()) {
        throw new LogicException('Expected a real non-admin map manager.');
    }
    $discussionId = $db->table('discussions')->insertGetId([
        'title' => 'Scope fixture '.$suffix, 'slug' => 'scope-'.$suffix,
        'created_at' => $now, 'user_id' => $admin->id, 'comment_count' => 1,
    ]);
    $postId = $db->table('posts')->insertGetId([
        'discussion_id' => $discussionId, 'number' => 1, 'created_at' => $now,
        'user_id' => $admin->id, 'type' => 'comment', 'content' => '<t>Scope fixture</t>',
    ]);
    $mapId = $db->table('chak_maps')->insertGetId([
        'title' => 'SECRET scope payload '.$suffix, 'background_url' => '/scope-only.svg', 'creator_id' => $admin->id,
    ]);
    $tokenId = $db->table('chak_tokens')->insertGetId([
        'map_id' => $mapId, 'name' => 'SECRET token '.$suffix, 'image_url' => '/scope-only.svg',
        'owner_user_id' => $userId, 'x' => 0.25, 'y' => 0.75,
    ]);
    $db->table('chak_map_embeds')->insert(['post_id' => $postId, 'map_id' => $mapId, 'created_by' => $admin->id]);
    $show = fn () => (new ShowPostMapController)->handle(RequestUtil::withActor(
        (new ServerRequest)->withQueryParams(['id' => $postId]), $actor
    ));
    $sync = fn () => (new SyncPostMapsController)->handle(RequestUtil::withActor(
        (new ServerRequest)->withQueryParams(['postIds' => $postId.',2147483647']), $actor
    ));
    $checkSync = function (bool $available) use ($sync, $postId, $mapId) {
        $response = $sync();
        if ($response->getStatusCode() !== 200 || $response->getHeaderLine('Cache-Control') !== 'private, no-store') throw new LogicException('Invalid sync response');
        $data = json_decode((string) $response->getBody(), true)['data'];
        if ($data[0]['id'] !== (string) $postId || $data[0]['attributes']['available'] !== $available
            || $data[1]['attributes'] !== ['available' => false]) throw new LogicException('Wrong post scope in batch');
        if ($available) {
            if ($data[0]['attributes']['mapId'] !== $mapId || count($data[0]['attributes']['tokens']) !== 1) throw new LogicException('Missing authorized tokens');
        } elseif ($data[0]['attributes'] !== ['available' => false]) throw new LogicException('Private batch leaked attributes');
    };
    $checkSync(true);
    $move = fn () => (new MovePostTokenController)->handle(RequestUtil::withActor(
        (new ServerRequest)->withQueryParams(['postId' => $postId, 'tokenId' => $tokenId])
            ->withParsedBody(['x' => 0.9, 'y' => 0.1, 'postId' => $postId, 'mapId' => $mapId,
                'moveVersion' => \ChakChakman\InteractiveMaps\Models\TokenMoveVersion::forToken(\ChakChakman\InteractiveMaps\Models\Token::findOrFail($tokenId))]), $actor
    ));
    $attach = fn () => (new AttachMapToPostController)->handle(RequestUtil::withActor(
        (new ServerRequest)->withParsedBody(['postId' => $postId, 'mapId' => $mapId,
                'moveVersion' => \ChakChakman\InteractiveMaps\Models\TokenMoveVersion::forToken(\ChakChakman\InteractiveMaps\Models\Token::findOrFail($tokenId))]), $actor
    ));
    $presentation = fn () => (new UpdateEmbedPresentationController)->handle(RequestUtil::withActor(
        (new ServerRequest)->withQueryParams(['id' => $postId])
            ->withParsedBody(['displayPosition' => 'above', 'startsCollapsed' => true]), $actor
    ));
    $check = function ($response, int $status, string $label) {
        $body = (string) $response->getBody();
        if ($response->getStatusCode() !== $status) throw new LogicException($label.': '.$body);
        if ($status === 404 && (str_contains($body, 'SECRET') || isset(json_decode($body, true)['data']) || isset(json_decode($body, true)['included']))) {
            throw new LogicException($label.': map payload leaked');
        }
    };
    $check($show(), 200, 'visible positive control');
    $check($presentation(), 200, 'visible editable presentation positive control');
    $check($attach(), 200, 'visible editable attachment positive control');
    $check($move(), 200, 'visible owner movement positive control');
    $db->table('chak_tokens')->where('id', $tokenId)->update(['x' => 0.25, 'y' => 0.75]);
    foreach ([['posts', 'hidden_at', $now], ['discussions', 'hidden_at', $now],
        ['posts', 'is_private', true], ['discussions', 'is_private', true]] as [$table, $column, $value]) {
        $id = $table === 'posts' ? $postId : $discussionId;
        $db->table($table)->where('id', $id)->update([$column => $value]);
        $check($show(), 404, "$table.$column read");
        $checkSync(false);
        $check($move(), 404, "$table.$column movement");
        $check($attach(), 403, "$table.$column attachment");
        $check($presentation(), 403, "$table.$column presentation");
        $saved = $db->table('chak_tokens')->find($tokenId);
        if ((float) $saved->x !== 0.25 || (float) $saved->y !== 0.75) throw new LogicException('Denied movement changed coordinates');
        $db->table($table)->where('id', $id)->update([$column => $column === 'hidden_at' ? null : false]);
        $check($show(), 200, "$table.$column restoration");
        $checkSync(true);
        echo "PASS: real Flarum $table.$column scope denies manager/owner read, move and attach; restoration works\n";
    }

    // Model the public extension-scoper contract, not any specific private-
    // discussion package. Both discussion and post custom scopes must survive
    // the extension's direct endpoint queries, including manager actors.
    foreach ([Discussion::class => $discussionId, Post::class => $postId] as $model => $id) {
        $scopeState = (object) ['blocked' => false];
        $table = $model === Discussion::class ? 'discussions' : 'posts';
        $model::registerVisibilityScoper(function ($scopeActor, $query) use ($scopeState, $userId, $table, $id) {
            if ($scopeState->blocked && (int) $scopeActor->id === (int) $userId) $query->where($table.'.id', '!=', $id);
        }, 'view');
        $check($show(), 200, $table.' custom scope positive control');
        $scopeState->blocked = true;
        $check($show(), 404, $table.' custom scope read');
        $checkSync(false);
        $check($move(), 404, $table.' custom scope movement');
        $check($attach(), 403, $table.' custom scope attachment');
        $check($presentation(), 403, $table.' custom scope presentation');
        $scopeState->blocked = false;
        $check($show(), 200, $table.' custom scope restoration');
        $checkSync(true);
        echo "PASS: real Flarum $table extension visibility scoper retained\n";
    }
} finally {
    $db->rollBack();
}
$after = array_map(fn ($table) => $db->table($table)->count(), $tables);
if ($before !== $after || $db->transactionLevel() !== 0) throw new LogicException('Fixture rollback did not retain original counts');
echo "PASS: runtime privacy fixtures rolled back; original table row counts retained\n";
