<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

// One map per saved comment post for the first embedding milestone.
// This adds a NEW table; it does not touch existing maps or token positions.
return Migration::createTable('chak_map_embeds', function (Blueprint $table) {
    $table->increments('id');
    $table->unsignedInteger('map_id')->index();
    $table->unsignedInteger('post_id')->unique();
    $table->unsignedInteger('created_by');
    $table->timestamps();
});
