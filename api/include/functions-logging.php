<?php
/**
 * Система логирования для Plasma
 * Все логи сохраняются в папку logs/
 */

// Конфигурация логов
define('LOG_DIR', __DIR__ . '/../../logs/');
define('LOG_MAX_SIZE', 10 * 1024 * 1024); // 10MB
define('LOG_MAX_FILES', 5); // Максимум 5 файлов логов
define('LOG_ENABLED', true); // Флаг для включения/отключения логирования

// Создаем директорию для логов если её нет
if (!file_exists(LOG_DIR)) {
    mkdir(LOG_DIR, 0755, true);
}

/**
 * Включает логирование
 */
function enableLogging() {
    if (!defined('LOG_ENABLED')) {
        define('LOG_ENABLED', true);
    }
}

/**
 * Отключает логирование
 */
function disableLogging() {
    if (!defined('LOG_ENABLED')) {
        define('LOG_ENABLED', false);
    }
}

/**
 * Проверяет, включено ли логирование
 */
function isLoggingEnabled() {
    return defined('LOG_ENABLED') && LOG_ENABLED;
}

/**
 * Основная функция логирования
 */
function logMessage($message, $level = 'INFO', $category = 'general') {
    // Проверяем, включено ли логирование
    if (!LOG_ENABLED) {
        return;
    }
    
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[{$timestamp}] [{$level}] [{$category}] {$message}" . PHP_EOL;
    
    // Всегда используем имя файла с датой
    $dateSuffix = date('Ymd');
    $logFile = LOG_DIR . $category . '-' . $dateSuffix . '.log';
    
    // Ротируем лог если он слишком большой
    rotateLogIfNeeded($logFile);
    
    // Записываем в лог
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
}

/**
 * Ротирует лог файл если он превышает максимальный размер
 */
function rotateLogIfNeeded($logFile) {
    if (!file_exists($logFile)) {
        return;
    }
    
    if (filesize($logFile) > LOG_MAX_SIZE) {
        // Переименовываем существующие файлы
        for ($i = LOG_MAX_FILES - 1; $i > 0; $i--) {
            $oldFile = $logFile . '.' . $i;
            $newFile = $logFile . '.' . ($i + 1);
            
            if (file_exists($oldFile)) {
                if ($i === LOG_MAX_FILES - 1) {
                    // Удаляем самый старый файл
                    unlink($oldFile);
                } else {
                    rename($oldFile, $newFile);
                }
            }
        }
        
        // Переименовываем текущий файл
        rename($logFile, $logFile . '.1');
    }
}

/**
 * Логирование ошибок
 */
function logError($message, $category = 'error') {
    logMessage($message, 'ERROR', $category);
}

/**
 * Логирование предупреждений
 */
function logWarning($message, $category = 'warning') {
    logMessage($message, 'WARNING', $category);
}

/**
 * Логирование информации
 */
function logInfo($message, $category = 'info') {
    logMessage($message, 'INFO', $category);
}

/**
 * Логирование отладочной информации
 */
function logDebug($message, $category = 'debug') {
    logMessage($message, 'DEBUG', $category);
}

/**
 * Основная функция логирования Plasma
 */
function plllasmaLog($message, $level = 'INFO', $category = 'general') {
    logMessage($message, $level, $category);
}

/**
 * Логирование для загрузки аттачментов
 */
function logAttachmentUpload($message, $level = 'INFO') {
    logMessage($message, $level, 'attachment-upload');
}

/**
 * Логирование для миграции аттачментов
 */
function logAttachmentMigration($message, $level = 'INFO') {
    logMessage($message, $level, 'attachment-migration');
}

/**
 * Логирование для YouTube аттачментов
 */
function logYouTube($message, $level = 'INFO') {
    logMessage($message, $level, 'youtube-attachments');
}

/**
 * Логирование для аутентификации
 */
function logAuth($message, $level = 'INFO') {
    logMessage($message, $level, 'auth');
}

/**
 * Логирование для базы данных
 */
function logDatabase($message, $level = 'INFO') {
    logMessage($message, $level, 'database');
}

/**
 * Очищает старые логи (вызывается cron'ом)
 */
function cleanupOldLogs() {
    $files = glob(LOG_DIR . '*.log*');
    $cutoffTime = time() - (30 * 24 * 60 * 60); // 30 дней
    
    foreach ($files as $file) {
        if (filemtime($file) < $cutoffTime) {
            unlink($file);
            logInfo("Удален старый лог файл: " . basename($file), 'cleanup');
        }
    }
}

/**
 * Получает последние N строк из лога
 */
function getLogTail($category = 'general', $lines = 100) {
    $logFile = LOG_DIR . $category . '.log';
    
    if (!file_exists($logFile)) {
        return [];
    }
    
    $content = file_get_contents($logFile);
    $logLines = explode(PHP_EOL, $content);
    
    // Убираем пустые строки и возвращаем последние N строк
    $logLines = array_filter($logLines);
    return array_slice($logLines, -$lines);
}

/**
 * Получает статистику логов
 */
function getLogStats() {
    $stats = [];
    $files = glob(LOG_DIR . '*.log');
    
    foreach ($files as $file) {
        $category = basename($file, '.log');
        $stats[$category] = [
            'size' => filesize($file),
            'modified' => filemtime($file),
            'lines' => count(file($file))
        ];
    }
    
    return $stats;
}
?>
