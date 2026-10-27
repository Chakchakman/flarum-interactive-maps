# v0.3: производительность и подготовка к выпуску

Ветка оптимизации: `feature/sync-performance`, код `acabf2c`.
Последующая отдельная ветка зависимости сборки: `fix/build-dependency-audit`,
код `e917eaae890be4695868ae2852f0c4f71ceb394f`, включающий оптимизацию и прежнюю Alpha.2.
Это тестовая сборка; ручная приёмка и разрешение на выпуск остаются отдельными.

## Что изменено и измерено

- Пакетный endpoint сохраняет authenticated-only, `whereVisibleTo(actor)` со
  всеми registered scopers и comment-only правило. Устранён повтор того же
  scoped query из `Post::isVisibleTo` для каждого результата.
- Повторяющаяся карта сериализуется один раз внутри запроса/актора. Нет кеша
  между запросами, пользователями или изменениями разрешений.
- Неизменные token objects/array сохраняются, idle snapshot не инвалидирует
  родительский пост. Сравниваются все собственные поля, включая имя/изображение,
  владельца и moveVersion. Локальные optimistic координаты сравниваются с
  реальной текущей моделью, а не с устаревшей копией снимка.
- Изменение управления, скрытие/восстановление карты и исчезновение sync error
  по-прежнему обновляют интерфейс. Epoch, busy guards, row locking и 409/428
  протокол не ослаблены.
- `fast-uri` обновлён только в lockfile с 3.1.8 до совместимой 3.1.9. Все 13
  affected-package entries npm audit (четыре advisories одного build-only
  пакета) исчезли; major overrides и force fixes не применялись.

Диагностический sample: отдельный локальный Flarum 2 / MariaDB 11.8, 100 фишек,
одна карта в 20 доступных сообщениях. Не запускать fixtures на БД владельца.

| Нагрузка | До | После |
| --- | --- | --- |
| 1 сообщение: SQL | 6 | 5 |
| 20 сообщений: SQL | 25 | 5 |
| 20 сообщений: обработка одного sample | 69.71 мс | 9.44 мс |

Дополнительная парная серия из пяти прогонов исходного кода 759803b и
оптимизации на той же БД: SQL всегда 25 → 5; медиана обработки
**65.67 → 8.75 мс** (до: 57.38–69.31, после: 8.28–10.47 мс).
Измеряется controller, без Docker startup/HTTP/network времени. Исходный код
для baseline смонтирован read-only в отдельный PHP-контейнер; никакой
перезаписи рабочей ветки или данных форума не было.

Уменьшение числа SQL на 80% для указанного batch воспроизводится regression
проверкой. Время зависит от среды; это не гарантия универсального ускорения.
Payload остаётся полным (около 465KB в данном повторяющемся batch). Изображения,
их размер и сеть отдельно не оптимизированы.

## Автоматическая проверка

Оптимизация: 61/61 JS + production build; 23/23 browser (4.6m); Composer strict
validation, PHP syntax/access/grid/transaction/synthetic migration и реальные
privacy scopes — успех. Runtime performance fixture проверяет постоянное число
запросов при росте 1 → 20 сообщений и сохраняет все 100 фишек в каждом снимке;
все записи откатываются. JS-тесты отдельно проверяют idle identity, изменения
каждого поля, optimistic correction, add/remove/order и malformed responses.

Точечная зависимость: npm audit после изменения lockfile — 0 vulnerabilities.
Новый npm ci и 61/61 JS/build, затем 23/23 browser (4.4m) для точечного
обновления прошли. CI точного SHA фиксируется в PROJECT-CONTEXT.
Локальный Composer advisory API недоступен (timeout старого proxy, затем 403
на advisory URL в новой среде); этот запуск не является успешным аудитом.
Но итоговый runtime CI проверил `composer audit` на установленном форуме и
прошёл успешно. Ошибки аудита не игнорируются.

