#!/bin/bash

# Bash скрипты для управления Docker контейнерами

echo "🐳 Plllasma Backend Docker Management Scripts"

show_menu() {
    echo ""
    echo "Выберите действие:"
    echo "1. Запустить продакшн окружение"
    echo "2. Запустить dev окружение"
    echo "3. Остановить все контейнеры"
    echo "4. Пересобрать образы"
    echo "5. Показать логи"
    echo "6. Подключиться к MySQL"
    echo "7. Очистить volumes"
    echo "0. Выход"
    echo ""
}

start_production() {
    echo "🚀 Запуск продакшн окружения..."
    docker-compose -f docker-compose.yml up -d
    echo "✅ Продакшн окружение запущено!"
    echo "📊 Backend: http://localhost:3001"
    echo "🗄️ phpMyAdmin: http://localhost:8080"
    echo "🔗 MySQL: localhost:3306"
}

start_development() {
    echo "🛠️ Запуск dev окружения..."
    docker-compose -f docker-compose.dev.yml up -d
    echo "✅ Dev окружение запущено!"
    echo "📊 Backend: http://localhost:3001"
    echo "🗄️ phpMyAdmin: http://localhost:8081"
    echo "🔗 MySQL: localhost:3307"
}

stop_all() {
    echo "🛑 Остановка всех контейнеров..."
    docker-compose -f docker-compose.yml down
    docker-compose -f docker-compose.dev.yml down
    echo "✅ Все контейнеры остановлены!"
}

rebuild_images() {
    echo "🔨 Пересборка образов..."
    docker-compose -f docker-compose.yml build --no-cache
    docker-compose -f docker-compose.dev.yml build --no-cache
    echo "✅ Образы пересобраны!"
}

show_logs() {
    echo "📋 Выберите окружение для просмотра логов:"
    echo "1. Продакшн"
    echo "2. Dev"
    read -p "Введите номер: " choice
    
    case $choice in
        1)
            docker-compose -f docker-compose.yml logs -f backend
            ;;
        2)
            docker-compose -f docker-compose.dev.yml logs -f backend
            ;;
        *)
            echo "❌ Неверный выбор"
            ;;
    esac
}

connect_mysql() {
    echo "🗄️ Подключение к MySQL..."
    echo "Выберите окружение:"
    echo "1. Продакшн (порт 3306)"
    echo "2. Dev (порт 3307)"
    read -p "Введите номер: " choice
    
    case $choice in
        1)
            docker exec -it plllasma_mysql mysql -u plllasma -p plllasma
            ;;
        2)
            docker exec -it plllasma_mysql_dev mysql -u plllasma -p plllasma
            ;;
        *)
            echo "❌ Неверный выбор"
            ;;
    esac
}

clean_volumes() {
    echo "🧹 Очистка volumes..."
    echo "⚠️ Это удалит все данные в базе данных!"
    read -p "Продолжить? (y/N): " confirm
    
    if [[ $confirm == "y" || $confirm == "Y" ]]; then
        docker-compose -f docker-compose.yml down -v
        docker-compose -f docker-compose.dev.yml down -v
        docker volume prune -f
        echo "✅ Volumes очищены!"
    else
        echo "❌ Операция отменена"
    fi
}

# Основной цикл
while true; do
    show_menu
    read -p "Введите номер: " choice
    
    case $choice in
        1) start_production ;;
        2) start_development ;;
        3) stop_all ;;
        4) rebuild_images ;;
        5) show_logs ;;
        6) connect_mysql ;;
        7) clean_volumes ;;
        0) 
            echo "👋 До свидания!"
            break
            ;;
        *) 
            echo "❌ Неверный выбор"
            ;;
    esac
    
    if [[ $choice != "0" ]]; then
        read -p "Нажмите Enter для продолжения..."
    fi
done
