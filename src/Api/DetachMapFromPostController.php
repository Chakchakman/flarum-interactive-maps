<?php

namespace ChakChakMan\InteractiveMaps\Api;

use ChakChakMan\InteractiveMaps\Access\MapPermissions;
use ChakChakMan\InteractiveMaps\Access\PostMapAccess;
use ChakChakMan\InteractiveMaps\Models\MapEmbed;
use Flarum\Api\JsonApiResponse;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class DetachMapFromPostController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $actor = RequestUtil::getActor($request);
        if (!$this->manage($request) || !MapPermissions::canEmbed($actor)) {
            return $this->error('Недостаточно прав для открепления карты', 403);
        }

        $postId = $this->id($request);
        $post = Post::query()->whereVisibleTo($actor)->find($postId);
        if (!$post || !PostMapAccess::canAttach($actor, $post)) {
            return $this->error('Нельзя изменять карту в этом сообщении', 403);
        }

        $removed = MapEmbed::query()->where('post_id', $postId)->delete();
        if (!$removed) return $this->error('Карта в сообщении не найдена', 404);

        return new JsonApiResponse(['meta' => ['detachedPostId' => (string) $postId]]);
    }
}
