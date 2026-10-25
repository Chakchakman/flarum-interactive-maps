<?php

namespace ChakChakman\InteractiveMaps\Models;

final class GridStyle
{
    public const COLOR = '#ffffff';
    public const WIDTH = 1;

    public static function validColor(mixed $color): bool
    {
        return is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/D', $color) === 1;
    }

    public static function validWidth(mixed $width): bool
    {
        return (is_int($width) || is_float($width))
            && is_finite((float) $width)
            && $width >= 0.5 && $width <= 5
            && floor($width * 2) == $width * 2;
    }
}
