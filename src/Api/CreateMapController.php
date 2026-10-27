<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use ChakChakman\InteractiveMaps\Images\MapBackgrounds;
use ChakChakman\InteractiveMaps\Images\BackgroundUploadException;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class CreateMapController extends ApiController implements RequestHandlerInterface
{
    public function __construct(private MapBackgrounds $backgrounds) {}

    public function handle(Request $request): Response
    {
        if (!$this->manage($request)) return $this->error('Создавать карты могут только назначенные мастера', 403);
        $data = $this->data($request);
        if (!$data && !$request->getUploadedFiles() && str_starts_with($request->getHeaderLine('Content-Type'), 'multipart/form-data')) {
            return $this->error('PHP не получил файл. Проверьте лимиты upload_max_filesize и post_max_size.', 413);
        }
        if (!is_string($data['title'] ?? null)) return $this->error('Укажите название карты строкой.');
        $title = trim($data['title']);
        $url = $data['backgroundUrl'] ?? '';
        $file = $request->getUploadedFiles()['image'] ?? null;
        if ($file !== null && !$file instanceof UploadedFileInterface) return $this->error('Выберите файл PNG или JPEG.', 422);
        if ($title === '' || mb_strlen($title) > 160 || ($file === null && !$this->url($url))) {
            return $this->error('Укажите название (до 160 символов) и адрес изображения http(s) либо /path');
        }
        $map = new Map();
        $map->title = $title;
        $map->background_url = $file === null ? $url : '/pending-map-background';
        $map->creator_id = \Flarum\Http\RequestUtil::getActor($request)->id;
        $map->grid_size = 64;
        $map->grid_enabled = true;
        $map->snap_to_grid = true;
        $map->grid_offset_x = 0;
        $map->grid_offset_y = 0;
        $filename = null;
        try {
            $prepared = $file === null ? null : $this->backgrounds->prepare($file);
            return $map->getConnection()->transaction(function () use ($map, $prepared, &$filename) {
                $map->save();
                if ($prepared !== null) {
                    $filename = $this->backgrounds->store((int) $map->id, $prepared);
                    $map->background_url = $this->backgrounds->url((int) $map->id, $filename);
                    $map->save();
                }
                return $this->document($this->mapResource($map), 201);
            });
        } catch (\Throwable $error) {
            if ($filename !== null) $this->backgrounds->discardNewFile((int) $map->id, $filename);
            if ($error instanceof BackgroundUploadException) return $this->error($error->getMessage(), $error->status);
            throw $error;
        }
    }
}
