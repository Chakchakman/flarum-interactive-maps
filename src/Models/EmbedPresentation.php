<?php

namespace ChakChakman\InteractiveMaps\Models;

final class EmbedPresentation
{
    public static function valid(array $data): bool
    {
        return (!array_key_exists('displayPosition', $data) || in_array($data['displayPosition'], ['above', 'below'], true))
            && (!array_key_exists('startsCollapsed', $data) || is_bool($data['startsCollapsed']));
    }

    public static function values(array $data): array
    {
        return ['display_position' => $data['displayPosition'] ?? 'below',
            'starts_collapsed' => $data['startsCollapsed'] ?? false];
    }
}
