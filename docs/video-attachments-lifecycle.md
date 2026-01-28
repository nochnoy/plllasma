# Жизненный цикл видео аттачментов

## Обзор

Этот документ описывает полный жизненный цикл видео аттачментов — от загрузки пользователем до отображения на фронтенде.

## Статусы аттачментов

| Статус | Описание |
|--------|----------|
| `pending` | Ожидает обработки воркером (только для видео) |
| `ready` | Обработка завершена успешно |
| `failed` | Обработка не удалась (невозможно создать иконку/превью) |
| `unavailable` | Файл недоступен |
| `rejected` | Отклонён модерацией |

## Поля версий

В таблице `tbl_attachments` поля `icon`, `preview`, `file` содержат **номер версии** (integer):

| Поле | Значение 0 | Значение > 0 |
|------|------------|--------------|
| `icon` | Нет иконки | Есть иконка версии N |
| `preview` | Нет превью | Есть превью версии N |
| `file` | Нет файла | Есть файл версии N |

### Структура файлов на диске

```
a/
├── xx/                           # Первые 2 символа ID аттачмента
│   └── yy/                       # Следующие 2 символа ID
│       ├── {id}-1.mp4            # Файл версии 1
│       ├── {id}-1-i.jpg          # Иконка версии 1 (160x160)
│       └── {id}-1-p.jpg          # Превью версии 1 (сетка кадров)
```

---

## Этап 1: Загрузка файла

### 1.1 Простая загрузка (attachment-upload.php)

```
Пользователь загружает файл → POST /api/attachment-upload.php
```

**Логика определения типа:**
1. Проверяется MIME тип файла
2. Если MIME начинается с `video/` → тип `video`
3. Если MIME начинается с `image/` → тип `image`
4. Иначе проверяется расширение файла

**Видео расширения:** mp4, avi, mov, mkv, wmv, flv, webm, rm, rmvb, 3gp, m4v, mpg, mpeg

**Статус при создании:**
```php
$status = ($attachmentType === 'video') ? 'pending' : 'ready';
```

**Результат:**
- Файл сохраняется: `a/xx/yy/{id}-1.{ext}`
- В БД: `file=1, icon=0, preview=0, status='pending'`

### 1.2 Multipart загрузка (multipart-complete.php)

Для больших файлов (chunked upload):

```
1. POST /api/multipart-init.php     → Инициализация, получение uploadId
2. POST /api/multipart-chunk.php    → Загрузка чанков (многократно)
3. POST /api/multipart-complete.php → Сборка файла, создание записи
```

**Результат:** Аналогичен простой загрузке.

---

## Этап 2: Обработка воркером

### 2.1 Запуск воркера

Воркер запускается по cron каждые 5 минут:
```
*/5 * * * * curl -s https://plllasma.ru/api/cron-video-attachments-job.php
```

### 2.2 Выбор файла для обработки

**SQL-запрос:**
```sql
SELECT a.id 
FROM tbl_attachments a
JOIN tbl_messages m ON a.id_message = m.id_message
WHERE a.type = 'video' 
  AND a.status = 'pending'              -- ✅ Только pending
  AND a.file IS NOT NULL
  AND (a.processing_started IS NULL 
       OR a.processing_started < DATE_SUB(NOW(), INTERVAL 300 SECOND))
ORDER BY a.created DESC 
LIMIT 1
```

**Критерии выбора:**
1. Тип = `video`
2. Статус = `pending` (файлы со статусами `ready`, `failed` НЕ выбираются)
3. Есть файл (`file IS NOT NULL`)
4. Не заблокирован другим процессом (или блокировка истекла)

### 2.3 Блокировка

Перед обработкой воркер атомарно устанавливает `processing_started = NOW()`.

### 2.4 Обработка файла

```
1. Скачивание файла из S3 (если нужно)
2. Проверка: является ли файл видео (через ffprobe)
3. Генерация иконки (кадр из видео, 160x160)
4. Генерация превью (сетка кадров 6x11)
5. Обновление БД
```

