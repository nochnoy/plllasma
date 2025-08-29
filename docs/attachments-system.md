# Новая система аттачментов

## Обзор

Новая система аттачментов позволяет автоматически обрабатывать YouTube ссылки в сообщениях и создавать для них специальные аттачменты. Система работает параллельно со старой системой аттачментов.

**Новое в версии 2.0**: Автоматическое скачивание превью и иконок YouTube видео при создании аттачментов.

## Установка

### 1. Выполните миграцию базы данных

```sql
-- Добавляем столбец json в таблицу сообщений
ALTER TABLE `tbl_messages` ADD COLUMN `json` JSON NULL AFTER `message`;

-- Создаем таблицу для аттачментов
CREATE TABLE `tbl_attachments` (
  `id` varchar(36) NOT NULL COMMENT 'GUID аттачмента',
  `id_message` bigint NOT NULL COMMENT 'ID сообщения',
  `type` enum('file','image','video','youtube') NOT NULL COMMENT 'Тип аттачмента',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Дата создания',
  `icon` varchar(255) DEFAULT NULL COMMENT 'Путь к иконке',
  `preview` varchar(255) DEFAULT NULL COMMENT 'Путь к превью',
  `file` varchar(255) DEFAULT NULL COMMENT 'Путь к файлу',
  `source` varchar(500) DEFAULT NULL COMMENT 'Исходный URL (для YouTube)',
  `status` enum('unavailable','pending','ready') NOT NULL DEFAULT 'pending' COMMENT 'Статус обработки',
  PRIMARY KEY (`id`),
  KEY `idx_message` (`id_message`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Новая система аттачментов к сообщениям';
```

### 2. Создайте папку для хранения аттачментов

```bash
mkdir -p attachments-new
```

### 3. Убедитесь, что YouTube Preview API доступен

Система использует внешний сервис для получения превью YouTube видео:
- URL: `http://194.135.33.47:5000/api/preview/{video_id}`
- Должен возвращать JPEG изображение превью

### 4. Обновите код

Все необходимые изменения уже внесены в код:

- Добавлены функции для работы с аттачментами (`api/include/functions-attachments.php`)
- Модифицированы API для создания и редактирования сообщений
- Обновлен фронтенд для отображения новых аттачментов
- Создана страница просмотра аттачментов

## Как это работает

### Обработка YouTube ссылок

1. Когда пользователь отправляет или редактирует сообщение, система автоматически ищет YouTube ссылки в тексте
2. Для каждой найденной ссылки создается запись в таблице `tbl_attachments` со статусом `pending`
3. **Новое**: Сразу после создания записи система:
   - Скачивает превью с YouTube Preview API
   - Создает иконку 160x160px из превью
   - Сохраняет файлы в структуре папок `attachments-new/xx/yy/`
   - Обновляет поля `icon` и `preview` в БД (устанавливает в `1`)
   - Меняет статус на `ready` или `unavailable`
4. В поле `json` сообщения сохраняется массив ID созданных аттачментов

### Структура файлов аттачментов

```
attachments-new/
├── xx/                    # Первые 2 символа ID аттачмента
│   └── yy/               # Следующие 2 символа ID
│       ├── zz-p.jpg      # Превью (оригинальный размер)
│       └── zz-i.jpg      # Иконка (160x160px)
```

### Отображение аттачментов

1. При загрузке сообщений система проверяет поле `json` на наличие аттачментов
2. Если аттачменты есть, они отображаются под сообщением после старых аттачментов
3. Каждый аттачмент показывает иконку и статус обработки

### Просмотр аттачментов

1. При клике на аттачмент открывается страница `/attachment/{id}`
2. В зависимости от статуса аттачмента:
   - `pending` - редирект на YouTube
   - `unavailable` - показ превью с сообщением о недоступности
   - `ready` - показ контента (пока заглушка для видеоплеера)

## Структура файлов

```
api/
├── include/
│   └── functions-attachments.php    # Функции для работы с аттачментами
├── attachment.php                   # API для получения информации об аттачменте
├── message-add.php                  # Модифицирован для обработки YouTube ссылок
└── message-edit.php                 # Модифицирован для обработки YouTube ссылок

frontend/src/app/
├── components/
│   └── attachment-item/             # Компонент для отображения аттачментов
├── pages/
│   └── attachment-page/             # Страница просмотра аттачментов
└── modules/shared/pipes/
    └── linky.pipe.ts                # Модифицирован (убрана обработка YouTube)

attachments-new/                     # Папка для хранения новых аттачментов
└── xx/yy/                          # Структура папок по ID аттачмента

scripts/
└── test-youtube-attachments.php    # Тестовый скрипт для проверки функциональности
```

## API

### Получение информации об аттачменте

```
GET /api/attachment.php?id={attachment_id}
```

### Тестирование

Для проверки работы системы запустите тестовый скрипт:

```bash
cd scripts
php test-youtube-attachments.php
```

Скрипт проверит:
- Извлечение Video ID из различных форматов YouTube ссылок
- Создание аттачментов
- Скачивание превью и создание иконок
- Обновление полей в БД
- Очистку тестовых данных

## Поддерживаемые форматы YouTube ссылок

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://www.youtube.com/v/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`

## Обработка ошибок

- Если YouTube Preview API недоступен, статус аттачмента устанавливается в `unavailable`
- Если превью скачалось, но не удалось создать иконку, поле `icon` остается `0`
- Все ошибки логируются в стандартный лог PHP
