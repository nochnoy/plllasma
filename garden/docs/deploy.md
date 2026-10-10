# Деплой: как сад попадает на plllasma.ru

Здесь — боевое развёртывание: что за сервер, где что лежит, как собрать и залить с нуля,
как обновляться потом и как читать типовые отказы. Локальная разработка описана в
[`../README.md`](../README.md) и [`chat.md`](chat.md) (`air` + `npm run dev` + docker-стек);
**docker — только локальная разработка**, на проде его нет вообще: Apache и MySQL живут
на хосте под IspManager, деплой кода — `git pull`.

## Что за сервер

| Факт | Значение |
| --- | --- |
| ОС | Ubuntu, панель IspManager 6 |
| Веб | nginx 1.18 спереди (80/443, TLS здесь) → Apache MPM-ITK сзади на **127.0.0.1:8080** |
| PHP | 7.4, модуль Apache; MySQL 8.0.28 |
| Домены | **plllasma.ru и plllasma.com** — оба живые, люди ходят через оба |
| Код сайта | docroot — сам git-чекаут этого репозитория: обновление кода сайта — `git pull` |
| Vhost'ы | IspManager хранит их не в `sites-available` — искать через `grep -rl plllasma /etc/apache2/` (обычно `/etc/apache2/includes/`). `000-default.conf` — стоковый дефолт Apache, к сайту отношения не имеет |
| Порт 8080 | **занят Apache** — поэтому garden-сервер слушает 8081 |

## Что где живёт на проде

| Что | Где | Как попадает |
| --- | --- | --- |
| Код сайта, `api/user-by-token.php` | docroot сайта (git-чекаут) | `git pull` |
| Собранная игра (`garden/frontend/dist/`) | `<docroot>/garden/` | вручную по SFTP — **в git не входит** |
| Бинарь `garden-server` (Linux amd64) | `/opt/garden/garden-server`, `chmod +x` | вручную по SFTP, **передача binary** — в git не входит |
| База (SQLite, WAL) | `/opt/garden/data/garden.db` | создаёт сам сервер при старте; **включить в бэкапы** |
| systemd-юнит | `/etc/systemd/system/garden.service` | см. ниже |
| Прокси Apache | `/etc/apache2/conf-available/garden.conf` (+ `a2enconf garden`) | см. ниже |

`/opt/garden` должен принадлежать `www-data` — сервис работает из-под него, и каталог
базы (`data/`) сервер создаёт сам, но только внутри уже своей папки (иначе —
`permission denied` на старте, см. диагностику).

## Сборка артефактов (на машине с Windows)

Оба артефакта собираются локально и заливаются руками.

**Фронт** — статика с относительными путями, ложится в любой подкаталог:

```bash
cd garden/frontend
npm ci && npm run build        # → garden/frontend/dist/
```

**Бинарь** — кросс-компиляция под Linux; sqlite чистый на Go (`modernc.org/sqlite`),
cgo не нужен, бинарь выходит статическим.

PowerShell:

```powershell
cd E:\<путь>\plllasma\garden\backend
$env:GOOS='linux'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'; go build -o garden-server .
```

cmd:

```cmd
cd /d E:\<путь>\plllasma\garden\backend
set GOOS=linux
set GOARCH=amd64
set CGO_ENABLED=0
go build -o garden-server .
```

Переменные живут до закрытия окна: собрав linux-версию, для локальной сборки
откройте новое окно (или снимите `Remove-Item Env:GOOS, Env:GOARCH` в PowerShell).
Проверка результата: первые байты файла — `ELF` (`Format-Hex garden-server | Select -First 2`).

## Первый деплой (с нуля)

### 1. Код сайта

```bash
cd <docroot сайта> && git pull
```

Среди прочего приезжает `api/user-by-token.php` — дверь, по которой garden-сервер
спрашивает сайт о токенах. Проверка её сама по себе:

```bash
curl -H "X-Auth-Token: <чужой>" https://plllasma.ru/api/user-by-token.php   # → 401
curl -H "X-Auth-Token: <свой logkey>" https://plllasma.ru/api/user-by-token.php
# → {"userId":…,"nick":"…","icon":"…","iconsPath":"…"}
```

Токен — тот же `logkey` из `tbl_users`, что лежит в куке `contortion_key` (она не
HttpOnly, страница читает её сама). Миграций MySQL у garden нет — авторизация
пользуется существующей таблицей игроков.

### 2. Файлы

- содержимое `dist/` (index.html, assets/, favicon.ico) → `<docroot>/garden/`;
- `garden-server` → `/opt/garden/garden-server`, затем `chmod +x`.

### 3. Каталог и права

```bash
mkdir -p /opt/garden
chown www-data:www-data /opt/garden
```

### 4. systemd-юнит

`/etc/systemd/system/garden.service`:

```ini
[Unit]
Description=plllasma garden server (mini-game chat and recordings)
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/garden
ExecStart=/opt/garden/garden-server -addr 127.0.0.1:8081 -db /opt/garden/data/garden.db -auth-url https://plllasma.ru/api/user-by-token.php
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now garden
journalctl -u garden -n 5 --no-pager
# ждём: listening on 127.0.0.1:8081, keeping everything in /opt/garden/data/garden.db
```

