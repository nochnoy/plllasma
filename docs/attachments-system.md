# Новая система аттачментов

## Обзор

Новая система аттачментов позволяет автоматически обрабатывать YouTube ссылки в сообщениях и создавать для них специальные аттачменты. Система работает параллельно со старой системой аттачментов.

## Установка

### 1. Выполните миграцию базы данных

```sql
-- Добавляем столбец json в таблицу сообщений
ALTER TABLE `tbl_messages` ADD COLUMN `json` JSON NULL AFTER `message`;

-- Создаем таблицу для аттачментов
CREATE TABLE `attachments` (
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
mkdir -p attachments/new
```

### 3. Обновите код

Все необходимые изменения уже внесены в код:

- Добавлены функции для работы с аттачментами (`api/include/functions-attachments.php`)
- Модифицированы API для создания и редактирования сообщений
- Обновлен фронтенд для отображения новых аттачментов
- Создана страница просмотра аттачментов

## Как это работает

### Обработка YouTube ссылок

1. Когда пользователь отправляет или редактирует сообщение, система автоматически ищет YouTube ссылки в тексте
2. Для каждой найденной ссылки создается запись в таблице `attachments` со статусом `pending`
3. В поле `json` сообщения сохраняется массив ID созданных аттачментов

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
│   └── new-attachments/             # Компонент для отображения новых аттачментов
├── pages/
│   └── attachment-page/             # Страница просмотра аттачментов
└── modules/shared/pipes/
    └── linky.pipe.ts                # Модифицирован (убрана обработка YouTube)

attachments/
└── new/                            # Папка для хранения новых аттачментов
```

## API

### Получение информации об аттачменте

```
GET /api/attachment.php?id={attachment_id}
```

Ответ:
```json
{
  "success": true,
  "attachment": {
    "id": "guid",
    "type": "youtube",
    "created": "2025-01-01 12:00:00",
    "icon": "/path/to/icon.png",
    "preview": "/path/to/preview.jpg",
    "file": "/path/to/file",
    "source": "https://youtube.com/watch?v=...",
    "status": "pending"
  }
}
```

## Следующие шаги

1. **Создание воркера** - для обработки аттачментов и создания иконок/превью
2. **Видеоплеер** - для отображения YouTube видео на странице
3. **Другие типы аттачментов** - поддержка файлов, изображений, видео
4. **Управление аттачментами** - возможность удаления, редактирования

## Примечания

- Старая система аттачментов продолжает работать параллельно
- YouTube ссылки в тексте теперь отображаются как обычные ссылки (без превью)
- Аттачменты создаются только для новых сообщений или при редактировании
- Система переиспользует существующие аттачменты при повторном использовании той же ссылки
