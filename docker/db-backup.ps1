# Бэкап базы из docker-контейнера MySQL в ОБЫЧНУЮ папку на диске (db/backups/).
#
# Зачем: данные MySQL живут в docker-томе (внутри WSL, `docker compose down -v`
# их убивает). Этот скрипт выгружает базу в нормальный .sql на диске — его видно,
# можно скопировать на флешку/в облако и восстановить скриптом db-restore.ps1.
#
# Запуск (из корня репозитория):
#   powershell -ExecutionPolicy Bypass -File docker\db-backup.ps1
#   powershell -ExecutionPolicy Bypass -File docker\db-backup.ps1 -Database plllasma
#
# Редирект вывода mysqldump делается ВНУТРИ контейнера, а файл забирается
# через `docker cp`: PowerShell'овский `>` пишет UTF-16 и испортил бы дамп.

[CmdletBinding()]
param(
    [string]$Database = 'plllasma',
    [string]$OutDir   = 'db\backups',
    [string]$Service  = 'mysql'
)

$ErrorActionPreference = 'Continue'

# Работаем от корня репозитория — там же, где запускается docker compose
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $container = (docker compose ps -q $Service).Trim()
    if (-not $container) { throw "Контейнер '$Service' не запущен. Сначала: docker compose up -d" }

    if (-not [System.IO.Path]::IsPathRooted($OutDir)) { $OutDir = Join-Path (Get-Location) $OutDir }
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

    $stamp          = Get-Date -Format 'yyyyMMdd-HHmmss'
    $name           = "$Database-$stamp.sql"
    $hostFile       = Join-Path $OutDir $name
    $containerFile  = "/tmp/$name"

    Write-Host "Дамплю базу '$Database' из контейнера '$Service'..."
    docker compose exec -T -e MYSQL_PWD=root $Service sh -c "mysqldump -uroot --default-character-set=utf8mb4 --single-transaction --routines --triggers --events --databases $Database > $containerFile"
    if ($LASTEXITCODE -ne 0) { throw "mysqldump завершился с кодом $LASTEXITCODE" }

    Write-Host "Забираю дамп на диск..."
    docker cp "${container}:$containerFile" $hostFile
    if ($LASTEXITCODE -ne 0) { throw "docker cp завершился с кодом $LASTEXITCODE" }

    docker compose exec -T $Service rm -f $containerFile | Out-Null

    $sizeMb = [math]::Round((Get-Item $hostFile).Length / 1MB, 2)
    Write-Host "Готово: $hostFile ($sizeMb МБ)"
}
finally {
    Pop-Location
}
