<?php

require __DIR__.'/../src/Models/GridStyle.php';

use ChakChakman\InteractiveMaps\Models\GridStyle;

foreach (['#ffffff', '#001122', '#Aa11FF'] as $value) {
    if (!GridStyle::validColor($value)) throw new LogicException('Rejected valid color');
}
foreach (['red', '#fff', "#abcdef\n", 'url(example.test)', '', null, false, 123, []] as $value) {
    if (GridStyle::validColor($value)) throw new LogicException('Accepted unsafe color');
}
foreach ([0.5, 1, 1.5, 3, 5] as $value) {
    if (!GridStyle::validWidth($value)) throw new LogicException('Rejected valid width');
}
foreach ([0, -1, 5.5, 1.25, '2', true, null, NAN, INF, []] as $value) {
    if (GridStyle::validWidth($value)) throw new LogicException('Accepted invalid width');
}
echo "PASS: strict grid color validation\nPASS: finite half-pixel grid width validation\n";
