# YouTube Preview & Storyboard API

Flask-приложение для получения превью и storyboard изображений YouTube видео. Сервис работает как прокси, загружая данные напрямую с YouTube без кэширования.

## Возможности

- 📥 Скачивание превью YouTube видео по video_id
- 🎬 Получение storyboard изображений (покадровые превью)
- 🔄 Автоматический перезапуск при сбоях (systemd)
- 🖼️ Поддержка высокого (HQ) и низкого (LQ) качества
- 🚀 Простой прокси без кэширования
- ⚡ Быстрая настройка и развертывание
- 📊 Автоматическое извлечение метаданных из YouTube

## API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/preview/<video_id>` | Получить превью видео |
| GET | `/api/storyboard/<video_id>` | Получить информацию о storyboard |
| GET | `/api/storyboard/<video_id>/image/<index>` | Получить конкретное изображение storyboard |
| GET | `/` | Главная страница с документацией |

### Storyboard Query Параметры

- `quality` - качество изображений:
  - `hq` (по умолчанию) - высокое качество, меньше кадров на изображении
  - `lq` - низкое качество, больше кадров на изображении
- `format` - формат ответа (только для `/api/storyboard/<video_id>`):
  - `json` (по умолчанию) - список URLs всех storyboard изображений
  - `spec` - только spec и duration для генерации URLs на клиенте

## Примеры использования

### Превью видео

```bash
# Получить превью видео
curl http://localhost:5000/api/preview/dQw4w9WgXcQ

# В браузере
http://localhost:5000/api/preview/dQw4w9WgXcQ
```

### Storyboard

```bash
# Получить информацию о storyboard (высокое качество)
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ

# Получить информацию о storyboard (низкое качество)
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ?quality=lq

# Получить только spec и duration
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ?format=spec

# Получить конкретное изображение storyboard (индекс 0)
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ/image/0 --output storyboard_0.jpg

# В браузере
http://localhost:5000/api/storyboard/dQw4w9WgXcQ
http://localhost:5000/api/storyboard/dQw4w9WgXcQ/image/0
```

### Пример ответа storyboard API

```json
{
  "video_id": "dQw4w9WgXcQ",
  "duration": 212,
  "quality": "high",
  "count": 5,
  "urls": [
    "https://i.ytimg.com/sb/dQw4w9WgXcQ/storyboard3_L2/M0.jpg?sqp=...",
    "https://i.ytimg.com/sb/dQw4w9WgXcQ/storyboard3_L2/M1.jpg?sqp=...",
    ...
  ],
  "title": "Rick Astley - Never Gonna Give You Up"
}
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