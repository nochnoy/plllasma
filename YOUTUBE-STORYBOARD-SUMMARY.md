# YouTube Storyboard - Сводка изменений

## 🎯 Что было сделано

Реализована полная интеграция YouTube Storyboard API для получения покадровых превью видео.

## 📦 Изменённые компоненты

### 1. Python API сервис (`youtube-preview/`)

**Новый endpoint:** `/api/storyboard-preview/<video_id>`

**Что делает:**
- Получает HTML страницу YouTube
- Извлекает `ytInitialPlayerResponse`
- Парсит storyboard spec и duration
- Пытается скачать **HQ storyboard** (высокое качество)
- Если не получилось → пытается **LQ storyboard** (низкое качество)
- Возвращает первое изображение storyboard как JPEG

**Преимущества:**
✅ Работает из стран с ограничениями (сервис как прокси)
✅ Автоматический fallback HQ → LQ
✅ Валидация JPEG
✅ Более информативное превью (несколько кадров вместо одного)

**Файл:** `youtube-preview/youtube-preview-api.py`

### 2. PHP интеграция (`api/include/`)

**Обновлена функция:** `downloadYouTubeAssets($attachmentId, $videoId)`

**Новая логика:**
```
1. Попытка скачать STORYBOARD preview
   ↓
2. Если не получилось → скачать REGULAR preview
   ↓
3. Создать иконку 160x160 из preview
   ↓
4. Сохранить оба файла в /a/{xx}/{yy}/
   ↓
5. Обновить tbl_attachments: preview=1, icon=1
```

**Файл:** `api/include/functions-attachments.php`

### 3. Структура файлов

**Было:**
```
/a/{xx}/{yy}/
  └── {id}-1-i.jpg  (только иконка из обычного превью)
```

**Стало:**
```
/a/{xx}/{yy}/
  ├── {id}-1-p.jpg  (storyboard превью!)
  └── {id}-1-i.jpg  (иконка из storyboard)
```

### 4. База данных

**Таблица:** `tbl_attachments`

**Изменения:**
- `preview` = 1 (было 0) - теперь YouTube аттачменты имеют preview
- `icon` = 1 (было 1) - иконка создается из storyboard вместо обычного превью

## 🚀 Как это работает

### Создание YouTube аттачмента

```
Пользователь вставляет ссылку на YouTube
         ↓
PHP парсит URL и извлекает video_id
         ↓
PHP создает аттачмент в tbl_attachments
         ↓
PHP вызывает downloadYouTubeAssets()
         ↓
    ┌────┴────┐
    ↓         ↓
Python API    Python API
Storyboard → Regular Preview
    ↓         ↓
    └────┬────┘
         ↓
PHP сохраняет preview файл
         ↓
PHP создает иконку 160x160
         ↓
PHP обновляет tbl_attachments
```

### Fallback стратегия

**Уровень 1 (Python):** HQ storyboard → LQ storyboard
**Уровень 2 (PHP):** Storyboard → Regular preview

**Итого:** 3 попытки получить изображение!

## 📊 Визуальная разница

### Обычное превью (было):
```
┌──────────────────┐
│                  │
│   ОДИН КАДР      │
│   ИЗ ВИДЕО       │
│                  │
└──────────────────┘
```

### Storyboard превью (стало):
```
┌───┬───┬───┬───┬───┐
│ 1 │ 2 │ 3 │ 4 │ 5 │  ← Первые секунды видео
├───┼───┼───┼───┼───┤
│ 6 │ 7 │ 8 │ 9 │10 │  
├───┼───┼───┼───┼───┤
│11 │12 │13 │14 │15 │  ← 25 кадров на одном
├───┼───┼───┼───┼───┤     изображении (HQ)
│16 │17 │18 │19 │20 │
├───┼───┼───┼───┼───┤
│21 │22 │23 │24 │25 │
└───┴───┴───┴───┴───┘
```

## 🔧 Технические детали

### Python API

**Новые функции:**
- `get_youtube_page(video_id)` - получить HTML
- `extract_player_response(html)` - извлечь JSON
- `parse_storyboard_spec(player_response)` - парсить spec
- `generate_storyboard_urls(spec, hq, seconds)` - генерация URLs

**Новые endpoints:**
- `GET /api/storyboard-preview/<video_id>` - для PHP (приоритет!)
- `GET /api/storyboard/<video_id>` - информация о storyboard
- `GET /api/storyboard/<video_id>/image/<index>` - конкретное изображение

### PHP функции

**Изменена:**
- `downloadYouTubeAssets()` - добавлен storyboard приоритет

**Без изменений:**
- `createAttachment()`
- `updateAttachmentVersions()`
- `createIconFromPreview()`

## 📝 Документация

