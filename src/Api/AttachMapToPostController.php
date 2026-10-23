<?php

namespace ChakChakMan\InteractiveMaps\Api;

use ChakChakMan\InteractiveMaps\Access\PostMapAccess;
use ChakChakMan\InteractiveMaps\Models\Map;
use ChakChakMan\InteractiveMaps\Models\MapEmbed;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Illuminate\Database\QueryException;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class AttachMapToPostController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $actor = RequestUtil::getActor($request);
        // Requiring both permissions prevents users with only the embed
        // permission from bypassing the private staff map library.
        if (!$this->manage($request) || !\ChakChakMan\InteractiveMaps\Access\MapPermissions::canEmbed($actor)) {
            return $this->error('Недостаточно прав для прикрепления карты', 403);
        }

        $data = $this->data($request);
        $postId = filter_var($data['postId'] ?? null, FILTER_VALIDATE_INT);
        $mapId = filter_var($data['mapId'] ?? null, FILTER_VALIDATE_INT);
        if (!$postId || $postId < 1 || !$mapId || $mapId < 1) {
            return $this->error('Нужны корректные postId и mapId', 400);
        }

        // Post visibility and edit rights are mandatory even for a GM.
        $post = Post::query()->whereVisibleTo($actor)->find($postId);
        if (!$post || !PostMapAccess::canAttach($actor, $post)) {
            return $this->error('Нельзя прикрепить карту к этому сообщению', 403);
        }
        if (!Map::query()->whereKey($mapId)->exists()) {
            return $this->error('Карта не найдена', 404);
        }

        $existing = MapEmbed::query()->where('post_id', $postId)->first();
        if ($existing) {
            if ((int) $existing->map_id !== (int) $mapId) {
                return $this->error('В этом сообщении уже прикреплена другая карта', 409);
            }
            return $this->document($this->embedResource($existing));
        }

        try {
            $embed = MapEmbed::create([
                'post_id' => $postId,
                'map_id' => $mapId,
                'created_by' => $actor->id,
            ]);
        } catch (QueryException $exception) {
            // The unique post_id constraint prevents concurrent second binds.
            // Do not mask any other database failures as a conflict.
            if ((int) ($exception->errorInfo[1] ?? 0) !== 1062) {
                throw $exception;
            }
            return $this->error('В этом сообщении уже прикреплена карта', 409);
        }

        return $this->document($this->embedResource($embed), 201);
    }

    private function embedResource(MapEmbed $embed): array
    {
        return [
            'type' => 'chak-map-embeds',
            'id' => (string) $embed->id,
            'attributes' => [
                'postId' => (int) $embed->post_id,
                'mapId' => (int) $embed->map_id,
            ],
        ];
    }
}
