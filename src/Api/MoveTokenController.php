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
        // Retry serialization/deadlock errors with a fresh locked read.
        return Token::query()->getQuery()->getConnection()->transaction(function () use ($request) {
            $token = Token::query()->lockForUpdate()->find($this->id($request));
            if (!$token) return $this->error('Фишка не найдена', 404);
            return $this->applyTokenMove($token, $this->data($request));
        }, 3);
    }
}
