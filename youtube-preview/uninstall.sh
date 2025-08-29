#!/bin/bash

# YouTube Preview API - Скрипт удаления
# Запускать с правами root

set -e

echo "🗑️  Удаление YouTube Preview API..."

# Проверка прав root
if [[ $EUID -ne 0 ]]; then
   echo "❌ Этот скрипт должен быть запущен с правами root"
   exit 1
fi

# Остановка и отключение сервиса
echo "🛑 Остановка сервиса..."
if systemctl is-active --quiet youtube-preview.service; then
    systemctl stop youtube-preview.service
    echo "✅ Сервис остановлен"
else
    echo "ℹ️  Сервис уже остановлен"
fi

if systemctl is-enabled --quiet youtube-preview.service; then
    systemctl disable youtube-preview.service
    echo "✅ Сервис отключен от автозапуска"
else
    echo "ℹ️  Сервис уже отключен от автозапуска"
fi

# Удаление файлов сервиса
echo "📋 Удаление файлов..."
if [ -f "/etc/systemd/system/youtube-preview.service" ]; then
    rm /etc/systemd/system/youtube-preview.service
    echo "✅ Файл сервиса удален"
fi

if [ -f "/usr/local/bin/youtube-preview-api.py" ]; then
    rm /usr/local/bin/youtube-preview-api.py
    echo "✅ Python скрипт удален"
fi

# Перезагрузка systemd
echo "🔄 Перезагрузка systemd..."
systemctl daemon-reload
echo "✅ systemd перезагружен"

# Спрашиваем про удаление виртуального окружения
read -p "❓ Удалить виртуальное окружение? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "/usr/local/bin/venv" ]; then
        rm -rf /usr/local/bin/venv
        echo "✅ Виртуальное окружение удалено"
    fi
fi

echo ""
echo "🎉 Удаление завершено успешно!"
echo ""
echo "📋 Что было удалено:"
echo "  - systemd сервис youtube-preview.service"
echo "  - Python скрипт /usr/local/bin/youtube-preview-api.py"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  - Виртуальное окружение"
fi
