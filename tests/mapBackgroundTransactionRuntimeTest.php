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
$backgrounds = $container->make(\ChakChakman\InteractiveMaps\Images\MapBackgrounds::class);
$paths = $container->make(\Flarum\Foundation\Paths::class);
$files = fn () => glob($paths->storage.'/interactive-maps/backgrounds/*/*') ?: [];
$beforeFiles = $files();
$db->beginTransaction();
try {
    $admin = User::where('username', 'smokeadmin')->firstOrFail();
    $suffix = bin2hex(random_bytes(5));
    $title = 'Rollback upload '.$suffix;
    $surface = imagecreatetruecolor(8, 6); ob_start(); imagepng($surface); $png = ob_get_clean(); imagedestroy($surface);
    $request = function ($attributes) use ($admin, $png) {
        $stream = new \Laminas\Diactoros\Stream('php://temp', 'w+'); $stream->write($png); $stream->rewind();
        return RequestUtil::withActor((new ServerRequest)->withParsedBody($attributes)
            ->withUploadedFiles(['image' => new \Laminas\Diactoros\UploadedFile($stream, strlen($png), UPLOAD_ERR_OK)]), $admin);
    };
    $fail = true;
    \ChakChakman\InteractiveMaps\Models\Map::getEventDispatcher()->listen(
        'eloquent.saved: '.\ChakChakman\InteractiveMaps\Models\Map::class,
        function ($map) use (&$fail, $title) {
            if ($fail && $map->title === $title && str_contains($map->background_url, '/background/')) throw new LogicException('Synthetic upload persistence failure');
        }
    );
    $count = $db->table('chak_maps')->count();
    $expectFailure = function ($action) {
        try { $action(); throw new LogicException('Expected persistence failure'); }
        catch (LogicException $error) { if ($error->getMessage() !== 'Synthetic upload persistence failure') throw $error; }
    };
    $expectFailure(fn () => (new \ChakChakman\InteractiveMaps\Api\CreateMapController($backgrounds))->handle($request(['title' => $title])));
    if ($db->table('chak_maps')->count() !== $count || $files() !== $beforeFiles) throw new LogicException('Create rollback left a map/file');
    $badStorage = new \ChakChakman\InteractiveMaps\Images\MapBackgrounds(
        new \Flarum\Foundation\Paths(['base' => '/tmp', 'public' => '/tmp', 'storage' => '/dev/null']),
        $container->make(\Intervention\Image\ImageManager::class), $container->make(\Flarum\Http\UrlGenerator::class)
    );
    $result = (new \ChakChakman\InteractiveMaps\Api\CreateMapController($badStorage))->handle($request(['title' => $title]));
    if ($result->getStatusCode() !== 500 || $db->table('chak_maps')->count() !== $count) throw new LogicException('Storage failure left a map');
    $mapId = $db->table('chak_maps')->insertGetId(['title' => $title, 'background_url' => '/old.svg', 'creator_id' => $admin->id]);
    $expectFailure(fn () => (new \ChakChakman\InteractiveMaps\Api\UploadMapBackgroundController($backgrounds))->handle($request([])->withQueryParams(['id' => $mapId])));
    if ($db->table('chak_maps')->find($mapId)->background_url !== '/old.svg' || $files() !== $beforeFiles) throw new LogicException('Replace rollback damaged old background');
    $fail = false;
    echo "PASS: create/replace persistence failure removes only the new upload; storage failure leaves no map\n";
} finally {
    foreach (array_diff($files(), $beforeFiles) as $path) unlink($path);
    $db->rollBack();
}
$after = array_map(fn ($table) => $db->table($table)->count(), $tables);
if ($before !== $after || $db->transactionLevel() !== 0) throw new LogicException('Upload transaction fixtures changed original counts');
echo "PASS: transaction fixtures rolled back and original table counts retained\n";
