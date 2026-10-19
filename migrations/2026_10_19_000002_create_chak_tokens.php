<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

return Migration::createTable('chak_tokens', function (Blueprint $table) {
    $table->increments('id');
    $table->unsignedInteger('map_id')->index();
    $table->string('name', 160);
    $table->string('image_url', 2048);
    $table->double('x')->default(0.5);
    $table->double('y')->default(0.5);
    $table->unsignedInteger('owner_user_id')->nullable()->index();
    $table->timestamps();
});
