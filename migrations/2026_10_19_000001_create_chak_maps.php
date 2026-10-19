<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

return Migration::createTable('chak_maps', function (Blueprint $table) {
    $table->increments('id');
    $table->string('title', 160);
    $table->string('background_url', 2048);
    $table->unsignedInteger('creator_id');
    $table->unsignedSmallInteger('grid_size')->default(64);
    $table->smallInteger('grid_offset_x')->default(0);
    $table->smallInteger('grid_offset_y')->default(0);
    $table->boolean('grid_enabled')->default(true);
    $table->boolean('snap_to_grid')->default(true);
    $table->timestamps();
});
