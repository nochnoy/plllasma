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
| MySQL (для GUI-клиента с хоста) | `localhost:3307`, юзер `plllasma` / пароль `dev`, база `plllasma` |
| garden-сервер (API чата) | http://localhost:8080 |

Проверка, что всё живое:

```bash
curl http://localhost:8090/api/user-by-token.php            # -> 401 {"error": "auth"}
curl -H "X-Auth-Token: <токен>" http://localhost:8090/api/user-by-token.php
```

Останов: `docker compose down` (данные останутся в томах). Начать с чистой базой:
`docker compose down -v` и снова `up` — схема пересеется из `db/`.

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
  схемы прода (включая уже применённые миграции из `db/migrations/`, поэтому
  отдельно они в контейнер не монтируются). Появилась миграция новее снимка —
  добавьте её монтирование в `docker-compose.yml` строкой с номером 02 и далее
  (файлы в `docker-entrypoint-initdb.d` выполняются по алфавиту), затем
  `down -v` + `up`.
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
