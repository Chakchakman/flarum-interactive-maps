<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\MapEmbed;
use Flarum\Api\Context;
use Flarum\Post\CommentPost;
use Flarum\Post\Post;

/** Request-scoped lookup shared by all presentation fields. Never includes map data. */
final class PostEmbedHint
{
    private static ?\WeakMap $requests = null;

    public static function get(Post $post, Context $context): ?array
    {
        if (!$post instanceof CommentPost || $post->hidden_at !== null || $context->getActor()->isGuest()) return null;
        self::$requests ??= new \WeakMap();
        $request = $context->request;
        $byDiscussion = self::$requests[$request] ?? [];
        $id = (int) $post->discussion_id;
        if (!isset($byDiscussion[$id])) {
            $byDiscussion[$id] = MapEmbed::query()
                ->join('posts', 'posts.id', '=', 'chak_map_embeds.post_id')
                ->where('posts.discussion_id', $id)
                ->get(['chak_map_embeds.post_id', 'chak_map_embeds.display_position', 'chak_map_embeds.starts_collapsed'])
                ->keyBy('post_id')->map(fn ($embed) => ['displayPosition' => $embed->display_position,
                    'startsCollapsed' => (bool) $embed->starts_collapsed])->all();
            self::$requests[$request] = $byDiscussion;
        }
        return $byDiscussion[$id][$post->id] ?? null;
    }
}
