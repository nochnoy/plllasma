# PowerShell скрипты для управления Docker контейнерами

Write-Host "🐳 Plllasma Backend Docker Management Scripts" -ForegroundColor Cyan

function Show-Menu {
    Write-Host ""
    Write-Host "Выберите действие:" -ForegroundColor Yellow
    Write-Host "1. Запустить продакшн окружение" -ForegroundColor Green
    Write-Host "2. Запустить dev окружение" -ForegroundColor Green
    Write-Host "3. Остановить все контейнеры" -ForegroundColor Red
    Write-Host "4. Пересобрать образы" -ForegroundColor Blue
    Write-Host "5. Показать логи" -ForegroundColor Magenta
    Write-Host "6. Подключиться к MySQL" -ForegroundColor Cyan
    Write-Host "7. Очистить volumes" -ForegroundColor Red
    Write-Host "0. Выход" -ForegroundColor Gray
    Write-Host ""
}

function Start-Production {
    Write-Host "🚀 Запуск продакшн окружения..." -ForegroundColor Green
    docker-compose -f docker-compose.yml up -d
    Write-Host "✅ Продакшн окружение запущено!" -ForegroundColor Green
    Write-Host "📊 Backend: http://localhost:3001" -ForegroundColor Cyan
    Write-Host "🗄️ phpMyAdmin: http://localhost:8080" -ForegroundColor Cyan
    Write-Host "🔗 MySQL: localhost:3306" -ForegroundColor Cyan
}

function Start-Development {
    Write-Host "🛠️ Запуск dev окружения..." -ForegroundColor Green
    docker-compose -f docker-compose.dev.yml up -d
    Write-Host "✅ Dev окружение запущено!" -ForegroundColor Green
    Write-Host "📊 Backend: http://localhost:3001" -ForegroundColor Cyan
    Write-Host "🗄️ phpMyAdmin: http://localhost:8081" -ForegroundColor Cyan
    Write-Host "🔗 MySQL: localhost:3307" -ForegroundColor Cyan
}

function Stop-All {
    Write-Host "🛑 Остановка всех контейнеров..." -ForegroundColor Red
    docker-compose -f docker-compose.yml down
    docker-compose -f docker-compose.dev.yml down
    Write-Host "✅ Все контейнеры остановлены!" -ForegroundColor Green
}

function Rebuild-Images {
    Write-Host "🔨 Пересборка образов..." -ForegroundColor Blue
    docker-compose -f docker-compose.yml build --no-cache
    docker-compose -f docker-compose.dev.yml build --no-cache
    Write-Host "✅ Образы пересобраны!" -ForegroundColor Green
}

function Show-Logs {
    Write-Host "📋 Выберите окружение для просмотра логов:" -ForegroundColor Magenta
    Write-Host "1. Продакшн"
    Write-Host "2. Dev"
    $choice = Read-Host "Введите номер"
    
    switch ($choice) {
        "1" {
            docker-compose -f docker-compose.yml logs -f backend
        }
        "2" {
            docker-compose -f docker-compose.dev.yml logs -f backend
        }
        default {
            Write-Host "❌ Неверный выбор" -ForegroundColor Red
        }
    }
}

function Connect-MySQL {
    Write-Host "🗄️ Подключение к MySQL..." -ForegroundColor Cyan
    Write-Host "Выберите окружение:" -ForegroundColor Yellow
    Write-Host "1. Продакшн (порт 3306)"
    Write-Host "2. Dev (порт 3307)"
    $choice = Read-Host "Введите номер"
    
    switch ($choice) {
        "1" {
            docker exec -it plllasma_mysql mysql -u plllasma -p plllasma
        }
        "2" {
            docker exec -it plllasma_mysql_dev mysql -u plllasma -p plllasma
        }
        default {
            Write-Host "❌ Неверный выбор" -ForegroundColor Red
        }
    }
}

function Clean-Volumes {
    Write-Host "🧹 Очистка volumes..." -ForegroundColor Red
    Write-Host "⚠️ Это удалит все данные в базе данных!" -ForegroundColor Yellow
    $confirm = Read-Host "Продолжить? (y/N)"
    
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        docker-compose -f docker-compose.yml down -v
        docker-compose -f docker-compose.dev.yml down -v
        docker volume prune -f
        Write-Host "✅ Volumes очищены!" -ForegroundColor Green
    } else {
        Write-Host "❌ Операция отменена" -ForegroundColor Red
    }
}

# Основной цикл
do {
    Show-Menu
    $choice = Read-Host "Введите номер"
    
    switch ($choice) {
        "1" { Start-Production }
        "2" { Start-Development }
        "3" { Stop-All }
        "4" { Rebuild-Images }
        "5" { Show-Logs }
        "6" { Connect-MySQL }
        "7" { Clean-Volumes }
        "0" { 
            Write-Host "👋 До свидания!" -ForegroundColor Cyan
            break 
        }
        default { 
            Write-Host "❌ Неверный выбор" -ForegroundColor Red
        }
    }
    
    if ($choice -ne "0") {
        Read-Host "Нажмите Enter для продолжения"
    }
} while ($choice -ne "0")
