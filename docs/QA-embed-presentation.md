# QA: расположение и сворачивание карты

Ветка feature/embed-presentation; база — принятая владельцем e917eaa с планом
4e0d803. Реализованы параметры при прикреплении из composer/меню поста и
редактирование через «Отображение карты» в меню доступного для редактирования
поста. Первый пост темы использует обычную связь карты с сообщением.

## Протокол и миграция

В chak_map_embeds добавлены display_position VARCHAR(5) default 'below' и
starts_collapsed boolean default false. Существующие связи/карты/фишки
сохраняются. Новые прикрепления принимают displayPosition above/below и
startsCollapsed boolean; composer передаёт chakMapDisplayPosition и
chakMapInitiallyCollapsed вместе с chakMapId в одной атомарной публикации.
PATCH /chak-map-embeds/{postId} меняет только общие параметры, с прежними
manage/embed/edit и scoped visibility проверками. Три post hints используют
один request-scoped lookup на discussion; в них нет изображения/токенов.

Синтетический upgrade/rollback проверяет сохранность данных. Точечный helper
scripts/Migrate-EmbedPresentation.php отказывается работать при неожиданной
pending migration/частичной схеме и проверяет количество maps/tokens/links.
Применение к стенду владельца требует свежей копии БД и отдельного согласования;
по умолчанию глобальный flarum migrate запускать нельзя.

## Автоматические проверки

64 JS/build: helper null/defaults, расположение рядом с Post-body после header,
сохранение unkeyed vnode invariant; picker VM tests сохраняют строгую проверку
тела запроса и успешного/неуспешного обновления post hint. PHP strict validation
и SQLite migration preservation/rollback прошли; real-Flarum scopes дополнены
проверками нового PATCH. Финальный общий browser/CI фиксируется в PROJECT-CONTEXT.

Browser cases проверяют:

- Composer первого поста, above+collapsed, порядок header/map/text, отсутствие
  GET embed/sync пока закрыто, клавиатурное раскрытие и persisted default.
- Старые defaults below/expanded, saved-post settings, BBCode, invalid options,
  player denial и запрет раскрытия карты скрытого поста.
- Отмену незавершённого drag без записи, остановку polling и свежую позицию.
- Ровно одну запись при закрытии/раскрытии во время pending save; ожидание
  подтверждения до нового чтения; late GET не раскрывает закрытый блок.

Закрытие локально для данного отображения и не меняет общий default. При
раскрытии заново проверяется доступ/позиции; масштаб после пересоздания доски
возвращается к «Вписать». Повторное открытие темы использует сохранённый default,
личный выбор между посещениями пока не запоминается.

## Приёмка владельцем

После согласованного upgrade проверить above/below и expanded/collapsed в первом
посте/ответе/сохранённом посте, независимость двух прикреплений одной карты,
клавиатуру/реальную тему/ширину экрана. Проверить скрытие/отзыв доступа пока
закрыто, восстановление сети, pending move и обычный редактор/BBCode.
Реализовано в коде; точные auto results отдельно; ручная приёмка новой функции
и принятие к выпуску пока отсутствуют.


Финальная cumulative проверка: f950993, 64 JS/31 browser, оба CI успешны; ссылки/точные результаты в PROJECT-CONTEXT и QA-local-map-backgrounds. Первый a4 runtime имел lifecycle assumption о placeholder скрытого поста; новый case требует настоящий404/no data/no included/no board и допускает штатное unmount Flarum. Ручная приёмка новой presentation и разрешение на её миграцию ещё ожидаются.
