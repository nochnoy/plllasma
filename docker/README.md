# Docker для локальной разработки

Поднимает то, что на Windows-машине поднимать больнее всего: **PHP 7.4 + Apache**,
**MySQL 8** (засеянный схемой из `db/`) и **сервер мини-игры garden**. Фронты
(основной Angular в `frontend/` и игра в `garden/frontend/`) гоняются с хоста
через `npm run dev` — vite сам ходит в свои API.

## Запуск

```bash
docker compose up -d --build     # первый запуск: собрать образы и засеять базу
docker compose ps                # ждать, пока mysql станет healthy (инициализация ~полминуты)
```

| Что | Адрес |
| --- | --- |
| Сайт (api и всё в корне репо) | http://localhost:8090 |
| MySQL (для GUI-клиента с хоста) | `localhost:3308`, юзер `plllasma` / пароль `dev`, база `plllasma` |
| garden-сервер (API чата) | http://localhost:8080 |
| Клиент плазмы (Angular) | https://localhost:4200 — `npm run start:docker` в `frontend/` |

## Клиенты

**Клиент плазмы** (`frontend/`). Обычный `npm start` гоняет его против прода
(`proxy.conf.js`), против докера — отдельный прокси и скрипт:

```bash
cd frontend
npm install          # один раз
npm run start:docker # https://localhost:4200 (ssl зашит в angular.json, сертификат свой —
                     # браузер предупредит о самоподписанном)
```

В базе после засева только схема: ни юзеров, ни сообщений. Тестовый (пароль в базе лежит открытым
текстом, `test` / `dev`):

```bash
docker compose exec -T mysql mysql --default-character-set=utf8mb4 -uroot -proot plllasma -e "INSERT INTO tbl_users (id_user, login, password, nick, logkey, email, country, businesstext, realname, firstnick, profile, profile_changed, profile_visits) VALUES (1, 'test', 'dev', 'ТестЮзер', '', '', '', '', '', '', '', NOW(), 0);"
```

