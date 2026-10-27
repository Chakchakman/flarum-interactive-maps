<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Access\PostMapAccess;
use ChakChakman\InteractiveMaps\Access\PostTokenMoveAccess;
use ChakChakman\InteractiveMaps\Models\MapEmbed;
use ChakChakman\InteractiveMaps\Models\Token;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class MovePostTokenController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) {
            return $this->error('Нужна авторизация', 403);
        }

        // Both identifiers come from the route, never the request body.
        $params = $request->getQueryParams();
        $postId = filter_var($params['postId'] ?? null, FILTER_VALIDATE_INT);
        $tokenId = filter_var($params['tokenId'] ?? null, FILTER_VALIDATE_INT);
        if (!$postId || $postId < 1 || !$tokenId || $tokenId < 1) {
            return $this->error('Карта или фишка не найдена', 404);
        }

        // MariaDB 11.8 can return 1020 after a lock wait; restart the whole
        // transaction (including visibility/owner checks), never just the UPDATE.
        return Token::query()->getQuery()->getConnection()->transaction(function () use ($actor, $request, $postId, $tokenId) {
            // Lock the parent, then token, then association. Token-before-embed
            // agrees with map deletion; recheck the link after any token wait.
            $post = Post::query()->whereVisibleTo($actor)->lockForUpdate()->find($postId);
            if (!$post || !PostMapAccess::canView($actor, $post)) {
                return $this->error('Карта или фишка не найдена', 404);
            }
            $embed = MapEmbed::query()->where('post_id', $postId)->first();
            if (!$embed) return $this->error('Карта или фишка не найдена', 404);
            $token = Token::query()->where('map_id', $embed->map_id)->lockForUpdate()->find($tokenId);
            if (!$token) return $this->error('Карта или фишка не найдена', 404);
            $currentEmbed = MapEmbed::query()->where('post_id', $postId)
                ->where('map_id', $token->map_id)->lockForUpdate()->first();
            if (!$currentEmbed) return $this->error('Карта или фишка не найдена', 404);
            // Ownership is read from the locked current row, not a pre-lock copy.
            if (!PostTokenMoveAccess::canMove($actor, $post, $token, (int) $embed->map_id)) {
                return $this->error('Нельзя перемещать чужую фишку', 403);
            }
            return $this->applyTokenMove($token, $this->data($request));
        }, 3);
    }
}
