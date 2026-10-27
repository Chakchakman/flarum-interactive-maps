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
$migration = require __DIR__.'/../migrations/2026_10_27_000005_add_embed_presentation.php';
$migration['up']($schema);
$link = (array) $db->table('chak_map_embeds')->first();
if ($link['display_position'] !== 'below' || (bool) $link['starts_collapsed'] !== false) {
    throw new LogicException('Wrong defaults for existing embeds');
}
unset($link['display_position'], $link['starts_collapsed']);
if ($before !== (array) $db->table('chak_maps')->first()
    || $tokens !== $db->table('chak_tokens')->get()->toJson()
    || $link !== ['map_id' => 9, 'post_id' => 2]) throw new LogicException('Migration changed fixture data');
echo "PASS: embed presentation migration preserves maps/tokens/links and legacy defaults\n";
$migration['down']($schema);
if ($schema->hasColumn('chak_map_embeds', 'display_position') || $schema->hasColumn('chak_map_embeds', 'starts_collapsed')) throw new LogicException('Rollback left new columns');
if ($links !== $db->table('chak_map_embeds')->get()->toJson()) throw new LogicException('Rollback changed links');
echo "PASS: disposable rollback preserves existing links\n";
