# Interactive Maps v0.1 — первый рабочий этап

Разработано для **Flarum 2.x** и локальной Docker-среды `flarum-map-lab`.

## Что есть в версии 0.1

- Нативная страница `/maps`, открывается внутри Flarum.
- Список карт + создание карты администратором.
- Изображение фона по URL (для лаборатории — `http://localhost:8081/map.jpg`).
- Настраиваемая квадратная сетка: размер, смещения, включение, привязка фишек.
- Создание фишек по URL изображения.
- Привязка фишки к `username` зарегистрированного пользователя Flarum.
- Администратор может перемещать любую фишку, игрок — только назначенную ему.
- Проверка разрешения и координат выполняется **на PHP-сервере**, не в браузере.
- Позиции хранятся в MariaDB в таблице `chak_tokens`.
- Каждые 5 секунд другие открытые вкладки обновляют расположение фишек.

**Пока нет:** загрузки файлов через UI, произвольных фигур/гексов, zoom/pan, истории действий, продвинутых групповых прав, тумана войны. Карты пока публичны для всех посетителей форума. **Не размещай секретные карты в этой версии.** Управление картами доступно только администратору.

## Установка на Windows — PowerShell

Убедись, что Docker контейнеры `app`, `db`, `prototype` работают:

```powershell
docker compose ps
```

1. Перемести скачанный архив `flarum-interactive-maps-v0.1.zip` в папку `flarum-map-lab\flarum-map-lab` — рядом с `docker-compose.yml`.

2. Из этой папки в PowerShell:

```powershell
Expand-Archive ".\flarum-interactive-maps-v0.1.zip" -DestinationPath ".\extension" -Force
```

**Важно:** в `.\extension\` теперь должны быть файлы `composer.json`, `extend.php`, `js\package.json` и папки `src`, `migrations`. **Не создавай вложенную папку `extension\flarum-interactive-maps-v0.1`**.

3. Подключи папку расширения к Composer как локальный пакет (только один раз):

```powershell
docker compose exec app composer config repositories.local path "packages/*"
```

4. Установи локальный пакет через Composer:

```powershell
docker compose exec app composer require "chakchakman/flarum-interactive-maps:*@dev" --no-interaction
```

Если Composer не нашёл пакет, убедись, что `extension/composer.json` присутствует, а `app` видит его через смонтированную папку `/var/www/flarum/packages/map-correct`:

```powershell
docker compose exec app ls -la /var/www/flarum/packages/map-correct
```

5. Собери JS frontend. Команды ниже используют отдельный контейнер Node из лаборатории; устанавливать Node.js в Windows не нужно:

```powershell
docker compose run --rm node npm install
```

```powershell
docker compose run --rm node npm run build
```

6. Очисти кеш Flarum:

```powershell
docker compose exec app php flarum cache:clear
```

7. Открой **http://localhost:8080/admin** → Extensions → **Interactive Maps (DEV)** → Enable.

8. Перейди на **http://localhost:8080/maps**.

## Мини-тест функциональности

1. Администратор создаёт карту «Evil West Test», оставив предложенный фон `http://localhost:8081/map.jpg`.
2. В редакторе карты добавляет фишку, например:
   - Имя: `Сайлас МакГроу`
   - Адрес изображения: `http://localhost:8081/percy/silas.png`
   - Владелец: свой `username` Flarum (или имя другого тестового пользователя).
3. Двигает фишку мышью.
4. Обновляет страницу — новая позиция должна сохраняться.
5. Меняет размер сетки и смещение; обновляет страницу — настройки должны сохраняться.
6. Проверяет во втором браузере с другим аккаунтом Flarum: назначенный игрок может двигать свою фишку, чужие не двигаются.

## Диагностика

Если страница пустая либо выдаёт ошибку 500:

```powershell
docker compose logs --tail=100 app
```

Логи PHP / Flarum:

```powershell
docker compose exec app sh -c "ls -l storage/logs; tail -n 80 storage/logs/*.log"
```

Если после изменения JS не видны изменения:

```powershell
docker compose run --rm node npm run build
docker compose exec app php flarum cache:clear
```

Если изменяли PHP/миграции:

```powershell
docker compose exec app php flarum migrate
docker compose exec app php flarum cache:clear
```

## Как устроен код

```text
extension/
├── composer.json          # имя и настройки Composer-пакета
├── extend.php             # регистрация frontend и API-маршрутов
├── migrations/            # таблицы chak_maps и chak_tokens
├── src/
│   ├── Api/               # серверные обработчики с авторизацией
│   └── Models/            # модели MariaDB
├── js/
│   ├── src/forum/
│   │   ├── extend.js       # маршруты /maps и /maps/:id
│   │   └── pages/          # визуальный интерфейс карт
│   ├── package.json
│   └── webpack.config.js
└── less/forum.less        # стили интерфейса
```

Этот архив **не обновляет старый `map-correct`** и **не изменяет существующие сообщения форума**. Для теста используются изображения, которые Nginx уже отдаёт на 8081. Firebase из прототипа не используется.

## Следующий этап

Настройка редактора: загрузка своих фонов и токенов, список пользователей с автопоиском, роли «мастер» и «игрок», панорамирование и масштабирование карты.
