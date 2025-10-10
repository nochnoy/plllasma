# Обновление YouTube Preview & Storyboard API

Инструкция по обновлению сервиса до версии 3.0.0 с поддержкой storyboard.

## Быстрое обновление

```bash
# 1. Остановить сервис
sudo systemctl stop youtube-preview.service

# 2. Скопировать новый файл API
sudo cp youtube-preview-api.py /usr/local/bin/
sudo chmod +x /usr/local/bin/youtube-preview-api.py

# 3. Перезапустить сервис
sudo systemctl start youtube-preview.service

# 4. Проверить статус
sudo systemctl status youtube-preview.service
```

## Проверка работоспособности

### Тест превью (существующий функционал)
```bash
curl http://localhost:5000/api/preview/dQw4w9WgXcQ -I
# Должен вернуть 200 OK
```

### Тест storyboard (новый функционал)
```bash
# Получить информацию о storyboard
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ

# Должен вернуть JSON с полями:
# - video_id
# - duration
# - quality
# - count
# - urls (массив)
# - title
```

### Тест конкретного изображения
```bash
# Получить первое изображение storyboard
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ/image/0 -I
# Должен вернуть 200 OK и image/jpeg
```

## Что нового в 3.0.0

### Новые endpoints:
- `GET /api/storyboard/<video_id>` - получить информацию о storyboard
- `GET /api/storyboard/<video_id>/image/<index>` - получить конкретное изображение

### Параметры:
- `?quality=hq` - высокое качество (по умолчанию)
- `?quality=lq` - низкое качество
- `?format=json` - полный JSON с URLs (по умолчанию)
- `?format=spec` - только spec и duration

### Примеры использования:

```bash
# Высокое качество (по умолчанию)
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ

# Низкое качество
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ?quality=lq

# Только spec и duration
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ?format=spec

# Скачать конкретное изображение
curl http://localhost:5000/api/storyboard/dQw4w9WgXcQ/image/0 -o storyboard_0.jpg
```

## Логи

Просмотр логов в реальном времени:
```bash
sudo journalctl -u youtube-preview.service -f
```

Последние 50 строк:
```bash
sudo journalctl -u youtube-preview.service -n 50
```

## Откат на предыдущую версию

Если нужно вернуться к версии 2.0.0:

```bash
# 1. Остановить сервис
sudo systemctl stop youtube-preview.service

# 2. Восстановить старый файл из бэкапа
sudo cp /usr/local/bin/youtube-preview-api.py.backup /usr/local/bin/youtube-preview-api.py

# 3. Запустить сервис
sudo systemctl start youtube-preview.service
```

## Интеграция с PHP проектом

Для использования storyboard в вашем PHP проекте:

```php
// Получить информацию о storyboard
$videoId = 'dQw4w9WgXcQ';
$url = "http://194.135.33.47:5000/api/storyboard/{$videoId}";
$response = file_get_contents($url);
$data = json_decode($response, true);

// $data содержит:
// - video_id
// - duration
// - quality
// - count
// - urls[] - массив URLs всех storyboard изображений
// - title

// Скачать конкретное изображение
$imageUrl = "http://194.135.33.47:5000/api/storyboard/{$videoId}/image/0";
$imageContent = file_get_contents($imageUrl);
file_put_contents('storyboard_0.jpg', $imageContent);
```

## Поддержка

При возникновении проблем:
1. Проверьте логи: `sudo journalctl -u youtube-preview.service -n 100`
2. Убедитесь, что порт 5000 доступен
3. Проверьте права на файл: `ls -la /usr/local/bin/youtube-preview-api.py`
4. Перезапустите сервис: `sudo systemctl restart youtube-preview.service`

