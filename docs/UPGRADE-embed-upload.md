# Обновление стенда: отображение, изображения карт и фишек

Целевой исходный код: **494b41d8ee49da50d72486b961bb8053f7d6d400**,
`feature/local-token-images`, включая отображение и загрузку фона из предыдущей
f950993. Оба CI успешны: [Extension40604488681](https://github.com/Chakchakman/flarum-interactive-maps/actions/runs/40604488681) (29s) и
[runtime40604488627](https://github.com/Chakchakman/flarum-interactive-maps/actions/runs/40604488627) (10m36s).
Установка на существующий стенд ожидает согласования schema.
Более поздняя документация не меняет целевой SHA исходников.

Предварительная проверка владельца от 2026-10-28: Intervention Image 3.11.10,
PHP CLI 64M/64M/512M. Обновлять Intervention для этого стенда не требуется.
Повторный preflight владельца 2026-11-06 подтвердил те же версии/лимиты, e917eaa
и только generated JS edits; app/db работают, БД healthy. Повторять этот preflight
сейчас не требуется. Разрешение на presentation schema ещё ожидается. Token/clipboard не добавляют
собственной миграции. [Дополнительная QA](QA-token-images-clipboard.md).

## Безопасная предварительная проверка

Из папки Windows-лаборатории с docker-compose.yml можно выполнить до
согласования миграции; команды читают состояние и ничего не обновляют:

```powershell
git -C .\extension status --short --branch
git -C .\extension rev-parse HEAD
docker compose ps
docker compose exec -T -w /var/www/flarum app composer show intervention/image
docker compose exec -T app php --ri core | Select-String -Pattern '^(upload_max_filesize|post_max_size|memory_limit)'
```

Для нового JPEG strip API нужна Intervention Image 3.11+ (major 3).
Если версия ниже, подготовить точечное обновление зависимости без общего
обновления ядра/расширений; сохранить root composer.json/composer.lock перед
любым изменением. PHP CLI-лимиты — предварительная диагностика; окончательный
upload limit проверяется реальным HTTP-запросом и настройками web-сервера.

## Возобновление после паузы: 2026-11-06

Октябрьский вывод владельца не подтверждает состояние стенда сегодня.
Сначала повторить пять команд предварительной проверки выше; при остановленных
контейнерах прислать их статус, прежде чем выполнять установку. Не показывать
`docker compose config`, переменные окружения, config.php или SQL в чате.

Дополнительно из папки лаборатории можно проверить schema/количество строк и
хранилище без смены ветки, миграций или чтения пользовательского содержимого.
Следующий PHP-блок использует только schema SELECT/count и filesystem predicates;
он проверен на облачном Flarum 2.0.2. Синтаксис PowerShell pipeline рассчитан на
5.1+, но выполнение на Windows владельца ещё не подтверждено. При ошибке
остановиться и прислать её класс, не полный stack trace/config.

```powershell
$mapsReadOnlyProbe = @'
<?php
try {
    $site = require getcwd().'/site.php';
    $container = $site->bootApp()->getContainer();
    $db = $container->make(\Illuminate\Database\ConnectionInterface::class);
    $schema = $db->getSchemaBuilder();
    $columns = [];
    foreach (['display_position', 'starts_collapsed'] as $column) {
        $columns[$column] = $schema->hasColumn('chak_map_embeds', $column);
    }
    $counts = [];
    foreach (['chak_maps', 'chak_tokens', 'chak_map_embeds'] as $table) {
        $counts[$table] = $db->table($table)->count();
    }
    $paths = $container->make(\Flarum\Foundation\Paths::class);
    echo json_encode([
        'presentationColumns' => $columns,
        'rowCounts' => $counts,
        'uploadDirectoryPresent' => is_dir($paths->storage.'/interactive-maps'),
        'storageWritable' => is_writable($paths->storage),
    ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR).PHP_EOL;
} catch (\Throwable $error) {
    fwrite(STDERR, 'Read-only preflight failed: '.get_class($error).PHP_EOL);
    exit(1);
}
'@
$mapsReadOnlyProbe | docker compose exec -T -w /var/www/flarum app php
if ($LASTEXITCODE -ne 0) { throw "Read-only preflight failed. Stop here." }
```

`presentationColumns` оба false — прежняя схема; оба true — поля уже есть,
проверить точный checkout и историю обновления перед повторным применением;
одно true — частичная схема, установка останавливается до разбора.
`rowCounts` — только числа, без имён/содержимого. `uploadDirectoryPresent=false`
допустимо до первой загрузки, `storageWritable=false` требует исправления
доступа перед загрузкой. CLI-проверка не заменяет браузерную авторизацию и
реальный HTTP upload. Не переносить эти облачные результаты на стенд владельца.

## Что согласуется отдельно

Одна additive migration:

- chak_map_embeds.display_position VARCHAR(5) NOT NULL DEFAULT 'below';
- chak_map_embeds.starts_collapsed BOOLEAN NOT NULL DEFAULT false.

Существующие карты, фишки и связи сохраняются. Новые поля получают прежний
визуальный default — под текстом/развёрнута. Schema helper проверяет ожидаемую
единственную pending migration и количество строк; неожиданные/частичные
состояния останавливают обновление. Нового upload-schema нет.

AGENTS.md: «Schema changes require a database backup and human approval».
Принятие UX-плана не заменяет отдельное согласование применения конкретной
миграции на существующей БД. На стенде владельца эта миграция ещё не применена.

## Резервная копия до установки

`scripts/Backup-Lab.ps1` из `chore/lab-backup` выполняет только backup.
Его можно скачать вне текущего checkout; переключать рабочую e917eaa для
резервирования не требуется. Перед запуском сохранить черновики, закрыть
страницы стенда и исключить записи/движения до завершения копии.

Сохраняются extension (без node_modules), SQL, storage и root composer files,
HEAD/status, SHA256 manifest и маркер BACKUP-COMPLETE только после всех проверок.
Существующие generated edits сохраняются. Пароль читается только внутри
DB-контейнера из MARIADB_ROOT_PASSWORD или MYSQL_ROOT_PASSWORD; если доступна
только другая схема credentials — helper остановится, секреты в чат не нужны.
Бинарные файлы не перенаправляются через PowerShell pipeline. Проверка архивов
и dump footer не является пробным восстановлением. Папка `_backups` приватная,
не отправлять SQL/tar/checksums с данными в публичные обсуждения.

Helper проверен на **7f4c8c0366745f0754d18de6185f1a2e0f87da80**:
[Extension CI42285448808](https://github.com/Chakchakman/flarum-interactive-maps/actions/runs/42285448808)
успешен (32s), включая Windows PowerShell5.1 orchestration и7 failure paths.
Это версия вспомогательного скрипта; целевой код расширения остаётся494b41d.
SQL/storage commands дополнительно проверены на синтетическом облачном форуме;
Windows с реальным Docker владельца — следующий фактический запуск.

Из папки лаборатории с docker-compose.yml:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    New-Item -ItemType Directory -Path .\_tools -Force | Out-Null
    $mapsBackupScript = Join-Path (Get-Location).Path '_tools\Backup-Lab-7f4c8c0.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/Chakchakman/flarum-interactive-maps/7f4c8c0366745f0754d18de6185f1a2e0f87da80/scripts/Backup-Lab.ps1' -OutFile $mapsBackupScript
    $mapsExpectedHash = '0e1a0b4bc9d1b7a8ff4451a8a35eb213452c67d7f0a21dff6657a29671178b91'
    if ((Get-FileHash -LiteralPath $mapsBackupScript -Algorithm SHA256).Hash -ne $mapsExpectedHash) {
        throw 'Backup helper checksum mismatch. Stop here.'
    }
    Unblock-File -LiteralPath $mapsBackupScript
    powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $mapsBackupScript -LabPath (Get-Location).Path
    if ($LASTEXITCODE -ne 0) { throw 'Backup incomplete. Stop here.' }
}
```

После запуска прислать только путь/Name/Length. При ошибке остановиться,
не продолжать установку и не удалять частичную копию. Запуск использует RemoteSigned только для дочернего PowerShell-процесса;
постоянная системная политика не меняется. Unblock-File вызывается только
после точной проверки SHA256. Если организация запрещает запуск group policy,
остановиться и прислать ошибку, не обходить её другими настройками. Миграция/checkout в helper отсутствуют; применение schema согласуется отдельно.

Подтверждено владельцем 2026-11-06: backup завершён в
`_backups/maps-backup-20261106-231128-4247d5f2`; extension.tgz1137371 bytes,
database.sql66087 bytes, storage.tgz200643 bytes. Это SQL выбранной установленной
БД, не обязательно архив всех баз MariaDB; размер сам по себе не доказывает
или опровергает полноту. Проверены completion footer, tar readability, размеры
и manifest; пробное восстановление не выполнялось. Windows/Docker запуск
helper фактически подтверждён. До установки не возобновлять записи стенда;
при новых данных потребуется новая согласованная копия.

## Подготовленный порядок установки после разрешения

1. Сохранить черновики, прекратить тестовые записи/движения и закрыть страницы
   стенда на время обновления. Проверить Git: допустимы только ожидаемые
   unstaged generated js/dist; другие изменения требуют разбора, без reset/clean.
2. Создать новый `_backups/before-embed-upload-<timestamp>` с extension.tgz,
   database.sql, storage.tgz и root composer.json/composer.lock. SQL делать
   согласованным mariadb-dump; существующие учётные данные использовать только
   внутри контейнера, не печатать/публиковать. Проверить exit codes, размеры,
   завершение dump и чтение tar. Для PowerShell 5.1: создавать бинарные архивы
   внутри контейнера и копировать docker cp, без перенаправления `>`.
3. Сохранить generated dist в stash после проверенной копии. Fetch ветки,
   проверить существование точного SHA и создать отдельную test-ветку из него.
   При любой ошибке остановиться, не выполнять дальнейшие шаги вручную вслепую.
4. Проверить зависимости, выполнить npm ci и npm run check, затем regenerate
   Composer autoload. Не коммитить локально пересобранные assets в backup/main.
5. После подтверждённой копии и разрешения выполнить из Flarum root только
   точечный helper `php packages/map-correct/scripts/Migrate-EmbedPresentation.php
   --approved-after-backup`. Этот mount специфичен для лаборатории владельца.
   Не запускать глобальный flarum migrate, reset/down -v или down migrations.
6. Очистить Flarum cache, перезапустить только app, Ctrl+F5 во всех профилях.
   Записать HEAD и путь резервной копии. Проверить обычный форум, затем функции
   из QA отображения/загрузки. При сбое прислать шаг и вывод без паролей/cookies/SQL.

Полный последовательный PowerShell-блок установки выдаётся после согласования
и предварительной проверки окружения. Это предотвращает применение schema
из одной только инструкции проектирования.

## Сохранность файлов и откат

Загруженные фоны и фишки находятся в storage/interactive-maps, вне extension.
Хранить каталог на постоянном томе Flarum и включать в резервную копию вместе
с SQL. При удалении/замене старые файлы автоматически не очищаются; учитывать
свободное место. Бинарные архивы и SQL не отправлять в публичный GitHub/чат.

Предпочтительный rollback — вернуть прежний исходный код/зависимости, пересобрать
assets и очистить cache, сохранив additive columns и файлы. Принятая e917eaa
игнорирует новые поля; её расширение не умеет отдавать private upload URLs,
поэтому карты/фишки с уже загруженными новыми изображениями потребуют работающего нового
reader или осознанной замены background URL. Не обещать полный функциональный
откат фоновых файлов одним переключением Git. Автоматически не восстанавливать
SQL поверх данных, не удалять колонки/карты/фишки/тома.
