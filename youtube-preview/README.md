# YouTube Preview API

Flask-приложение для получения превью YouTube видео. Сервис работает как простой прокси, загружая превью напрямую с YouTube без кэширования.

## Возможности

- 📥 Скачивание превью YouTube видео по video_id
- 🔄 Автоматический перезапуск при сбоях (systemd)
- 🖼️ Поддержка разных качеств изображений
- 🚀 Простой прокси без кэширования
- ⚡ Быстрая настройка и развертывание

## API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/preview/<video_id>` | Получить превью видео |
| GET | `/` | Главная страница с документацией |

## Примеры использования

```bash
# Получить превью видео
curl http://localhost:5000/api/preview/dQw4w9WgXcQ

# В браузере
http://localhost:5000/api/preview/dQw4w9WgXcQ
```

## Установка и настройка

### Требования

- Python 3.7+
- pip
- systemd (для автозапуска)

### Пошаговая установка

1. **Клонируйте репозиторий**
```bash
git clone <repository-url>
cd youtube-preview
```

2. **Создайте виртуальное окружение**
```bash
python3 -m venv /usr/local/bin/venv
source /usr/local/bin/venv/bin/activate
```

3. **Установите зависимости**
```bash
pip install -r requirements.txt
```

4. **Скопируйте файлы**
```bash
cp youtube-preview-api.py /usr/local/bin/
cp youtube-preview.service /etc/systemd/system/
chmod +x /usr/local/bin/youtube-preview-api.py
```

5. **Перезагрузите systemd и запустите сервис**
```bash
systemctl daemon-reload
systemctl enable youtube-preview.service
systemctl start youtube-preview.service
```

6. **Проверьте статус**
```bash
systemctl status youtube-preview.service
```

## Управление сервисом

```bash
# Запустить сервис
systemctl start youtube-preview.service

# Остановить сервис
systemctl stop youtube-preview.service

# Перезапустить сервис
systemctl restart youtube-preview.service

# Посмотреть статус
systemctl status youtube-preview.service

# Посмотреть логи
journalctl -u youtube-preview.service -f
```

## Конфигурация

### Изменение порта

Отредактируйте файл `youtube-preview-api.py`:
```python
app.run(host='0.0.0.0', port=5000, debug=False)
```

### Изменение пользователя

Отредактируйте файл `youtube-preview.service`:
```ini
[Service]
User=your-user
```

## Мониторинг и логи

### Просмотр логов в реальном времени
```bash
journalctl -u youtube-preview.service -f
```

### Просмотр последних логов
```bash
journalctl -u youtube-preview.service -n 100
```

## Устранение неполадок

### Сервис не запускается

1. Проверьте логи:
```bash
journalctl -u youtube-preview.service -n 50
```

2. Проверьте права доступа:
```bash
ls -la /usr/local/bin/youtube-preview-api.py
```

3. Проверьте виртуальное окружение:
```bash
/usr/local/bin/venv/bin/python --version
/usr/local/bin/venv/bin/pip list
```

### Ошибки 404 при получении превью

1. Проверьте доступность YouTube:
```bash
curl -I https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg
```

2. Проверьте правильность video_id:
```bash
# Пример валидного video_id
curl http://localhost:5000/api/preview/dQw4w9WgXcQ
```

## Особенности работы

### Без кэширования
- Превью загружаются напрямую с YouTube при каждом запросе
- Не требуется место на диске для хранения файлов
- Всегда актуальные превью

### Приоритет качества
Сервис пытается загрузить превью в следующем порядке:
1. `maxresdefault.jpg` - максимальное качество
2. `hqdefault.jpg` - высокое качество
3. `sddefault.jpg` - стандартное качество
4. `mqdefault.jpg` - среднее качество
5. `default.jpg` - базовое качество

## Структура проекта

```
youtube-preview/
├── README.md                 # Этот файл
├── requirements.txt          # Зависимости Python
├── youtube-preview-api.py    # Основной скрипт
├── youtube-preview.service   # Конфигурация systemd
├── install.sh               # Скрипт автоматической установки
├── uninstall.sh             # Скрипт удаления
├── CHANGELOG.md             # История изменений
├── LICENSE                  # MIT лицензия
└── .gitignore              # Игнорируемые файлы
```

## Лицензия

MIT License

## Поддержка

При возникновении проблем создайте issue в репозитории или обратитесь к администратору сервера.