### Создано:
1. `docs/youtube-storyboard-api.md` - API документация
2. `docs/youtube-storyboard-integration.md` - интеграция с PHP
3. `youtube-preview/UPDATE.md` - инструкция обновления
4. `youtube-preview/DEPLOY.md` - инструкция деплоя
5. `youtube-preview/test-storyboard.py` - тестовый скрипт
6. `YOUTUBE-STORYBOARD-SUMMARY.md` - этот файл

### Обновлено:
1. `youtube-preview/README.md` - добавлены примеры storyboard
2. `youtube-preview/CHANGELOG.md` - версия 3.0.0
3. `youtube-preview/youtube-preview-api.py` - новый код

## 🧪 Тестирование

### Автоматический тест Python API:
```bash
cd youtube-preview
python3 test-storyboard.py http://194.135.33.47:5000
```

### Ручной тест endpoint:
```bash
# Скачать storyboard
curl http://194.135.33.47:5000/api/storyboard-preview/dQw4w9WgXcQ -o test.jpg

# Проверить размер
ls -lh test.jpg

# Открыть изображение
xdg-open test.jpg
```

### Тест PHP интеграции:
1. Создайте сообщение с YouTube ссылкой
2. Проверьте создание аттачмента
3. Проверьте файлы в `/a/{xx}/{yy}/`
4. Проверьте логи: `tail -f logs/api-$(date +%Y%m%d).log`

## 📈 Ожидаемые результаты

### Метрики:
- **Storyboard успех:** ~70-80% (остальные fallback)
- **Время загрузки:** 3-6 секунд на аттачмент
- **Размер файлов:** 100-500 KB (preview), 10-30 KB (icon)
- **Uptime API:** > 99%

### Логи успеха:
```
[YouTube] Starting YouTube assets download for: 7e8934fc, videoId: dQw4w9WgXcQ
[YouTube] YouTube attachment 7e8934fc: Storyboard preview downloaded successfully
[YouTube] YouTube attachment 7e8934fc: preview=1 (v1), icon=1 (v1), status=ready
```

### Логи fallback:
```
[YouTube] Starting YouTube assets download for: abc123, videoId: test123
[YouTube] YouTube attachment abc123: Storyboard download failed, trying regular preview
[YouTube] YouTube attachment abc123: preview=1 (v1), icon=1 (v1), status=ready
```

## 🎁 Преимущества

### Для пользователей:
✅ Более информативные превью YouTube видео
✅ Видно содержание видео (несколько кадров)
✅ Работает из стран с ограничениями

### Для системы:
✅ Автоматический fallback (надежность)
✅ Совместимость с существующим кодом
✅ Логирование всех операций
✅ Кеширование результатов (файлы на диске)

### Для разработки:
✅ Хорошо документирован
✅ Легко тестируется
✅ Модульная архитектура
✅ Понятная fallback логика

## 🚀 Деплой

### Шаг 1: Обновить Python API
```bash
sudo systemctl stop youtube-preview.service
sudo cp youtube-preview-api.py /usr/local/bin/
sudo chmod +x /usr/local/bin/youtube-preview-api.py
sudo systemctl start youtube-preview.service
```

### Шаг 2: Обновить PHP код
```bash
# Файл уже обновлен: api/include/functions-attachments.php
# Просто сделать git pull или скопировать файл
```

### Шаг 3: Тестирование
```bash
# Тест Python API
python3 youtube-preview/test-storyboard.py http://194.135.33.47:5000

# Тест PHP - создать YouTube аттачмент через UI
```

### Шаг 4: Мониторинг
```bash
# Логи Python
sudo journalctl -u youtube-preview.service -f

# Логи PHP
tail -f logs/api-$(date +%Y%m%d).log | grep YouTube
```

## ⚠️ Важные замечания

1. **Совместимость:** Код полностью обратно совместим
2. **Fallback:** Если storyboard недоступен, используется обычное превью
3. **Производительность:** +2-3 секунды на попытку storyboard (с fallback)
4. **Логирование:** Все операции логируются для отладки
5. **Версионирование:** Используется система версий файлов (v1, v2, ...)

## 📞 Поддержка

При проблемах:
1. Проверьте логи Python: `sudo journalctl -u youtube-preview.service -n 100`
2. Проверьте логи PHP: `tail -f logs/api-$(date +%Y%m%d).log`
3. Проверьте доступность API: `curl http://194.135.33.47:5000/`
4. Запустите тесты: `python3 test-storyboard.py`

## ✅ Checklist готовности

- [x] Python API обновлен и протестирован
- [x] PHP код обновлен
- [x] Документация создана
- [x] Тесты написаны
- [x] Логирование настроено
- [x] Fallback механизм реализован
- [x] Совместимость проверена
- [ ] Деплой на продакшн
- [ ] Мониторинг настроен

## 🎉 Итог

Реализована полная система получения storyboard превью для YouTube видео с:
- ✅ Автоматическим fallback
- ✅ Интеграцией с PHP
- ✅ Работой через прокси (для стран с ограничениями)
- ✅ Полной документацией
- ✅ Тестами

**Готово к деплою!** 🚀

