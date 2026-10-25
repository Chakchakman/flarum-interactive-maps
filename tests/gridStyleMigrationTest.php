<?php

// Exercise the upgrade on disposable in-memory data, never a running forum DB.
require $argv[1];

use Illuminate\Database\SQLiteConnection;
use Illuminate\Database\Schema\Blueprint;

$db = new SQLiteConnection(new PDO('sqlite::memory:'));
$schema = $db->getSchemaBuilder();
$original = require __DIR__.'/../migrations/2026_10_19_000001_create_chak_maps.php';
$original['up']($schema);
$db->table('chak_maps')->insert([
    'id' => 9, 'title' => 'Existing fixture', 'background_url' => '/fixture.png', 'creator_id' => 1,
    'grid_size' => 80, 'grid_offset_x' => -12, 'grid_offset_y' => 24,
]);
$schema->create('chak_tokens', function (Blueprint $table) {
    $table->integer('id'); $table->integer('map_id'); $table->float('x'); $table->float('y');
});
$db->table('chak_tokens')->insert(['id' => 7, 'map_id' => 9, 'x' => 0.25, 'y' => 0.75]);
$schema->create('chak_map_embeds', function (Blueprint $table) {
    $table->integer('map_id'); $table->integer('post_id');
});
$db->table('chak_map_embeds')->insert(['map_id' => 9, 'post_id' => 2]);
$before = (array) $db->table('chak_maps')->first();
$tokens = $db->table('chak_tokens')->get()->toJson();
$links = $db->table('chak_map_embeds')->get()->toJson();
$migration = require __DIR__.'/../migrations/2026_10_25_000004_add_grid_style.php';
$migration['up']($schema);
$after = (array) $db->table('chak_maps')->first();
if ($after['grid_color'] !== '#ffffff' || (float) $after['grid_line_width'] !== 1.0) {
    throw new LogicException('Wrong defaults on existing rows');
}
unset($after['grid_color'], $after['grid_line_width']);
if ($before !== $after || $tokens !== $db->table('chak_tokens')->get()->toJson()
    || $links !== $db->table('chak_map_embeds')->get()->toJson()) {
    throw new LogicException('Migration changed existing fixture data');
}
echo "PASS: additive grid migration preserves maps/tokens/links and supplies legacy defaults\n";
$migration['down']($schema);
if ($before !== (array) $db->table('chak_maps')->first()) throw new LogicException('Rollback lost base row');
echo "PASS: disposable rollback removes only added columns\n";
