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

        // Resolve the post through Flarum's actor-specific visibility scopes.
        // Do not query map/token information before access to the post is proven.
        $post = Post::query()->whereVisibleTo($actor)->find($postId);
        if (!$post || !PostMapAccess::canView($actor, $post)) {
            return $this->error('Карта или фишка не найдена', 404);
        }

        $embed = MapEmbed::query()->where('post_id', $postId)->first();
        if (!$embed) return $this->error('Карта или фишка не найдена', 404);

        $token = Token::query()
            ->where('map_id', $embed->map_id)
            ->find($tokenId);
        if (!$token) return $this->error('Карта или фишка не найдена', 404);

        if (!PostTokenMoveAccess::canMove($actor, $post, $token, (int) $embed->map_id)) {
            return $this->error('Нельзя перемещать чужую фишку', 403);
        }

        $data = $this->data($request);
        if (!isset($data['x'], $data['y'])
            || !is_numeric($data['x']) || !is_numeric($data['y'])) {
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
