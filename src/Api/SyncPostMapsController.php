<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Access\MapPermissions;
use ChakChakman\InteractiveMaps\Models\MapEmbed;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Flarum\Post\CommentPost;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

/** Read-only, bounded snapshots for visible post boards; never accepts map IDs. */
class SyncPostMapsController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) return $this->error('Нужна авторизация', 403);
        $input = $request->getQueryParams()['postIds'] ?? null;
        if (!is_string($input) || strlen($input) > 240
            || !preg_match('/^[1-9][0-9]*(,[1-9][0-9]*){0,19}$/D', $input)) {
            return $this->error('Нужно от 1 до 20 корректных ID сообщений');
        }
        $ids = array_values(array_unique(explode(',', $input)));
        foreach ($ids as $id) {
            if (filter_var($id, FILTER_VALIDATE_INT) === false) return $this->error('Неверный ID сообщения');
        }
        // Prove actor-specific visibility before resolving links or tokens.
        $posts = Post::query()->whereVisibleTo($actor)->whereIn('id', $ids)->get()
            // Post::isVisibleTo runs this same scoped query again for each row.
            // These models already passed it; retain the comment-only rule.
            ->filter(fn (Post $post) => $post instanceof CommentPost)->keyBy('id');
        $embeds = MapEmbed::query()->whereIn('post_id', $posts->keys())
            ->with(['map.tokens.owner'])->get()->keyBy('post_id');
        $resources = [];
        $mapSnapshots = [];
        $canManage = MapPermissions::canManage($actor);
        foreach ($ids as $id) {
            $map = $embeds->get($id)?->map;
            // Missing, detached and forbidden posts have the same safe shape.
            $attributes = ['available' => false];
            if ($map) {
                // One map can appear in several visible posts. Serialize it only
                // once per request; never cache across requests or actors.
                $attributes = $mapSnapshots[$map->id] ??= [
                    'available' => true,
                    'mapId' => (int) $map->id,
                    'canManageMaps' => $canManage,
                    'tokens' => $map->tokens->sortBy('id')->values()
                        ->map(fn ($token) => $this->tokenData($token))->all(),
                ];
            }
            $resources[] = ['type' => 'chak-map-snapshots', 'id' => (string) $id, 'attributes' => $attributes];
        }
        return $this->document($resources)->withHeader('Cache-Control', 'private, no-store');
    }
}
