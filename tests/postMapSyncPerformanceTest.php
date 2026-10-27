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

use ChakChakman\InteractiveMaps\Api\SyncPostMapsController;
use ChakChakman\InteractiveMaps\Access\MapPermissions;
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
    // Same authorized map in twenty posts: query count must not grow per post.
    $ids = [$postId];
    for ($i = 2; $i <= 20; $i++) {
        $id = $db->table('posts')->insertGetId([
            'discussion_id' => $discussionId, 'number' => $i, 'created_at' => $now,
            'user_id' => $admin->id, 'type' => 'comment', 'content' => '<t>Performance fixture</t>',
        ]);
        $ids[] = $id;
        $db->table('chak_map_embeds')->insert(['post_id' => $id, 'map_id' => $mapId, 'created_by' => $admin->id]);
    }
    for ($i = 1; $i < 100; $i++) {
        $db->table('chak_tokens')->insert([
            'map_id' => $mapId, 'name' => 'Performance token '.$i, 'image_url' => '/scope-only.svg',
            'owner_user_id' => $userId, 'x' => 0.25, 'y' => 0.75,
        ]);
    }
    $sync = fn ($postIds) => (new SyncPostMapsController)->handle(RequestUtil::withActor(
        (new ServerRequest)->withQueryParams(['postIds' => implode(',', $postIds)]), $actor
    ));
    $sync([$postId]); // Warm actor permission/group caches equally for both measurements.
    $measure = function ($postIds) use ($db, $sync, $mapId) {
        $db->flushQueryLog();
        $db->enableQueryLog();
        $start = hrtime(true);
        try {
            $response = $sync($postIds);
            $queries = $db->getQueryLog();
        } finally {
            $db->disableQueryLog();
        }
        $elapsed = (hrtime(true) - $start) / 1e6;
        $body = (string) $response->getBody();
        $resources = json_decode($body, true)['data'] ?? [];
        if ($response->getStatusCode() !== 200 || count($resources) !== count($postIds)) {
            throw new LogicException('Incomplete performance response');
        }
        foreach ($resources as $index => $resource) {
            $attrs = $resource['attributes'];
            if ($resource['id'] !== (string) $postIds[$index] || !$attrs['available']
                || $attrs['mapId'] !== $mapId || count($attrs['tokens']) !== 100) {
                throw new LogicException('Performance optimization lost authorized data');
            }
        }
        return ['queries' => count($queries), 'milliseconds' => round($elapsed, 2), 'bytes' => strlen($body)];
    };
    $single = $measure([$postId]);
    $batch = $measure($ids);
    echo json_encode(['singlePost' => $single, 'twentyPosts' => $batch], JSON_PRETTY_PRINT).PHP_EOL;
    if (!in_array('--measure-only', $argv, true) && $batch['queries'] > $single['queries'] + 1) {
        throw new LogicException('Batch query count grows per post; repeated visibility checks or lazy relations');
    }
} finally {
    $db->disableQueryLog();
    $db->flushQueryLog();
    $db->rollBack();
}
$after = array_map(fn ($table) => $db->table($table)->count(), $tables);
if ($before !== $after || $db->transactionLevel() !== 0) throw new LogicException('Fixture rollback did not retain original counts');
echo "PASS: batch performance fixtures rolled back; original row counts retained\n";
