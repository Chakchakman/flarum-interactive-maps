<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use ChakChakman\InteractiveMaps\Models\Token;
use Flarum\User\User;
use ChakChakman\InteractiveMaps\Images\TokenImages;
use ChakChakman\InteractiveMaps\Images\BackgroundUploadException;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class CreateTokenController extends ApiController implements RequestHandlerInterface
{
    public function __construct(private TokenImages $images) {}

    public function handle(Request $request): Response
    {
        if (!$this->manage($request)) return $this->error('Нет прав', 403);
        $map = Map::find($this->id($request));
        if (!$map) return $this->error('Карта не найдена', 404);
        $multipart = str_starts_with(strtolower($request->getHeaderLine('Content-Type')), 'multipart/form-data');
        $data = $multipart ? (is_array($request->getParsedBody()) ? $request->getParsedBody() : []) : $this->data($request);
        if ($multipart && !$data && !$request->getUploadedFiles()) return $this->error('PHP не получил файл. Проверьте лимиты загрузки.', 413);
        if (!is_string($data['name'] ?? null) || !is_string($data['ownerUsername'] ?? '')) return $this->error('Укажите имя фишки и username строками.');
        $name = trim($data['name']);
        $url = $data['imageUrl'] ?? '';
        $file = $request->getUploadedFiles()['image'] ?? null;
        if ($file !== null && !$file instanceof UploadedFileInterface) return $this->error('Выберите PNG или JPEG.', 422);
        if ($name === '' || mb_strlen($name) > 160 || ($file === null && !$this->url($url))) {
            return $this->error('Укажите имя фишки и ссылку на PNG/JPG');
        }
        $owner = null;
        $username = trim((string) ($data['ownerUsername'] ?? ''));
        if ($username !== '') {
            $owner = User::where('username', $username)->first();
            if (!$owner) return $this->error('Пользователь Flarum не найден');
        }
        $token = new Token();
        $token->map_id = $map->id;
        $token->name = $name;
        $token->image_url = $file === null ? $url : '/pending-token-image';
        $token->x = 0.5;
        $token->y = 0.5;
        $token->owner_user_id = $owner ? $owner->id : null;
        $filename = null;
        try {
            $prepared = $file === null ? null : $this->images->prepare($file);
            return $token->getConnection()->transaction(function () use ($token, $map, $prepared, &$filename) {
                if (!Map::query()->lockForUpdate()->find($map->id)) return $this->error('Карта не найдена', 404);
                $token->save();
                if ($prepared !== null) {
                    $filename = $this->images->store((int) $token->id, $prepared);
                    $token->image_url = $this->images->url((int) $token->id, $filename);
                    $token->save();
                }
                return $this->document($this->tokenResource($token), 201);
            });
        } catch (\Throwable $error) {
            if ($filename !== null) {
                try {
                    if (!Token::query()->whereKey($token->id)->where('image_url', $this->images->url((int) $token->id, $filename))->exists()) $this->images->discardNewFile((int) $token->id, $filename);
                } catch (\Throwable $unavailable) { /* Keep a possibly committed file until the database is available. */ }
            }
            if ($error instanceof BackgroundUploadException) return $this->error($error->getMessage(), $error->status);
            throw $error;
        }
    }
}
