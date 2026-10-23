<?php

namespace ChakChakman\InteractiveMaps\Models;

use Flarum\Database\AbstractModel;
use Flarum\Post\Post;

class MapEmbed extends AbstractModel
{
    protected $table = 'chak_map_embeds';
    public $timestamps = true;
    protected $guarded = [];

    public function map()
    {
        return $this->belongsTo(Map::class, 'map_id');
    }

    public function post()
    {
        return $this->belongsTo(Post::class, 'post_id');
    }
}
