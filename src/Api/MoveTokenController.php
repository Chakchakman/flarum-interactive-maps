<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Token;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class MoveTokenController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        // The old map-ID endpoint is now staff-only. Player movement must
        // eventually use a post-scoped endpoint that proves map visibility.
        // Do not grant access here merely because a player owns the token:
        // that would bypass hidden/private forum discussions.
        if (!$this->manage($request)) {
            return $this->error('Перемещение из каталога доступно только мастерам', 403);
        }
        // Check permissions before looking up token IDs so ordinary users
        // cannot enumerate which token identifiers exist.
        $token = Token::find($this->id($request));
        if (!$token) return $this->error('Фишка не найдена', 404);
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
        return $this->document($this->tokenResource($token));
    }
}
