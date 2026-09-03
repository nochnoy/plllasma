# Игнор пользователей (ignore / vanish)

Дата внедрения: 2026-09-03. Миграция: `db/migrations/2026-09-03-ignore-redesign.sql`
(заодно добавляет индексы `tbl_messages(id_place,time_created)`, `(id_place,id_parent)`,
`(id_first_parent)` и `tbl_users(logkey)` и удаляет мёртвую таблицу `lnk_user_ignor`).

## Две градации

| | soft («Игнорировать») | vanish («Исчезнуть») |
|---|---|---|
| mode | 1 | 2 |
| Направленность | односторонняя | взаимная |
| Сообщения | видны и читаются, но без красных значков (`star`) | не показываются вообще, включая всю под-ветку вниз от сообщения исчезнувшего |
| Звёздочка канала | не звездится, если новые сообщения только от игнорируемых | то же |
| Отмена | сам юзер («Не игнорировать») | только инициатор («Вернуться») |
| UI профиля | плашка 😶 | плашка 💀 у обоих |

Градации взаимоисключающие: при vanish soft-ссылки скрыты (бэкенд отвечает `{"error":"vanished"}`),
при активном soft скрыта ссылка «Исчезнуть». Игнорить самого себя нельзя
(`cantIgnoreSelf`/`cantVanishSelf`/`cantUnignoreSelf`/`cantReturnSelf`).

## База данных

Таблица `lnk_user_ignore` (InnoDB):

- `id_user` — инициатор. Для mode=1 — кто игнорит; для mode=2 — кто нажал «Исчезнуть» (только он может отменить).
- `id_ignored_user` — кого игнорируют.
- `mode` — 1 = soft, 2 = vanish.
- `date_created`.

`UNIQUE KEY (id_user, id_ignored_user)` — одна запись на направленную пару; апгрейд soft→vanish
идёт через удаление всех записей пары и вставку mode=2 (см. `api/user-vanish.php`).
Уникальность vanish-пары в обе стороны обеспечивается кодом, не базой.

## Эндпоинты (api/)

Все POST, параметр `uid` (id юзера), авторизация по сессии/токену:

- `user-ignore.php` — включить soft. Ошибки: `invalid_user`, `cantIgnoreSelf`, `vanished` (пара уже в vanish). Повторный вызов идемпотентен.
- `user-unignore.php` — снять soft. Идемпотентен.
- `user-vanish.php` — включить vanish: транзакция удаляет все записи пары в обоих направлениях, вставляет одну mode=2 с текущим юзером как инициатор.
- `user-return.php` — отменить vanish. Ошибка `notInitiator`, если инициатор — другой юзер.

Все четыре обновляют закешированные в сессии списки юзера через `saveUserToSession()`
(в `functions-user.php`), иначе изменения применялись бы после перелогина.

## Серверная логика

**Загрузка списков** — `api/include/functions-user.php`, `buildUser()`:
- `ignored_soft` — кого я soft-игнорю (mode=1, id_user=я);
- `vanished` — все, с кем vanish, в обе стороны (независимо от инициатора);
- `vanished_by_me` — vanish-записи, где инициатор я (нужно для ссылки «Вернуться»).

`getUserInfoForClient()` отдаёт их клиенту как `ignoredSoft` / `vanished` / `vanishedByMe`
(в ответах login.php / register.php).

**Звёздочки каналов** (`_STAR_`) считаются на сервере с учётом обоих списков
(исключаются авторы `ignored_soft` + `vanished`):
- меню — `api/include/functions-channels.php`, `getChannels()`;
- каталог — `api/channels-list.php` (та же логика, одним агрегатным запросом);
- superstar (счётчик непрочитанных неподписанных) — `api/cron-update-superstars.php`:
  старый быстрый UPDATE для всех + отдельный тяжёлый для юзеров с записями
  в `lnk_user_ignore` (включая цели vanish — vanish взаимен).

Анонимные сообщения (`id_user IS NULL`) всегда звездят канал.

**Выдача сообщений** — `api/include/functions-channel.php`:
- В выборках сообщений vanish-фильтра НЕТ — скрытие делает клиент.
- Хелпер `sqlVanishFilter()` используется только в счётчиках «есть ли новое видимое»:
  счётчик звезданутых и подзапрос выбора веток для дайджеста в `getChannelJson()`.
  Не использовать его в отдающих запросах — пагинация разъедется.
- `buildMessagesJson()` проставляет флаги: `ignored:1` (soft), `van:1` (vanish),
  `star` не ставится обоим.

**Профиль мембера** — `api/members.php` отдаёт блок `ignore`:
`{uid, iIgnore, heIgnoresMe, vanished, vanishInitiatorMe}` (только для чужого профиля).
`uid` добавлен сознательно: массив `users` намеренно не светит id, но он и так публичен
через URL иконки `/i/{id}.gif`.

## Клиент (frontend/)

**Модель**: `IUserData` += `ignoredSoft`, `vanished`, `vanishedByMe` (app-model.ts);
маппинг в app.service.ts (`login$`, `register$`). `IChannelLink.star` ← серверный `_STAR_`
(http.service.ts).

**Звёздочки каналов рисуются только по серверному флагу** (`channel.star`),
сравнения дат `time_changed > time_viewed` в шаблонах больше нет
(main-menu.component.html, channels-page). При открытии канала звёздочка гасится
локально сразу (`channel.service.ts`, `getChannel`). Superstar на клиенте
(channels-page.component.ts, `updateSuperstar`) считается по тем же серверным флагам —
клиент и крон больше не затирают друг друга.

**Скрытие vanish** — `Utils.filterVanishedMessages()` (utils.ts): на сырых данных
до построения деревьев выбрасывает сообщения с `van:1` и всех потомков вниз по `pid`.
Применяется в `Channel.deserializeMessages()` и при догрузке треда
(channel-page.component.ts, test-messages-page.component.ts). Родитель, отсутствующий
в порции, исчезнувшим не считается (нормальный кейс дайджестов/догрузок).

Важно: контент исчезнувших приезжает на клиент и скрывается при отрисовке —
технически читаем в devtools. Осознанный компромисс ради простоты сервера.

**Профиль** — member-page: плашки `.ignoring` (😶 soft / 💀 vanish) перед описанием юзера,
блок команд `.member-ignore-block` (ссылки взаимоисключающие, на своём профиле скрыты —
`!isMe`). Команды в member-page.component.ts после успеха обновляют локальное состояние
и `userService.user`, затем перечитывают меню (`channelService.loadChannels$()`).

## Известные ограничения

- Vanish не фильтрует личную почту (inbox) и прямой просмотр сообщения по id (`i.php`).
- Заголовок ветки «N ответов» считает и скрытые ответы (денормализованный `children`).
- Дайджест ветки, чей исчезнувший рут не попал на текущую страницу канала, может
  показаться с пустым placeholder-рутом (редкий случай).
- Клиентский superstar не считает ни разу не открытые каналы (условие `ignoring === 0`),
  крон считает — пре-существующая асимметрия.
- Уже открытый канал перефильтруется при следующей загрузке, не мгновенно после
  включения vanish в профиле.
