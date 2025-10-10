# Деплой YouTube Storyboard API

Быстрая инструкция по обновлению сервиса на продакшн сервере.

## 🚀 Быстрый деплой

```bash
# 1. Остановить сервис
sudo systemctl stop youtube-preview.service

# 2. Бэкап текущей версии
sudo cp /usr/local/bin/youtube-preview-api.py /usr/local/bin/youtube-preview-api.py.backup

# 3. Скопировать новый файл
sudo cp youtube-preview-api.py /usr/local/bin/
sudo chmod +x /usr/local/bin/youtube-preview-api.py

# 4. Запустить сервис
sudo systemctl start youtube-preview.service

# 5. Проверить статус
sudo systemctl status youtube-preview.service
```

## ✅ Проверка работоспособности

### Тест 1: Сервис запущен
```bash
sudo systemctl status youtube-preview.service
# Должно быть: active (running)
```

### Тест 2: Главная страница доступна
```bash
curl -I http://localhost:5000/
# Должно быть: HTTP/1.1 200 OK
```

### Тест 3: Storyboard Preview endpoint
```bash
curl http://localhost:5000/api/storyboard-preview/dQw4w9WgXcQ -o /tmp/test.jpg
ls -lh /tmp/test.jpg
# Должен быть файл размером ~100-500KB
```

### Тест 4: Проверка изображения
```bash
file /tmp/test.jpg
# Должно быть: JPEG image data
```

### Тест 5: Полный тест всех endpoints
```bash
cd /path/to/youtube-preview
python3 test-storyboard.py http://localhost:5000
```

## 📊 Мониторинг

### Логи в реальном времени
```bash
sudo journalctl -u youtube-preview.service -f
```

### Последние ошибки
```bash
sudo journalctl -u youtube-preview.service -n 50 -p err
```

### Статистика запросов
```bash
sudo journalctl -u youtube-preview.service --since today | grep "Successfully fetched storyboard"
```

## 🔧 Устранение проблем

### Проблема: Сервис не запускается

```bash
# Проверить синтаксис Python
python3 /usr/local/bin/youtube-preview-api.py --help

# Проверить права
ls -la /usr/local/bin/youtube-preview-api.py

# Проверить виртуальное окружение
/usr/local/bin/venv/bin/python --version
```

### Проблема: Storyboard не скачивается

```bash
# Тест доступа к YouTube
curl -I https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Тест доступа к storyboard URL
curl -I "https://i.ytimg.com/sb/dQw4w9WgXcQ/storyboard3_L2/M0.jpg"

# Проверить логи
sudo journalctl -u youtube-preview.service -n 100 | grep storyboard
```

## 🔄 Откат на предыдущую версию

```bash
# Остановить сервис
sudo systemctl stop youtube-preview.service

# Восстановить бэкап
sudo cp /usr/local/bin/youtube-preview-api.py.backup /usr/local/bin/youtube-preview-api.py

# Запустить сервис
sudo systemctl start youtube-preview.service

# Проверить
sudo systemctl status youtube-preview.service
```

## 📝 Checklist после деплоя

- [ ] Сервис запущен и работает
- [ ] Главная страница доступна
- [ ] `/api/preview/<video_id>` работает
- [ ] `/api/storyboard-preview/<video_id>` работает (новый!)
- [ ] `/api/storyboard/<video_id>` работает
- [ ] Логи не показывают ошибок
- [ ] PHP интеграция протестирована
- [ ] YouTube аттачменты создаются с preview

## 🧪 Тест PHP интеграции

На PHP сервере:

```bash
# Добавить тестовое сообщение с YouTube ссылкой
# Проверить создание аттачмента

# Проверить логи PHP
tail -f /path/to/logs/api-$(date +%Y%m%d).log | grep YouTube

# Ожидаемый вывод:
# [YouTube] Starting YouTube assets download for: <id>, videoId: <videoId>
# [YouTube] YouTube attachment <id>: Storyboard preview downloaded successfully
# [YouTube] YouTube attachment <id>: preview=1 (v1), icon=1 (v1), status=ready
```

## 📈 Метрики успеха

После деплоя в течение недели:

1. **Доступность:** > 99% uptime
2. **Storyboard успех:** > 70% (остальные fallback на regular preview)
3. **Среднее время ответа:** < 5 секунд
4. **Ошибки:** < 5% запросов

## 🆘 Контакты

При критических проблемах:
1. Сделать откат на предыдущую версию
2. Проверить логи: `sudo journalctl -u youtube-preview.service -n 100`
3. Создать issue в репозитории с логами

## 📚 Дополнительная документация

- `README.md` - Основная документация API
- `CHANGELOG.md` - История изменений
- `UPDATE.md` - Инструкция по обновлению
- `docs/youtube-storyboard-integration.md` - Интеграция с PHP

