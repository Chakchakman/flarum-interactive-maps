<?php

use Flarum\Database\Migration;

return Migration::addColumns('chak_map_embeds', [
    'display_position' => ['string', 'length' => 5, 'default' => 'below'],
    'starts_collapsed' => ['boolean', 'default' => false],
]);
