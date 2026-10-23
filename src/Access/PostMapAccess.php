<?php

namespace ChakChakman\InteractiveMaps\Access;

use Flarum\Post\CommentPost;
use Flarum\Post\Post;
use Flarum\User\User;

/**
 * Never use a bare map ID to authorize post-embedded map access.
 * Post visibility is scoped by Flarum, including extension-provided scopes.
 */
final class PostMapAccess
{
    public static function canView(User $actor, Post $post): bool
    {
        return !$actor->isGuest()
            && $post instanceof CommentPost
            && $post->isVisibleTo($actor);
    }

    public static function canAttach(User $actor, Post $post): bool
    {
        return MapPermissions::canManage($actor)
            && MapPermissions::canEmbed($actor)
            && self::canView($actor, $post)
            && $actor->can('edit', $post);
    }
}
