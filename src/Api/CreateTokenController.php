<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use ChakChakman\InteractiveMaps\Models\Token;
use Flarum\User\User;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class CreateTokenController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        if (!$this->admin($request)) return $this->error('Нет прав', 403);
        $map = Map::find($this->id($request));
        if (!$map) return $this->error('Карта не найдена', 404);
        $data = $this->data($request);
        $name = trim((string) ($data['name'] ?? ''));
        $url = $data['imageUrl'] ?? '';
        if ($name === '' || mb_strlen($name) > 160 || !$this->url($url)) {
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
        $token->image_url = $url;
        $token->x = 0.5;
        $token->y = 0.5;
        $token->owner_user_id = $owner ? $owner->id : null;
        $token->save();
        return new JsonResponse(['data' => $this->tokenData($token)], 201);
    }
}
