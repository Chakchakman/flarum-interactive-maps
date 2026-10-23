<?php

namespace ChakChakman\InteractiveMaps\Access;

use Flarum\User\User;

/**
 * Central permission checks for the private map-management API.
 *
 * The forum's role/permission grid grants this permission to selected
 * groups. The default is deny for all non-administrators.
 */
final class MapPermissions
{
    public const MANAGE = 'chakchakman-interactive-maps.map.manage';
    public const EMBED = 'chakchakman-interactive-maps.map.embed';

    public static function canManage(User $actor): bool
    {
        return !$actor->isGuest()
            && ($actor->isAdmin() || $actor->hasPermission(self::MANAGE));
    }

    public static function canEmbed(User $actor): bool
    {
        return !$actor->isGuest()
            && ($actor->isAdmin() || $actor->hasPermission(self::EMBED));
    }
}
