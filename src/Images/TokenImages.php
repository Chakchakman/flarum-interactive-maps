<?php
namespace ChakChakman\InteractiveMaps\Images;

use Intervention\Image\Interfaces\ImageInterface;

final class TokenImages extends PrivateRasterFiles
{
    protected const DIRECTORY = 'tokens';
    protected const ROUTE = 'chak.tokens.image';

    protected function transform(ImageInterface $image): ImageInterface
    {
        return $image->scaleDown(width: 512, height: 512);
    }
}
