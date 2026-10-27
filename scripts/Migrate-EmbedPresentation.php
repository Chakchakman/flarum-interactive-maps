<?php

/**
 * Run from the installed Flarum root after an approved fresh DB backup.
 * Uses Flarum 2's extension migrator, restricted to the one reviewed migration.
 */
if (PHP_SAPI !== 'cli' || !in_array('--approved-after-backup', $argv, true)) {
    fwrite(STDERR, "CLI only. A fresh DB backup and owner approval are required.\n");
    exit(1);
}
if (!is_file(getcwd().'/site.php')) {
    fwrite(STDERR, "Run this command from the installed Flarum root.\n");
    exit(1);
}

$site = require getcwd().'/site.php';
$container = $site->bootApp()->getContainer();
$manager = $container->make(\Flarum\Extension\ExtensionManager::class);
$extension = $manager->getExtension('chakchakman-interactive-maps');
if (!$extension || !$manager->isEnabled($extension->getId())
    || realpath($extension->getPath()) !== realpath(dirname(__DIR__))) {
    throw new RuntimeException('The enabled installed extension must match this script.');
}
$db = $container->make(\Illuminate\Database\ConnectionInterface::class);
$schema = $db->getSchemaBuilder();
$repository = $container->make(\Flarum\Database\MigrationRepositoryInterface::class);
$files = array_map(fn ($path) => basename($path, '.php'), glob($extension->getPath().'/migrations/*.php'));
$pending = array_values(array_diff($files, $repository->getRan($extension->getId())));
$expected = '2026_10_27_000005_add_embed_presentation';
$positionExists = $schema->hasColumn('chak_map_embeds', 'display_position');
$collapsedExists = $schema->hasColumn('chak_map_embeds', 'starts_collapsed');
if (!$pending) {
    if (!$positionExists || !$collapsedExists) throw new RuntimeException('Recorded migration does not match the schema. Stop and review.');
    echo "Embed presentation schema already present; no migration performed.\n";
    exit(0);
}
if ($pending !== [$expected] || $positionExists || $collapsedExists) {
    throw new RuntimeException('Unexpected pending migrations or partial schema. Stop and review; nothing was migrated.');
}
$tables = ['chak_maps', 'chak_tokens', 'chak_map_embeds'];
$counts = array_map(fn ($table) => $db->table($table)->count(), $tables);
$manager->migrate($extension);
if (!$schema->hasColumn('chak_map_embeds', 'display_position') || !$schema->hasColumn('chak_map_embeds', 'starts_collapsed')) {
    throw new RuntimeException('Embed presentation columns are missing after migration.');
}
if ($counts !== array_map(fn ($table) => $db->table($table)->count(), $tables)) {
    throw new RuntimeException('Row counts changed during migration. Stop and review the backup; do not reset data.');
}
echo "Only the approved Interactive Maps embed-presentation migration was applied. Map/token/link row counts retained.\n";
