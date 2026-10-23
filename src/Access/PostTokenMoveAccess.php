<?php

namespace ChakChakman\InteractiveMaps\Access;

use ChakChakman\InteractiveMaps\Models\Token;
use Flarum\Post\Post;
use Flarum\User\User;

/**
 * Ownership is necessary but never sufficient: a token can only move inside
 * a still-visible, server-associated post belonging to its map.
 */
final class PostTokenMoveAccess
{
    public static function canMove(User $actor, Post $post, Token $token, int $mapId): bool
    {
        if (!PostMapAccess::canView($actor, $post)
            || (int) $token->map_id !== $mapId) {
            return false;
        }

        // An administrator or assigned map manager may control any token in a
        // visible embedded board. An ordinary player needs exact ownership.
        return MapPermissions::canManage($actor)
            || ($token->owner_user_id !== null
                && (int) $token->owner_user_id === (int) $actor->id);
    }
}
