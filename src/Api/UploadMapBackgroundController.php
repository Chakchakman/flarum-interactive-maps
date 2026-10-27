<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Images\BackgroundUploadException;
use ChakChakman\InteractiveMaps\Images\MapBackgrounds;
use ChakChakman\InteractiveMaps\Models\Map;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

final class UploadMapBackgroundController extends ApiController implements RequestHandlerInterface
{
    public function __construct(private MapBackgrounds $backgrounds) {}

    public function handle(Request $request): Response
    {
        if (!$this->manage($request)) return $this->error('Нет прав на загрузку фона', 403);
        if (!Map::query()->whereKey($this->id($request))->exists()) return $this->error('Карта не найдена', 404);
        $file = $request->getUploadedFiles()['image'] ?? null;
        if (!$file instanceof UploadedFileInterface) {
            $discarded = !$request->getUploadedFiles() && !$request->getParsedBody() && str_starts_with($request->getHeaderLine('Content-Type'), 'multipart/form-data');
            return $this->error($discarded ? 'PHP не получил файл. Проверьте лимиты загрузки сервера.' : 'Выберите файл PNG или JPEG.', $discarded ? 413 : 422);
        }
        $filename = null;
        $id = $this->id($request);
        try {
            $prepared = $this->backgrounds->prepare($file);
            return Map::query()->getConnection()->transaction(function () use ($id, $prepared, &$filename) {
                $map = Map::query()->lockForUpdate()->find($id);
                if (!$map) return $this->error('Карта не найдена', 404);
                $filename = $this->backgrounds->store($id, $prepared);
                $map->background_url = $this->backgrounds->url($id, $filename);
                $map->save();
                return $this->document($this->mapResource($map));
            });
        } catch (\Throwable $error) {
            if ($filename !== null) $this->backgrounds->discardNewFile($id, $filename);
            if ($error instanceof BackgroundUploadException) return $this->error($error->getMessage(), $error->status);
            throw $error;
        }
    }
}
