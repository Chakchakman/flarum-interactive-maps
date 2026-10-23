<?php

namespace ChakChakMan\InteractiveMaps\Api;

use ChakChakMan\InteractiveMaps\Access\PostMapAccess;
use ChakChakMan\InteractiveMaps\Models\MapEmbed;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class ShowPostMapController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) {
            return $this->error('Нужна авторизация', 403);
        }

        $postId = $this->id($request);
        if ($postId < 1) return $this->error('Карта в сообщении не найдена', 404);

        // The post visibility scope also incorporates discussion privacy
        // and visibility restrictions installed by other extensions.
        $post = Post::query()->whereVisibleTo($actor)->find($postId);
        if (!$post || !PostMapAccess::canView($actor, $post)) {
            return $this->error('Карта в сообщении не найдена', 404);
        }

        $embed = MapEmbed::query()->with('map')->where('post_id', $postId)->first();
        if (!$embed || !$embed->map) {
            return $this->error('Карта в сообщении не найдена', 404);
        }

        // Never allow a plain map ID to circumvent the post-level check.
        return $this->mapDocument($embed->map, true, ['postId' => $postId]);
    }
}