**Игра garden** (`garden/frontend/`): `npm install && npm run dev` — vite поднимет
страницу на http://localhost:5173, сам проксирует `/api` на garden-контейнер (:8080) и `/i` (юзерпики) —
на web (:8090). Игра пускает только вошедших на сайт: токен берётся из куки `contortion_key`, а сайт
кладёт её в корень домена (`Path=/`), и куки не различают портов — поэтому достаточно войти в клиенте
(https://localhost:4200) или прямо на сайте (:8090), и страница на :5173 откроется без церемоний. Если
сайта рядом нет, токен дают адресом — `http://localhost:5173/?token=<logkey>` (после логина токен виден
в базе: `docker compose exec mysql mysql -uroot -proot plllasma -e "SELECT logkey FROM tbl_users WHERE
login='marat'"`, или задайте его сами UPDATE-ом). Сам garden-контейнер уже настроен: `GARDEN_AUTH_URL`
в compose указывает ему на дверь сайта о токенах.

Проверка, что всё живое:

```bash
curl http://localhost:8090/api/user-by-token.php            # -> 401 {"error": "auth"}
curl -H "X-Auth-Token: <токен>" http://localhost:8090/api/user-by-token.php
```

Останов: `docker compose down` (данные останутся в томах). Начать с чистой базой:
`docker compose down -v` и снова `up` — схема пересеется из `db/`.

## Где живут данные и как их бэкапить

Данные MySQL хранятся в **именованном docker-томе** `plllasma_mysql` — это и есть
стандартный способ «держать данные вне контейнера»: контейнер можно пересоздавать
(`docker compose up --force-recreate`), а база остаётся. Физически том лежит внутри
WSL, путь видно так:

```bash
docker volume inspect plllasma_mysql --format "{{.Mountpoint}}"
# /var/lib/docker/volumes/plllasma_mysql/_data
```

Засада одна: `docker compose down -v` этот том **удаляет** (и при следующем `up`
база пересоберётся из `db/plllasma.sql`). Поэтому боевые/нужные данные надо
выгружать в обычные файлы на диске.

> **Почему не bind-mount (папка на диске вместо тома).** Для MySQL на Windows так
> делать нельзя: при монтировании `./data:/var/lib/mysql` сервер зависает на
> инициализации (InnoDB отрабатывает, а сам mysqld не поднимается), плюс MySQL
> форсит `lower_case_table_names=2` (на проде — Linux, `0`). Проверено на этом
> проекте. Поэтому: том + бэкапы в файлы.

**Бэкап** — выгружает базу в `db/backups/plllasma-<дата>-<время>.sql` (папка в
`.gitignore`, это данные, а не код):

```powershell
powershell -ExecutionPolicy Bypass -File docker\db-backup.ps1
```

**Восстановление** — заливает указанный `.sql` в контейнер, предварительно
пересоздавая базу (текущее содержимое затирается):

```powershell
powershell -ExecutionPolicy Bypass -File docker\db-restore.ps1 db\backups\plllasma-20261005-180000.sql
```

Тем же скриптом заливается и **боевой дамп** — большой `.sql` с данными прода
(сотни МБ, поэтому такие файлы держат вне репозитория; в `db/` они игнорируются
по маске `db/20??????.sql`):

```powershell
powershell -ExecutionPolicy Bypass -File docker\db-restore.ps1 C:\dumps\plllasma-20260522.sql
```

> **Дамп старее миграции — прогоните миграцию.** Дамп — это снимок на дату
> выгрузки, а миграции из `db/migrations/` пишутся позже. Так было с дампом от
> 22.05.2026: в нём ещё старая таблица `lnk_user_ignor` и нет `lnk_user_ignore`,
> поэтому после заливки `api/login.php` падал в `functions-user.php` (таблицу
> `lnk_user_ignore` добавила миграция `2026-09-03-ignore-redesign.sql` от
> 03.09.2026). После заливки дампа прогоните миграции новее него:
>
> ```bash
> docker cp db/migrations/2026-09-03-ignore-redesign.sql plllasma-mysql-1:/tmp/m.sql
> docker compose exec -T mysql sh -c "mysql -uroot -proot plllasma < /tmp/m.sql"
> ```
>
> Это работает без пляски с `sql_mode`, потому что в `docker-compose.yml` у mysql
> он уже мягкий (см. ниже). Миграция не идемпотентна: повторный прогон упадёт на
> `Duplicate key name` — значит, она уже применена.

### Обновление снимка схемы `db/plllasma.sql`

Снимок — это структура боевой базы **без единой строки данных** (сид «пустой»
базы: юзер заводится вручную, см. выше). Делать его надо из базы, где схема
актуальна, — то есть из локальной, куда залит свежий боевой дамп и прогнаны
миграции:

```bash
docker compose exec -T mysql sh -c "mysqldump -uroot -proot --no-data --skip-add-drop-table --default-character-set=utf8mb4 --ignore-table=plllasma.bara_comments --ignore-table=plllasma.comments --ignore-table=plllasma.counters --ignore-table=plllasma.ig_actions --ignore-table=plllasma.ig_actions_tmp --ignore-table=plllasma.ig_games --ignore-table=plllasma.ig_maps --ignore-table=plllasma.ig_next_demo --ignore-table=plllasma.ig_next_subscriber --ignore-table=plllasma.ig_subscribers --ignore-table=plllasma.texts plllasma > /tmp/schema.sql"
docker cp plllasma-mysql-1:/tmp/schema.sql db/plllasma.sql
```

Важные опции: `--no-data` (данных в снимке быть не должно),
`--skip-add-drop-table` (`DROP TABLE` на пустой базе не нужен, а если снимок
случайно накатят на живую базу — не затрёт данные),
`--default-character-set=utf8mb4` и набор `--ignore-table`: в боевой базе лежат
ещё таблицы соседних проектов (`bara_comments`, `comments`, `counters`, `ig_*`,
`texts`) — нашему сайту они не нужны и в снимок не попадают. Из результата надо
выкинуть `AUTO_INCREMENT=NNNN` из опций таблиц — иначе следующая запись в пустой
базе начнётся не с 1. Проверка, что снимок полный, — `CREATE TABLE` в файле
столько же, сколько нужных нам таблиц (сейчас 28):

```powershell
(Select-String -Path db\plllasma.sql -Pattern '^CREATE TABLE').Count
```

## Как это устроено

- **Репозиторий монтируется в контейнер целиком** (`.` → `/var/www/html`): правки
  PHP видны сразу, без пересборки. Образ (`docker/web.Dockerfile`) — это PHP 7.4,
  как на проде, плюс `docker/php-dev.ini` (короткие теги, вывод ошибок, лимиты
  загрузок) и папка `/var/www/attachments` под `PATH_TO_STORAGE`.
- **Пароли лежат там же, где на проде.** `api/include/main.php` включает
  `../../plllasma-passwords.php` — «в родительской папке всех сайтов». В контейнере
  туда смонтирован `docker/dev-passwords.php` с одноразовым паролем `dev`.
  Настоящий пароль нужен только прод-серверу.
- **Хост БД берётся из окружения**: `getenv("DB_HOST")` в `main.php`. На проде
  переменной нет — остаётся прежний `localhost`.
- **База засеивается при первом старте**: `db/plllasma.sql` — снимок текущей
  **схемы** прода и только он (ни одной строки данных: база поднимается пустой).
  Миграции из `db/migrations/` в снимке уже есть, поэтому в контейнер отдельно
  они не монтируются; как обновить снимок — см. «Обновление снимка схемы» выше.
  Появилась миграция новее снимка — добавьте её монтирование в
  `docker-compose.yml` строкой с номером 02 и далее (файлы в
  `docker-entrypoint-initdb.d` выполняются по алфавиту), затем `down -v` + `up`.
- **sql_mode в контейнере мягче дефолтного** (как на проде): у `mysql` в
  `docker-compose.yml` снято два пункта.
  - `NO_ZERO_DATE`/`NO_ZERO_IN_DATE`. Боевые данные полны дат
    `'0000-00-00 00:00:00'` (`tbl_users.time_joined`, `tbl_log.time_created`,
    `lnk_user_place.time_viewed` и др.), а дефолт MySQL 8 такие значения отвергает
    (в т.ч. при `ALTER`, добавляющем индекс по такой колонке). Без этого локально
    падает, например, миграция `2026-09-03-ignore-redesign.sql`.
  - `ONLY_FULL_GROUP_BY`. Старый код писал запросы вроде `SELECT DISTINCT
    p.id_place, ... FROM tbl_places p ... ORDER BY p.weight`, где `p.weight` не в
    списке выборки (`api/include/functions-channels.php`). С дефолтным режимом
    MySQL 8 такой запрос падает с ошибкой 3065, и `api/channels.php` отдаёт
    `Fatal error` вместо JSON — на проде режим не включён, иначе список каналов не
    работал бы и там.
- **garden** (`docker/garden.Dockerfile`) — multi-stage сборка того самого
  `garden-server`: SQLite уезжает в том `garden-data`, код игры правится с хоста
  (`cd garden/frontend && npm run dev` — vite проксирует `/api` на `:8080`).

Скрипты миграции прав тоже можно гонять локально, не трогая прод:

```bash
docker compose exec web php scripts/access-snapshot.php    # снапшот уедет в scripts/out/
```

## Почему это не мешает деплою

Прод — Apache/MySQL на хосте (IspManager), деплой — `git pull`. Compose-файлы
приезжают на сервер вместе с кодом, но **сами ничего не запускают**: ни systemd,
 ни cron о них не знает. Локальные тома (база, аттачменты, SQLite garden) живут
в docker-томах на машине разработчика и git'ом не перетираются. Случайно
поднять докер на проде можно только зайдя по SSH и сделав это руками.
