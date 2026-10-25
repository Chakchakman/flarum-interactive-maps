<?php

use Flarum\Database\Migration;

// Additive upgrade: retain existing maps, links, tokens and coordinates.
return Migration::addColumns('chak_maps', [
    'grid_color' => ['string', 'length' => 7, 'default' => '#ffffff'],
    'grid_line_width' => ['decimal', 'total' => 3, 'places' => 1, 'default' => 1],
]);
