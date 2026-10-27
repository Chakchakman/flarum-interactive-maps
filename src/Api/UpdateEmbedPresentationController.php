<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Access\MapPermissions;
use ChakChakman\InteractiveMaps\Access\PostMapAccess;
use ChakChakman\InteractiveMaps\Models\EmbedPresentation;
use ChakChakman\InteractiveMaps\Models\MapEmbed;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

final class UpdateEmbedPresentationController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $actor = RequestUtil::getActor($request);
        if (!$this->manage($request) || !MapPermissions::canEmbed($actor)) return $this->error('Недостаточно прав', 403);
        $data = $this->data($request);
        if (!EmbedPresentation::valid($data)) return $this->error('Неверные параметры отображения карты');
        return MapEmbed::query()->getConnection()->transaction(function () use ($request, $actor, $data) {
            $post = Post::query()->whereVisibleTo($actor)->lockForUpdate()->find($this->id($request));
            if (!$post || !PostMapAccess::canAttach($actor, $post)) return $this->error('Нельзя изменять карту в этом сообщении', 403);
            $embed = MapEmbed::query()->where('post_id', $post->id)->lockForUpdate()->first();
            if (!$embed) return $this->error('Карта в сообщении не найдена', 404);
            if (array_key_exists('displayPosition', $data)) $embed->display_position = $data['displayPosition'];
            if (array_key_exists('startsCollapsed', $data)) $embed->starts_collapsed = $data['startsCollapsed'];
            $embed->save();
            return $this->document(['type' => 'chak-map-embeds', 'id' => (string) $embed->id,
                'attributes' => ['displayPosition' => $embed->display_position, 'startsCollapsed' => (bool) $embed->starts_collapsed]]);
        }, 3);
    }
}
