<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Images\BackgroundUploadException;
use ChakChakman\InteractiveMaps\Images\TokenImages;
use ChakChakman\InteractiveMaps\Models\Token;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

final class UploadTokenImageController extends ApiController implements RequestHandlerInterface
{
    public function __construct(private TokenImages $images) {}

    public function handle(Request $request): Response
    {
        if (!$this->manage($request)) return $this->error('Нет прав на загрузку изображения фишки', 403);
        if (!Token::query()->whereKey($this->id($request))->exists()) return $this->error('Фишка не найдена', 404);
        $file = $request->getUploadedFiles()['image'] ?? null;
        if (!$file instanceof UploadedFileInterface) {
            $discarded = !$request->getUploadedFiles() && !$request->getParsedBody() && str_starts_with($request->getHeaderLine('Content-Type'), 'multipart/form-data');
            return $this->error($discarded ? 'PHP не получил файл. Проверьте лимиты загрузки сервера.' : 'Выберите файл PNG или JPEG.', $discarded ? 413 : 422);
        }
        $filename = null;
        $created = [];
        $id = $this->id($request);
        try {
            $prepared = $this->images->prepare($file);
            $response = Token::query()->getConnection()->transaction(function () use ($id, $prepared, &$filename, &$created) {
                $filename = null;
                $token = Token::query()->whereHas('map')->lockForUpdate()->find($id);
                if (!$token) return $this->error('Фишка не найдена', 404);
                $filename = $this->images->store($id, $prepared);
                $created[] = $filename;
                $token->image_url = $this->images->url($id, $filename);
                $token->save();
                return $this->document($this->tokenResource($token));
            }, 3);
            foreach ($created as $file) if ($file !== $filename) $this->images->discardNewFile($id, $file);
            return $response;
        } catch (\Throwable $error) {
            foreach ($created as $file) {
                try {
                    if (!Token::query()->whereKey($id)->where('image_url', $this->images->url($id, $file))->exists()) $this->images->discardNewFile($id, $file);
                } catch (\Throwable $unavailable) { /* Keep files if commit outcome cannot be checked. */ }
            }
            if ($error instanceof BackgroundUploadException) return $this->error($error->getMessage(), $error->status);
            throw $error;
        }
    }
}
