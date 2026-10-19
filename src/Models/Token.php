<?php

namespace ChakChakman\InteractiveMaps\Models;

use Flarum\Database\AbstractModel;
use Flarum\User\User;

class Token extends AbstractModel
{
    protected $table = 'chak_tokens';
    protected $guarded = [];

    public function map()
    {
        return $this->belongsTo(Map::class, 'map_id');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }
}
