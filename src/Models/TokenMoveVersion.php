<?php

namespace ChakChakman\InteractiveMaps\Models;

/** A state validator, not an authorization token or a monotonic history ID. */
final class TokenMoveVersion
{
    public static function forToken(Token $token): string
    {
        $x = (float) $token->x;
        $y = (float) $token->y;
        // MySQL round-trips signed zero as zero; keep the validator stable.
        // Binary doubles avoid PHP JSON precision settings merging states.
        $identity = json_encode([
            (int) $token->id, (int) $token->map_id,
            $token->owner_user_id === null ? null : (int) $token->owner_user_id,
        ], JSON_THROW_ON_ERROR);
        return hash('sha256', $identity.pack('E2', $x == 0.0 ? 0.0 : $x, $y == 0.0 ? 0.0 : $y));
    }
}
