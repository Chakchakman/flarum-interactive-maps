<?php

namespace ChakChakman\InteractiveMaps\Images;

final class BackgroundUploadException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }
}
