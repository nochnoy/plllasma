<?php
/**
 * Скрипт очистки старых логов
 * Запускается cron'ом раз в день
 */

require_once 'include/functions-logging.php';

// Очищаем старые логи
cleanupOldLogs();

echo "Очистка логов завершена\n";
?>