### 2.5 Результат обработки

**Если создалась хотя бы иконка ИЛИ превью:**
```sql
UPDATE tbl_attachments 
SET icon = ?, preview = ?, status = 'ready' 
WHERE id = ?
```

**Если ничего не создалось (icon=0 И preview=0):**
```sql
UPDATE tbl_attachments 
SET icon = 0, preview = 0, status = 'failed' 
WHERE id = ?
```

---

## Этап 3: Отображение на фронтенде

### 3.1 Модель данных

```typescript
interface INewAttachment {
  id: string;
  type: 'file' | 'image' | 'video' | 'youtube';
  icon?: number;      // 0 = нет, >0 = есть
  preview?: number;   // 0 = нет, >0 = есть
  file?: number;      // 0 = нет, >0 = есть
  status: 'unavailable' | 'pending' | 'ready' | 'rejected' | 'failed';
  filename?: string;
  // ...
}
```

### 3.2 Логика отображения

**Аттачменты с иконками (`icon > 0`):**
- Отображаются через `<app-attachment-item>`
- Показывается превью-картинка

**Аттачменты без иконок (`icon = 0`):**
- Отображаются через `<app-attachment-list>`
- Показывается иконка файла + имя файла как ссылка
- Если `status = 'pending'` — показывается спиннер

**Аттачменты со статусом `failed`:**
- `icon = 0`, поэтому попадают в список без иконок
- Показываются как обычные файлы-ссылки (без спиннера)

---

## Диаграмма состояний

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Загрузка файла                                               │
│   (attachment-upload.php / multipart-complete.php)             │
│                                                                 │
│   type = 'video' ?                                             │
│       ├── Да  → status = 'pending', icon = 0, preview = 0      │
│       └── Нет → status = 'ready', icon = ? (для image = 1)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Воркер (cron-video-attachments-job.php)                      │
│   Каждые 5 минут                                               │
│                                                                 │
│   Выбирает: type='video' AND status='pending'                  │
│                                                                 │
│   Результат:                                                    │
│       ├── Успех (icon>0 OR preview>0) → status = 'ready'       │
│       └── Неудача (icon=0 AND preview=0) → status = 'failed'   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Фронтенд                                                      │
│                                                                 │
│   icon > 0 ?                                                   │
│       ├── Да  → Показать превью-картинку                       │
│       └── Нет → Показать как файл-ссылку                       │
│                                                                 │
│   status = 'pending' ? → Показать спиннер                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Известные особенности

### WMA файлы определяются как видео

Файлы `.wma` (Windows Media Audio) имеют MIME тип `video/x-ms-asf` (контейнер ASF используется и для аудио, и для видео). Система определяет их как `type = 'video'`, но ffmpeg не может извлечь из них кадры.

**Результат:** Такие файлы получают `status = 'failed'` и больше не обрабатываются.

### Миграция существующих данных

Если в БД есть файлы со старой логикой (`status = 'ready'`, но `icon = 0` и `preview = 0`), их нужно пометить как `failed`:

```sql
UPDATE tbl_attachments 
SET status = 'failed' 
WHERE type = 'video' 
  AND status = 'ready' 
  AND icon = 0 
  AND preview = 0;
```

---

## Связанные файлы

| Файл | Описание |
|------|----------|
| `api/attachment-upload.php` | Простая загрузка файлов |
| `api/multipart-init.php` | Инициализация multipart загрузки |
| `api/multipart-chunk.php` | Загрузка чанков |
| `api/multipart-complete.php` | Завершение multipart загрузки |
| `api/cron-video-attachments-job.php` | Воркер обработки видео |
| `api/include/functions-attachments.php` | Общие функции для аттачментов |
| `api/include/functions-video.php` | Функции генерации иконок/превью |
| `frontend/src/app/model/app-model.ts` | Модель INewAttachment |
| `frontend/src/app/components/attachment-item/` | Компонент аттачмента с превью |
| `frontend/src/app/components/attachment-list/` | Компонент списка файлов |

