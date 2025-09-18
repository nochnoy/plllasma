# Система логирования Plasma

## Обзор

Система логирования Plasma централизованно управляет всеми логами приложения. Все логи сохраняются в папку `logs/` и автоматически ротируются.

## Структура логов

```
logs/
├── general.log          # Общие логи
├── video-worker.log     # Логи воркера обработки видео
├── attachment-upload.log # Логи загрузки аттачментов
├── api.log             # Логи API endpoints
├── auth.log            # Логи аутентификации
├── database.log        # Логи работы с БД
├── error.log           # Логи ошибок
├── warning.log         # Логи предупреждений
├── info.log            # Информационные логи
└── debug.log           # Отладочные логи
```

## Использование

### Основные функции

```php
// Общее логирование
logMessage($message, $level, $category);

// Специализированные функции
logError($message, $category);
logWarning($message, $category);
logInfo($message, $category);
logDebug($message, $category);

// Специфичные для модулей
plllasmaLog($message, $level, $category);
logAttachmentUpload($message, $level);
logApi($message, $level);
logAuth($message, $level);
logDatabase($message, $level);
```

### Примеры использования

```php
// В воркере видео
plllasmaLog("Начинаем обработку аттачмента: {$attachmentId}", 'INFO', 'video-worker');
plllasmaLog("Ошибка обработки: " . $e->getMessage(), 'ERROR', 'video-worker');

// В API загрузки аттачментов
logAttachmentUpload("Файл {$originalName} сохранен как {$attachmentId}");
logAttachmentUpload("Ошибка загрузки: " . $e->getMessage(), 'ERROR');

// Общие логи
logError("Критическая ошибка в системе", 'system');
logInfo("Пользователь {$userId} вошел в систему", 'auth');
```

## Конфигурация

### Настройки в `functions-logging.php`:

```php
define('LOG_DIR', __DIR__ . '/../../logs/');
define('LOG_MAX_SIZE', 10 * 1024 * 1024); // 10MB
define('LOG_MAX_FILES', 5); // Максимум 5 файлов логов
```

### Ротация логов

- Логи автоматически ротируются при достижении 10MB
- Сохраняется максимум 5 файлов логов
- Старые логи автоматически удаляются через 30 дней

## Уровни логирования

- **ERROR** - Критические ошибки
- **WARNING** - Предупреждения
- **INFO** - Информационные сообщения
- **DEBUG** - Отладочная информация

## Формат логов

```
[2024-01-15 14:30:25] [INFO] [video-worker] Начинаем обработку аттачмента: abc123-def456
[2024-01-15 14:30:26] [ERROR] [attachment-upload] Ошибка сохранения файла: image.jpg
```

## Утилиты

### Просмотр логов

```php
// Получить последние 100 строк лога
$lines = getLogTail('video-worker', 100);

// Получить статистику логов
$stats = getLogStats();
```

### Очистка старых логов

```bash
# Ручная очистка
php api/cron-cleanup-logs.php

# Автоматическая очистка (cron)
0 2 * * * /usr/bin/php /path/to/project/api/cron-cleanup-logs.php
```

## Мониторинг

### Просмотр логов в реальном времени

```bash
# Все логи
tail -f logs/*.log

# Конкретный лог
tail -f logs/video-worker.log

# Логи с фильтрацией
tail -f logs/*.log | grep ERROR
```

### Анализ логов

```bash
# Подсчет ошибок
grep -c "ERROR" logs/*.log

# Поиск по времени
grep "2024-01-15 14:" logs/video-worker.log

# Статистика по уровням
grep -o "\[ERROR\]" logs/*.log | wc -l
```

## Безопасность

- Логи не содержат паролей или токенов
- Чувствительные данные маскируются
- Логи доступны только администраторам системы

## Производительность

- Логирование не блокирует основное приложение
- Используется `FILE_APPEND | LOCK_EX` для безопасной записи
- Ротация логов происходит в фоновом режиме

## Troubleshooting

### Проблемы с записью логов

1. Проверьте права на папку `logs/`:
   ```bash
   chmod 755 logs/
   chown www-data:www-data logs/
   ```

2. Проверьте свободное место на диске

3. Проверьте права на файлы логов:
   ```bash
   chmod 644 logs/*.log
   ```

### Логи не ротируются

1. Проверьте настройки `LOG_MAX_SIZE`
2. Убедитесь, что функция `rotateLogIfNeeded()` вызывается
3. Проверьте права на переименование файлов