**Итог точного e917eaa:** [Extension CI 40563387647](https://github.com/Chakchakman/flarum-interactive-maps/actions/runs/40563387647)
— Success (33s), включая npm audit и Windows checks;
[runtime CI 40563387355](https://github.com/Chakchakman/flarum-interactive-maps/actions/runs/40563387355)
— Success (7m23s), включая browser suite и Composer audit.
Условие успешного CI для приведённых ниже команд выполнено.
Ручная приёмка владельцем ещё ожидается.

## Обновление стенда владельца

Исполнять только после подтверждения успешного CI указанного SHA. Сохраните
черновики, остановите тестовые движения. Блок запускается из папки лаборатории
с docker-compose.yml. Он сохраняет код и сгенерированные assets, проверяет архив
и останавливается при неожиданных локальных изменениях или ошибке команды.
Новой миграции нет; БД/тома не удаляются и не восстанавливаются. При ошибке
остановиться и прислать вывод, не продолжать отдельные последующие команды.

```powershell
& {
    $ErrorActionPreference = "Stop"
    $target = "e917eaae890be4695868ae2852f0c4f71ceb394f"
    function Invoke-MapsCheck([scriptblock]$command) {
        & $command
        if ($LASTEXITCODE -ne 0) { throw "Ошибка. Остановитесь и пришлите вывод." }
    }
    $dirty = @(Invoke-MapsCheck { git -C .\extension status --porcelain })
    $unexpected = @($dirty | Where-Object {
        $_ -notmatch '^ M js/dist/(forum|admin)\.js(\.map)?$'
    })
    if ($unexpected.Count -gt 0) {
        $unexpected | Write-Host
        throw "Есть другие локальные изменения. Остановитесь и пришлите список."
    }
    $backup = Join-Path $PWD ("_backups\before-release-hardening-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Path $backup | Out-Null
    Invoke-MapsCheck { tar.exe --exclude=node_modules -czf "$backup\extension.tgz" extension }
    if ((Get-Item "$backup\extension.tgz").Length -le 0) { throw "Резервная копия пуста." }
    Invoke-MapsCheck { tar.exe -tzf "$backup\extension.tgz" > $null }
    Invoke-MapsCheck { docker compose start db app prototype }
    Invoke-MapsCheck {
        git -C .\extension fetch origin refs/heads/fix/build-dependency-audit:refs/remotes/origin/fix/build-dependency-audit
    }
    Invoke-MapsCheck { git -C .\extension cat-file -e "${target}^{commit}" }
    if ($dirty.Count -gt 0) {
        Invoke-MapsCheck {
            git -C .\extension stash push -m "before-release-hardening-$(Get-Date -Format yyyyMMdd-HHmmss)" -- js/dist/forum.js js/dist/forum.js.map js/dist/admin.js js/dist/admin.js.map
        }
    }
    Invoke-MapsCheck { git -C .\extension switch -c test/release-hardening-e917eaa $target }
    Invoke-MapsCheck { docker compose run --rm node npm ci }
    Invoke-MapsCheck { docker compose run --rm node npm run check }
    Invoke-MapsCheck {
        docker compose exec -T -w /var/www/flarum app composer dump-autoload --no-interaction
    }
    Invoke-MapsCheck {
        docker compose exec -T -w /var/www/flarum app php flarum cache:clear
    }
    Invoke-MapsCheck { docker compose restart app }
    Write-Host "Готово. Копия кода: $backup. Обновите все тестовые вкладки через Ctrl+F5."
}
```

## Что требуется проверить вручную

1. Обычная загрузка, вход, новая тема/ответ с BBCode, picker/отмена/публикация.
2. Позиции и переназначение фишек обновляются между двумя клиентами; прежний
   владелец получает отказ, текущий владелец может двигать свою фишку.
3. Конфликт и новый осознанный ход по [сценарию Alpha.2](QA-v0.3-alpha2-move-conflicts.md#manual-conflict-on-two-devices-or-one-computer).
4. Возврат реальной фоновой вкладки, прокрутка к карте, восстановление после
   временного отключения сети. Ошибка исчезает, карта остаётся рабочей.
5. Тема оформления и используемые устройства: масштаб/прокрутка/drag без
   горизонтального overflow. Отсутствие pinch/touch-pan остаётся известным
   ограничением, а не регрессией этой сборки.

Если возникает ошибка, сообщить шаг, роль аккаунта и вывод/статус запроса;
пароли, cookies, CSRF и архив БД не отправлять. При успешных проверках сообщить
точный HEAD. Решение о релизе — по [чек-листу](RELEASE-CHECKLIST.md).
