<?php

namespace ChakChakman\InteractiveMaps\Models;

use Flarum\Database\AbstractModel;

class Map extends AbstractModel
{
    protected $table = 'chak_maps';
    protected $guarded = [];

    protected $casts = [
        'grid_enabled' => 'boolean',
        'snap_to_grid' => 'boolean',
    ];

    public function tokens()
    {
        return $this->hasMany(Token::class, 'map_id');
    }
}
