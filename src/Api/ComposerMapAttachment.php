<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Access\MapPermissions;
use ChakChakman\InteractiveMaps\Access\PostMapAccess;
use ChakChakman\InteractiveMaps\Models\Map;
use ChakChakman\InteractiveMaps\Models\MapEmbed;
use Flarum\Api\Context;
use Flarum\Discussion\Discussion;
use Flarum\Foundation\ValidationException;
use Flarum\Post\Post;
use Flarum\User\Exception\PermissionDeniedException;

final class ComposerMapAttachment
{
    public static function validate(Context $context): void
    {
        $attributes = $context->body()['data']['attributes'] ?? [];
        $presentation = self::presentation($attributes);
        if (!\ChakChakman\InteractiveMaps\Models\EmbedPresentation::valid($presentation)
            || ($presentation && !array_key_exists('chakMapId', $attributes))) {
            throw new ValidationException(['chakMapId' => 'Неверные параметры отображения карты.']);
        }
        if (!array_key_exists('chakMapId', $attributes)) return;

        $actor = $context->getActor();
        if (!MapPermissions::canManage($actor) || !MapPermissions::canEmbed($actor)) {
            throw new PermissionDeniedException();
        }
        $id = $attributes['chakMapId'];
        if (!is_int($id) || $id < 1) {
            throw new ValidationException(['chakMapId' => 'Выберите корректную карту.']);
        }
        // The surrounding request transaction holds this lock through publication.
        if (!Map::query()->whereKey($id)->lockForUpdate()->first()) {
            throw new ValidationException(['chakMapId' => 'Карта не найдена. Выберите другую карту.']);
        }
    }

    public static function attach(Context $context, object $model): object
    {
        $id = $context->body()['data']['attributes']['chakMapId'] ?? null;
        if ($id === null) return $model;

        $post = $model instanceof Discussion ? Post::find($model->first_post_id) : $model;
        if (!$post instanceof Post || !PostMapAccess::canAttach($context->getActor(), $post)) {
            throw new PermissionDeniedException();
        }
        MapEmbed::create([
            'map_id' => $id,
            'post_id' => $post->id,
            'created_by' => $context->getActor()->id,
            ...\ChakChakman\InteractiveMaps\Models\EmbedPresentation::values(self::presentation($context->body()['data']['attributes'] ?? [])),
        ]);

        return $model;
    }
    private static function presentation(array $attributes): array
    {
        $data = [];
        if (array_key_exists('chakMapDisplayPosition', $attributes)) $data['displayPosition'] = $attributes['chakMapDisplayPosition'];
        if (array_key_exists('chakMapInitiallyCollapsed', $attributes)) $data['startsCollapsed'] = $attributes['chakMapInitiallyCollapsed'];
        return $data;
    }

}
