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
        ]);

        return $model;
    }
}
