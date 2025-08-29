#!/bin/bash

# YouTube Preview API - Скрипт установки
# Запускать с правами root

set -e

echo "🚀 Установка YouTube Preview API..."

# Проверка прав root
if [[ $EUID -ne 0 ]]; then
   echo "❌ Этот скрипт должен быть запущен с правами root"
   exit 1
fi

# Проверка наличия Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 не найден. Установите Python 3.7+"
    exit 1
fi

# Создание виртуального окружения
echo "📦 Создание виртуального окружения..."
if [ ! -d "/usr/local/bin/venv" ]; then
    python3 -m venv /usr/local/bin/venv
    echo "✅ Виртуальное окружение создано"
else
    echo "ℹ️  Виртуальное окружение уже существует"
fi

# Активация виртуального окружения и установка зависимостей
echo "📥 Установка зависимостей..."
/usr/local/bin/venv/bin/pip install --upgrade pip
/usr/local/bin/venv/bin/pip install -r requirements.txt
echo "✅ Зависимости установлены"

# Копирование файлов
echo "📋 Копирование файлов..."
cp youtube-preview-api.py /usr/local/bin/
cp youtube-preview.service /etc/systemd/system/
chmod +x /usr/local/bin/youtube-preview-api.py
echo "✅ Файлы скопированы"

# Перезагрузка systemd и запуск сервиса
echo "🔄 Настройка systemd..."
systemctl daemon-reload
systemctl enable youtube-preview.service
echo "✅ Сервис добавлен в автозапуск"

# Запуск сервиса
echo "▶️  Запуск сервиса..."
systemctl start youtube-preview.service

# Проверка статуса
echo "🔍 Проверка статуса..."
sleep 2
if systemctl is-active --quiet youtube-preview.service; then
    echo "✅ Сервис успешно запущен!"
    echo "🌐 API доступен по адресу: http://localhost:5000"
    echo "📖 Документация: http://localhost:5000/"
else
    echo "❌ Ошибка запуска сервиса"
    echo "📋 Логи: journalctl -u youtube-preview.service -n 20"
    exit 1
fi

echo ""
echo "🎉 Установка завершена успешно!"
echo ""
echo "📋 Полезные команды:"
echo "  Статус: systemctl status youtube-preview.service"
echo "  Логи: journalctl -u youtube-preview.service -f"
echo "  Перезапуск: systemctl restart youtube-preview.service"
echo "  Остановка: systemctl stop youtube-preview.service"
echo ""
echo "🔗 Тест API: curl http://localhost:5000/api/preview/dQw4w9WgXcQ"
