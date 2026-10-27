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
$backgrounds = $container->make(\ChakChakman\InteractiveMaps\Images\TokenImages::class);
$paths = $container->make(\Flarum\Foundation\Paths::class);
$files = fn () => glob($paths->storage.'/interactive-maps/tokens/*/*') ?: [];
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
    $mapId = $db->table('chak_maps')->insertGetId(['title' => $title, 'background_url' => '/old.svg', 'creator_id' => $admin->id]);
    $fail = true;
    \ChakChakman\InteractiveMaps\Models\Token::getEventDispatcher()->listen(
        'eloquent.saved: '.\ChakChakman\InteractiveMaps\Models\Token::class,
        function ($map) use (&$fail, $title) {
            if ($fail && $map->name === $title && str_contains($map->image_url, '/image/')) throw new LogicException('Synthetic upload persistence failure');
        }
    );
    $count = $db->table('chak_tokens')->count();
    $rawBody = new class('php://temp', 'w+') extends \Laminas\Diactoros\Stream {
        public function __toString(): string { throw new LogicException('Raw rejected multipart body must not be read'); }
    };
    $discarded = $request([])->withUploadedFiles([])->withParsedBody(null)
        ->withHeader('Content-Type', 'multipart/form-data; boundary=discarded')->withBody($rawBody)->withQueryParams(['id' => $mapId]);
    $rejected = (new \ChakChakman\InteractiveMaps\Api\CreateTokenController($backgrounds))->handle($discarded);
    if ($rejected->getStatusCode() !== 413) throw new LogicException('Discarded PHP multipart body was not rejected');

    $expectFailure = function ($action) {
        try { $action(); throw new LogicException('Expected persistence failure'); }
        catch (LogicException $error) { if ($error->getMessage() !== 'Synthetic upload persistence failure') throw $error; }
    };
    $expectFailure(fn () => (new \ChakChakman\InteractiveMaps\Api\CreateTokenController($backgrounds))->handle($request(['name' => $title])->withQueryParams(['id' => $mapId])));
    if ($db->table('chak_tokens')->count() !== $count || $files() !== $beforeFiles) throw new LogicException('Create rollback left a map/file');
    $badStorage = new \ChakChakman\InteractiveMaps\Images\TokenImages(
        new \Flarum\Foundation\Paths(['base' => '/tmp', 'public' => '/tmp', 'storage' => '/dev/null']),
        $container->make(\Intervention\Image\ImageManager::class), $container->make(\Flarum\Http\UrlGenerator::class)
    );
    $result = (new \ChakChakman\InteractiveMaps\Api\CreateTokenController($badStorage))->handle($request(['name' => $title])->withQueryParams(['id' => $mapId]));
    if ($result->getStatusCode() !== 500 || $db->table('chak_tokens')->count() !== $count) throw new LogicException('Storage failure left a map');
    $tokenId = $db->table('chak_tokens')->insertGetId(['map_id' => $mapId, 'name' => $title, 'image_url' => '/old.svg', 'owner_user_id' => $admin->id, 'x' => 0.25, 'y' => 0.75]);
    $beforeToken = (array) $db->table('chak_tokens')->find($tokenId);
    $expectFailure(fn () => (new \ChakChakman\InteractiveMaps\Api\UploadTokenImageController($backgrounds))->handle($request([])->withQueryParams(['id' => $tokenId])));
    if ((array) $db->table('chak_tokens')->find($tokenId) !== $beforeToken || $files() !== $beforeFiles) throw new LogicException('Replace rollback damaged old token');
    $fail = false;
    echo "PASS: create/replace persistence failure removes only the new upload; storage failure leaves no map\n";
} finally {
    foreach (array_diff($files(), $beforeFiles) as $path) unlink($path);
    $db->rollBack();
}
// Retry requires a top-level transaction; nested transactions correctly defer
// deadlock recovery to their caller. Only these newly created synthetic rows
// are committed briefly and removed by exact ID + fixture name afterwards.
$mapId = $db->table('chak_maps')->insertGetId(['title' => $title, 'background_url' => '/old.svg', 'creator_id' => $admin->id]);
$tokenId = $db->table('chak_tokens')->insertGetId(['map_id' => $mapId, 'name' => $title, 'image_url' => '/old.svg', 'owner_user_id' => $admin->id, 'x' => 0.25, 'y' => 0.75]);
try {
    $retryAttempts = 0;
    \ChakChakman\InteractiveMaps\Models\Token::getEventDispatcher()->listen(
        'eloquent.saved: '.\ChakChakman\InteractiveMaps\Models\Token::class,
        function ($token) use (&$retryAttempts, $title) {
            if ($token->name === $title && str_contains($token->image_url, '/image/') && ++$retryAttempts === 1) {
                throw new PDOException('Deadlock found when trying to get lock; try restarting transaction');
            }
        }
    );
    $version = \ChakChakman\InteractiveMaps\Models\TokenMoveVersion::forToken(\ChakChakman\InteractiveMaps\Models\Token::findOrFail($tokenId));
    $success = (new \ChakChakman\InteractiveMaps\Api\UploadTokenImageController($backgrounds))->handle($request([])->withQueryParams(['id' => $tokenId]));
    if ($success->getStatusCode() !== 200 || $retryAttempts !== 2 || count(array_diff($files(), $beforeFiles)) !== 1) throw new LogicException('Retry left duplicate files or did not complete');
    $saved = \ChakChakman\InteractiveMaps\Models\Token::findOrFail($tokenId);
    if ((float) $saved->x !== 0.25 || (float) $saved->y !== 0.75 || (int) $saved->owner_user_id !== (int) $admin->id || \ChakChakman\InteractiveMaps\Models\TokenMoveVersion::forToken($saved) !== $version) throw new LogicException('Cosmetic upload changed token state');
    echo "PASS: bounded transaction retry retains exactly one new image and preserves move version/owner/coordinates\n";

} finally {
    foreach (glob($paths->storage.'/interactive-maps/tokens/'.$tokenId.'/*') ?: [] as $path) unlink($path);
    $db->table('chak_tokens')->where('id', $tokenId)->where('name', $title)->delete();
    $db->table('chak_maps')->where('id', $mapId)->where('title', $title)->delete();
}
$after = array_map(fn ($table) => $db->table($table)->count(), $tables);
if ($before !== $after || $db->transactionLevel() !== 0) throw new LogicException('Upload transaction fixtures changed original counts');
echo "PASS: transaction fixtures rolled back and original table counts retained\n";
