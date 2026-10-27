<?php

namespace ChakChakman\InteractiveMaps\Images;

use Flarum\Foundation\Paths;
use Flarum\Http\UrlGenerator;
use Intervention\Image\ImageManager;
use Intervention\Image\Exceptions\DecoderException;
use Intervention\Image\Exceptions\EncoderException;
use Psr\Http\Message\UploadedFileInterface;

/** Private raster storage. Only new request-owned files are ever removed here. */
final class MapBackgrounds
{
    public const MAX_BYTES = 10 * 1024 * 1024;
    public const MAX_PIXELS = 16 * 1024 * 1024;
    public const MAX_SIDE = 8192;

    public function __construct(private Paths $paths, private ImageManager $images, private UrlGenerator $urls) {}

    public function prepare(UploadedFileInterface $file): array
    {
        if ($file->getError() !== UPLOAD_ERR_OK) {
            throw new BackgroundUploadException('Не удалось получить файл. Проверьте размер и лимит загрузки PHP.', 413);
        }
        if (($file->getSize() ?? 0) > self::MAX_BYTES) throw new BackgroundUploadException('Изображение: не более 10 МиБ.', 413);
        $stream = $file->getStream();
        if ($stream->isSeekable()) $stream->rewind();
        $bytes = '';
        while (!$stream->eof() && strlen($bytes) <= self::MAX_BYTES) {
            $part = $stream->read(min(65536, self::MAX_BYTES + 1 - strlen($bytes)));
            if ($part === '' && !$stream->eof()) throw new BackgroundUploadException('Не удалось прочитать изображение.');
            $bytes .= $part;
        }
        if (strlen($bytes) > self::MAX_BYTES) throw new BackgroundUploadException('Изображение: не более 10 МиБ.', 413);
        if ($bytes === '') throw new BackgroundUploadException('Выберите непустое изображение PNG или JPEG.');
        $size = @getimagesizefromstring($bytes);
        if (!$size || !in_array($size[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
            throw new BackgroundUploadException('Выберите настоящее изображение PNG или JPEG.');
        }
        if ($size[2] === IMAGETYPE_PNG) {
            // Reject APNG before a decoder can allocate one surface per frame.
            for ($offset = 8, $length = strlen($bytes); $offset + 12 <= $length;) {
                $chunkLength = unpack('N', substr($bytes, $offset, 4))[1];
                if (substr($bytes, $offset + 4, 4) === 'acTL') throw new BackgroundUploadException('Используйте статичное PNG или JPEG.');
                if ($chunkLength > $length - $offset - 12) throw new BackgroundUploadException('Изображение повреждено.');
                $end = substr($bytes, $offset + 4, 4) === 'IEND';
                $offset += $chunkLength + 12;
                if ($end) break;
            }
        }
        $pixels = $size[0] * $size[1];
        if ($size[0] < 1 || $size[1] < 1 || max($size[0], $size[1]) > self::MAX_SIDE || $pixels > self::MAX_PIXELS) {
            throw new BackgroundUploadException('Изображение: до 8192 px по стороне и до 16 мегапикселей (16 × 1024²).', 413);
        }
        $limit = self::memoryLimitBytes((string) ini_get('memory_limit'));
        // Conservative allowance for decoded surfaces, encoding and PHP strings.
        if ($limit > 0 && memory_get_usage(true) + $pixels * 16 + strlen($bytes) * 2 + 16 * 1024 * 1024 > $limit) {
            throw new BackgroundUploadException('Недостаточно памяти PHP для этого разрешения. Выберите изображение меньшего размера.', 413);
        }
        try {
            $image = @$this->images->read($bytes);
            if ($image->isAnimated()) throw new BackgroundUploadException('Используйте статичное PNG или JPEG.');
            $png = $size[2] === IMAGETYPE_PNG;
            $encoded = (string) ($png ? $image->toPng() : $image->toJpeg(quality: 90, strip: true));
        } catch (DecoderException | EncoderException $error) {
            throw new BackgroundUploadException('Изображение повреждено или не поддерживается.');
        }
        if (strlen($encoded) > self::MAX_BYTES) throw new BackgroundUploadException('Обработанное изображение превышает 10 МиБ.', 413);
        return ['bytes' => $encoded, 'extension' => $png ? 'png' : 'jpg'];
    }

    public static function memoryLimitBytes(string $value): int
    {
        if (!preg_match('/^\s*(\d+)\s*([KMG]?)\s*$/iD', $value, $parts)) return -1;
        return (int) $parts[1] * (1024 ** (array_search(strtoupper($parts[2]), ['', 'K', 'M', 'G'], true)));
    }

    public function store(int $mapId, array $prepared): string
    {
        $directory = $this->paths->storage.'/interactive-maps/backgrounds/'.$mapId;
        if (!is_dir($directory) && !@mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new BackgroundUploadException('Не удалось сохранить изображение. Проверьте доступность хранилища Flarum.', 500);
        }
        $filename = bin2hex(random_bytes(16)).'.'.$prepared['extension'];
        $path = $directory.'/'.$filename;
        $handle = @fopen($path, 'xb');
        if (!$handle) throw new BackgroundUploadException('Не удалось сохранить изображение.', 500);
        try {
            @chmod($path, 0640);
            $offset = 0;
            $length = strlen($prepared['bytes']);
            while ($offset < $length) {
                $written = @fwrite($handle, substr($prepared['bytes'], $offset));
                if (!$written) throw new BackgroundUploadException('Не удалось сохранить изображение. Проверьте свободное место.', 500);
                $offset += $written;
            }
            if (!@fflush($handle)) throw new BackgroundUploadException('Не удалось сохранить изображение. Проверьте свободное место.', 500);
        } catch (\Throwable $error) {
            fclose($handle);
            @unlink($path); // This file was exclusively created by this request.
            throw $error;
        }
        fclose($handle);
        return $filename;
    }

    public function url(int $mapId, string $filename): string
    {
        return parse_url($this->urls->to('api')->route('chak.maps.background', ['id' => $mapId, 'file' => $filename]), PHP_URL_PATH);
    }

    public function path(int $mapId, string $filename): ?string
    {
        if ($mapId < 1 || !preg_match('/^[a-f0-9]{32}\.(png|jpg)$/D', $filename)) return null;
        $path = $this->paths->storage.'/interactive-maps/backgrounds/'.$mapId.'/'.$filename;
        return is_file($path) && is_readable($path) ? $path : null;
    }

    public function discardNewFile(int $mapId, string $filename): void
    {
        // Only call for an uncommitted file generated by store() in this request.
        if ($path = $this->path($mapId, $filename)) @unlink($path);
    }
}
