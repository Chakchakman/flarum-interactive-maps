<?php

namespace ChakChakman\InteractiveMaps\Api;

use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

final class SearchMapUsersController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        if (!$this->manage($request)) return $this->error('Нет прав', 403);
        $prefix = $request->getQueryParams()['prefix'] ?? '';
        if (!is_string($prefix) || mb_strlen($prefix) > 100) {
            return $this->error('Некорректное начало имени пользователя');
        }
        $prefix = trim($prefix);
        if (mb_strlen($prefix) < 3) return $this->document([]);
        // Escape literal wildcard characters; only the final % is ours.
        $pattern = strtr($prefix, ['=' => '==', '%' => '=%', '_' => '=_']).'%';
        $users = User::query()->whereVisibleTo(RequestUtil::getActor($request))
            ->whereRaw("username LIKE ? ESCAPE '='", [$pattern])
            ->orderBy('username')->limit(10)->get(['id', 'username']);
        return $this->document($users->map(fn (User $user) => [
            'type' => 'chak-map-users', 'id' => (string) $user->id,
            'attributes' => ['username' => $user->username],
        ])->all());
    }
}
