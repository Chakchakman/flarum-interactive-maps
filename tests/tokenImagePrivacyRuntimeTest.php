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
set_exception_handler(function (\Throwable $error) { fwrite(STDERR, (string) $error . PHP_EOL); exit(1); });

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
$store = $container->make(\ChakChakman\InteractiveMaps\Images\TokenImages::class);
$filename = null; $mapId = null;
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
    $actor = User::findOrFail($userId);
    if (MapPermissions::canManage($actor)) throw new LogicException('Ordinary viewer fixture required');
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
    $surface = imagecreatetruecolor(8, 6);
    ob_start(); imagepng($surface); $png = ob_get_clean(); imagedestroy($surface);
    $stream = new \Laminas\Diactoros\Stream('php://temp', 'w+'); $stream->write($png); $stream->rewind();
    $prepared = $store->prepare(new \Laminas\Diactoros\UploadedFile($stream, strlen($png), UPLOAD_ERR_OK));
    $filename = $store->store($tokenId, $prepared);
    $db->table('chak_tokens')->where('id', $tokenId)->update(['image_url' => $store->url($tokenId, $filename)]);
    $read = fn ($reader = null, $name = null) => (new \ChakChakman\InteractiveMaps\Api\ShowTokenImageController($store))->handle(
        RequestUtil::withActor((new ServerRequest)->withQueryParams(['id' => $tokenId, 'file' => $name ?? pathinfo($filename, PATHINFO_FILENAME)]), $reader ?? $actor)
    );
    $check = function ($response, int $status) {
        if ($response->getStatusCode() !== $status || $response->getHeaderLine('Cache-Control') !== 'private, no-store') {
            throw new LogicException('Unexpected protected-image response');
        }
        $body = (string) $response->getBody();
        if ($status === 200) {
            if ($response->getHeaderLine('Content-Type') !== 'image/png' || $response->getHeaderLine('X-Content-Type-Options') !== 'nosniff'
                || !str_starts_with($body, "\x89PNG")) throw new LogicException('Invalid protected image');
        } elseif (str_starts_with($body, "\x89PNG")) throw new LogicException('Protected bytes leaked');
    };
    $check($read(), 200);
    $check($read(new \Flarum\User\Guest), 403);
    $check($read($admin, '../'.$filename), 404);
    foreach ([['posts', 'hidden_at', $now], ['discussions', 'hidden_at', $now],
        ['posts', 'is_private', true], ['discussions', 'is_private', true]] as [$table, $column, $value]) {
        $id = $table === 'posts' ? $postId : $discussionId;
        $db->table($table)->where('id', $id)->update([$column => $value]);
        $check($read(), 404); $check($read($admin), 200);
        $db->table($table)->where('id', $id)->update([$column => $column === 'hidden_at' ? null : false]);
        $check($read(), 200);
        echo "PASS: uploaded token image retains $table.$column scope; authorized manager preview works\n";
    }
    foreach ([Discussion::class => $discussionId, Post::class => $postId] as $model => $id) {
        $state = (object) ['blocked' => false];
        $table = $model === Discussion::class ? 'discussions' : 'posts';
        $model::registerVisibilityScoper(function ($reader, $query) use ($state, $userId, $table, $id) {
            if ($state->blocked && (int) $reader->id === (int) $userId) $query->where($table.'.id', '!=', $id);
        }, 'view');
        $state->blocked = true; $check($read(), 404);
        $state->blocked = false; $check($read(), 200);
        echo "PASS: protected token image retains $table extension scoper\n";
    }
    Post::registerVisibilityScoper(function ($reader, $query) use ($userId) {
        if ((int) $reader->id === (int) $userId) {
            $query->leftJoin('users as image_scope_author', 'image_scope_author.id', '=', 'posts.user_id');
        }
    }, 'view');
    $check($read(), 200);
    echo "PASS: protected token image supports a visibility scoper joining a table with its own id column\n";
    $db->table('chak_map_embeds')->where('post_id', $postId)->delete(); $check($read(), 404);
    $db->table('chak_tokens')->where('id', $tokenId)->update(['image_url' => '/replacement.png']); $check($read($admin), 404);
} finally {
    if ($filename !== null) $store->discardNewFile($tokenId, $filename);
    $db->rollBack();
}
$after = array_map(fn ($table) => $db->table($table)->count(), $tables);
if ($before !== $after || $db->transactionLevel() !== 0) throw new LogicException('Image fixture rollback changed row counts');
echo "PASS: private token-image fixtures rolled back and new test file removed\n";
