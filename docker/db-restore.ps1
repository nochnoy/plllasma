# Восстановление базы в docker-контейнер MySQL из .sql-дампа.
#
# Зачем: вернуть данные из бэкапа (см. db-backup.ps1) или залить боевой дамп
# в локальную базу. База ПЕРЕСОЗДАЁТСЯ (DROP + CREATE), поэтому текущее
# содержимое будет затёрто — это ожидаемо.
#
# Запуск (из корня репозитория):
#   powershell -ExecutionPolicy Bypass -File docker\db-restore.ps1 db\backups\plllasma-20261005-180000.sql
#   powershell -ExecutionPolicy Bypass -File docker\db-restore.ps1 db\20260522.sql -Database plllasma
#
# Важно: имя базы должно совпадать с той, что внутри дампа (в дампах с
# --databases есть USE `<имя>`), иначе mysql переключится на другую базу.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$File,
    [string]$Database = 'plllasma',
    [string]$Service  = 'mysql'
)

$ErrorActionPreference = 'Continue'

Push-Location (Join-Path $PSScriptRoot '..')
try {
    $container = (docker compose ps -q $Service).Trim()
    if (-not $container) { throw "Контейнер '$Service' не запущен. Сначала: docker compose up -d" }
    if (-not (Test-Path $File)) { throw "Файл дампа не найден: $File" }
    $File = (Resolve-Path $File).Path

    $containerFile = "/tmp/restore-$([System.IO.Path]::GetFileName($File))"

    Write-Host "Копирую дамп в контейнер ($( Split-Path $File -Leaf ))..."
    docker cp $File "${container}:$containerFile"
    if ($LASTEXITCODE -ne 0) { throw "docker cp завершился с кодом $LASTEXITCODE" }

    Write-Host "Пересоздаю базу '$Database'..."
    $sql = "DROP DATABASE IF EXISTS $Database; CREATE DATABASE $Database CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
    docker compose exec -T -e MYSQL_PWD=root $Service mysql -uroot -e $sql
    if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE завершился с кодом $LASTEXITCODE" }

    Write-Host "Заливаю дамп..."
    docker compose exec -T -e MYSQL_PWD=root $Service sh -c "mysql -uroot --default-character-set=utf8mb4 $Database < $containerFile"
    if ($LASTEXITCODE -ne 0) { throw "Загрузка дампа завершилась с кодом $LASTEXITCODE" }

    docker compose exec -T $Service rm -f $containerFile | Out-Null

    Write-Host "Готово. Проверка:"
    docker compose exec -T -e MYSQL_PWD=root $Service mysql -uroot -e "SELECT COUNT(*) AS tables_cnt FROM information_schema.tables WHERE table_schema='$Database' AND table_type='BASE TABLE';"
}
finally {
    Pop-Location
}
