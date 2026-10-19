<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Token;
use Flarum\User\User;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class MoveTokenController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $token = Token::find($this->id($request));
        if (!$token) return $this->error('Фишка не найдена', 404);
        $actor = \Flarum\Http\RequestUtil::getActor($request);
        if (!($actor instanceof User) || $actor->isGuest()) return $this->error('Нужна авторизация', 403);
        if (!$actor->isAdmin() && (int) $token->owner_user_id !== (int) $actor->id) {
            return $this->error('Вы можете перемещать только свою фишку', 403);
        }
        $data = $this->data($request);
        if (!isset($data['x'], $data['y']) || !is_numeric($data['x']) || !is_numeric($data['y'])) {
            return $this->error('Нужны координаты x и y');
        }
        $x = (float) $data['x'];
        $y = (float) $data['y'];
        if (!is_finite($x) || !is_finite($y) || $x < 0 || $x > 1 || $y < 0 || $y > 1) {
            return $this->error('Координаты должны быть в диапазоне 0..1');
        }
        $token->x = $x;
        $token->y = $y;
        $token->save();
        return new JsonResponse(['data' => $this->tokenData($token)]);
    }
}
