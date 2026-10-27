<?php
// Pure processing/storage fixtures: temporary directory only, no forum data.
require $argv[1];
use ChakChakman\InteractiveMaps\Images\MapBackgrounds;
use ChakChakman\InteractiveMaps\Images\BackgroundUploadException;
use Flarum\Foundation\Paths;
use Flarum\Http\UrlGenerator;
use Intervention\Image\ImageManager;
use Laminas\Diactoros\Stream;
use Laminas\Diactoros\UploadedFile;

$root = sys_get_temp_dir().'/maps-background-test-'.bin2hex(random_bytes(6));
mkdir($root, 0700);
$urls = (new ReflectionClass(UrlGenerator::class))->newInstanceWithoutConstructor();
$store = new MapBackgrounds(new Paths(['base' => $root, 'public' => $root.'/public', 'storage' => $root]), ImageManager::gd(), $urls);
$file = function (string $bytes, ?int $size = null, int $error = UPLOAD_ERR_OK) {
    $stream = new Stream('php://temp', 'w+'); $stream->write($bytes); $stream->rewind();
    return new UploadedFile($stream, $size ?? strlen($bytes), $error, '../../unsafe.php', 'image/svg+xml');
};
$image = imagecreatetruecolor(8, 6);
ob_start(); imagepng($image); $png = ob_get_clean();
ob_start(); imagejpeg($image); $jpeg = ob_get_clean();
imagedestroy($image);
$deny = function ($upload, int $status) use ($store) {
    try { $store->prepare($upload); throw new LogicException('Invalid upload accepted'); }
    catch (BackgroundUploadException $error) { if ($error->status !== $status) throw $error; }
};
try {
    foreach ([$png => 'png', $jpeg => 'jpg'] as $bytes => $extension) {
        $prepared = $store->prepare($file($bytes.'<?php injected_payload ?>'));
        if ($prepared['extension'] !== $extension || str_contains($prepared['bytes'], 'injected_payload')) throw new LogicException('Untrusted upload retained');
        $size = getimagesizefromstring($prepared['bytes']);
        if ($size[0] !== 8 || $size[1] !== 6) throw new LogicException('Image dimensions changed');
        $name = $store->store(9, $prepared);
        if (!preg_match('/^[a-f0-9]{32}\.(png|jpg)$/D', $name) || file_get_contents($store->path(9, $name)) !== $prepared['bytes']) throw new LogicException('Unsafe filename/storage');
        if ($store->path(9, '../'.$name) !== null || $store->path(0, $name) !== null) throw new LogicException('Traversal accepted');
        $store->discardNewFile(9, $name);
    }
    $deny($file(''), 422);
    $deny($file('<svg xmlns="http://www.w3.org/2000/svg"/>'), 422);
    $deny($file('not an image'), 422);
    $deny($file(substr($png, 0, 24)), 422);
    $deny($file($png, MapBackgrounds::MAX_BYTES + 1), 413);
    $deny($file(str_repeat('x', MapBackgrounds::MAX_BYTES + 1), 1), 413);
    $deny($file($png, null, UPLOAD_ERR_INI_SIZE), 413);
    $wide = substr_replace($png, pack('N', 8193), 16, 4);
    $deny($file($wide), 413);
    $apng = substr($png, 0, 33).pack('N', 8).'acTL'.pack('NN', 1000, 0).str_repeat("\0", 4).substr($png, 33);
    $deny($file($apng), 422);
    foreach (['128M' => 134217728, '1G' => 1073741824, '512K' => 524288, '-1' => -1] as $value => $expected) {
        if (MapBackgrounds::memoryLimitBytes((string) $value) !== $expected) throw new LogicException('Memory limit parsing');
    }
    $oldLimit = ini_get('memory_limit');
    try { ini_set('memory_limit', (string) (memory_get_usage(true) + 1048576)); $deny($file($png), 413); }
    finally { ini_set('memory_limit', $oldLimit); }
    echo "PASS: PNG/JPEG decoded and reencoded, bounded streams/dimensions/memory, APNG/invalid/error rejection, private random paths\n";
} finally {
    foreach (glob($root.'/interactive-maps/backgrounds/9/*') ?: [] as $path) unlink($path);
    foreach ([$root.'/interactive-maps/backgrounds/9', $root.'/interactive-maps/backgrounds', $root.'/interactive-maps', $root] as $path) if (is_dir($path)) rmdir($path);
}
