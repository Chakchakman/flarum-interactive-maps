<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Token;
use Flarum\User\User;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class AssignTokenController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        if (!$this->admin($request)) return $this->error('Нет прав', 403);
        $token = Token::find($this->id($request));
        if (!$token) return $this->error('Фишка не найдена', 404);
        $username = trim((string) ($this->data($request)['ownerUsername'] ?? ''));
        $owner = null;
        if ($username !== '') {
            $owner = User::where('username', $username)->first();
            if (!$owner) return $this->error('Пользователь Flarum не найден');
        }
        $token->owner_user_id = $owner ? $owner->id : null;
        $token->save();
        return new JsonResponse(['data' => $this->tokenData($token)]);
    }
}