`-addr 127.0.0.1` обязателен: у сервера ни TLS, ни домена нет, наружу его публикует
только прокси. `-auth-url` — сервер-сервер на той же машине, браузер его не видит.
Остановка по SIGTERM обрабатывается кодом (`graceful shutdown`), так что
`systemctl restart garden` безопасен для базы в любой момент.

### 5. Apache: прокси (сразу на все домены)

Модули и общий конфиг:

```bash
a2enmod proxy proxy_http        # idempotentно: «already enabled» — не ошибка
```

`/etc/apache2/conf-available/garden.conf`:

```apache
ProxyPass        /garden/api http://127.0.0.1:8081/api
ProxyPassReverse /garden/api http://127.0.0.1:8081/api
```

```bash
a2enconf garden
apachectl -t && systemctl reload apache2
```

`ProxyPass` объявлен **на уровне сервера**, а не внутри vhost — он действует на все
виртуалхосты сразу, то есть на plllasma.ru и plllasma.com одинаково, и на будущие
домены тоже. Вставлять эти строки в vhost (или — тем более — `LoadModule` в vhost)
не нужно и вредно.

### 6. Проверка

```bash
# а) сервер жив сам по себе
curl http://127.0.0.1:8081/api/health            # {"ok":true}

# б) оба домена достают его через прокси
curl https://plllasma.ru/garden/api/health       # {"ok":true}
curl https://plllasma.com/garden/api/health      # {"ok":true}
```

И по-человечески: открыть сайт **залогиненным**, зайти на `/garden/`, нажать
«Сцена», взять куклу — в углу появляется «<ник>: Начал игру (Идёт стрим)» с рабочей
ссылкой. Это проверяет всю цепочку разом: куку → `user-by-token.php` → базу → чат →
запись прогона. Невошедшему страница честно отвечает «Вы не вошли на сайт» — это
не поломка.

## Про второй домен (plllasma.com)

Игра специально написана на относительных путях: адрес API строится от адреса
страницы (`./api` → `/garden/api` на каком домене страница открыта), юзерпики —
пути от текущего origin. Кука `contortion_key` у залогиненного есть на том домене,
где он залогинен. Поэтому для .com не нужно ничего сверх общего `ProxyPass` выше.
`-auth-url` при этом прописан на .ru — это вопрос «какой двери сервер задаёт вопрос
о токене», обе двери читают одну и ту же базу.

## Обновление (каждый раз)

```bash
# локально: пересобрать оба артефакта (см. «Сборка»), тесты зелёные:
#   cd garden/frontend && npm test ; cd ../backend && go test ./...

# залить по SFTP:
#   dist/*          → <docroot>/garden/   (целиком, с заменой)
#   garden-server   → /opt/garden/        (binary!)

# на сервере:
chmod +x /opt/garden/garden-server
systemctl restart garden
curl -s https://plllasma.ru/garden/api/health   # {"ok":true}
```

Код сайта обновляется обычным `git pull`. Перезапуск юнита после замены бинаря
**обязателен** — старый процесс держит порт и продолжает работать со старым кодом,
пока его не тронешь.

Схема базы мигрирует при старте сама; подъём версии схемы storage считает поводом
вычистить записи старого формата (это осознанное поведение `store.go` — файлы
устаревшего кодека всё равно никто не смог бы проиграть).

## Диагностика

| Симптом | Причина и лечение |
| --- | --- |
| `curl …/garden/api/health` → **503** | ProxyPass стучится, а на порту никого. `ss -tlnp \| grep 8081` — garden-сервера нет? Смотреть `journalctl -u garden -n 30`. Если локальный `curl http://127.0.0.1:8081/api/health` отвечает, а публичный — нет, виноват Apache-конфиг (`a2enconf garden`, `apache2ctl -M \| grep proxy`, `apachectl -t`) |
| `journalctl`: `mkdir /opt/garden/data: permission denied` | `/opt/garden` не принадлежит сервисному пользователю: `chown www-data:www-data /opt/garden` |
| `journalctl`: `Start request repeated too quickly` | systemd закрыл старт после серии падений: `systemctl reset-failed garden`, затем `restart` |
| `journalctl`: `bind: Only one usage of each socket address` | порт занят (8080 — это Apache): в юните должен быть `8081`; после правки — `daemon-reload` |
| `journalctl`: `no auth endpoint is configured` | в ExecStart потерялся `-auth-url` |
| Браузер: «Вы не вошли на сайт» | куки `contortion_key` нет — игрок не залогинен на этом домене (или логинится через другой). Не поломка |
| В чате пусто, в консоли `[free-falling-girl] the chat could not reach the server` | страница не достучалась до API: проверить health на том домене, с которого открыта страница |

Порядок проверки при любой неполадке — с конца наружу: процесс (`ss`, `journalctl`)
→ локальный прокси (`curl 127.0.0.1:8081`) → публичные домены (`curl /api/health`)
→ браузер.

## Чем проверяется до заливки

| Где | Что |
| --- | --- |
| `cd garden/frontend && npm test` | клиент целиком поверх поддельного провода |
| `cd garden/backend && go test ./...` | хранилище и двери API |
| `cd garden/frontend && npm run build && node ../tools/smoke.mjs` | собранная игра настоящими нажатиями (сервер смоук изображает сам — настоящий бэкенд он не проверяет) |
