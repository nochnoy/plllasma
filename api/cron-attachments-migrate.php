<?php
/**
 * Воркер для автоматической миграции старых аттачментов
 * Запускается cron'ом периодически
 * Обрабатывает 10 сообщений за запуск
 */

require_once 'include/main.php';
require_once 'include/functions-logging.php';
require_once 'include/functions-video.php';

// Конфигурация
define('MESSAGES_PER_RUN', 10); // Количество сообщений для обработки за раз

/**
 * Основная функция воркера
 */
function runMigrationWorker() {
    logAttachmentMigration("=== ЗАПУСК ВОРКЕРА МИГРАЦИИ АТТАЧМЕНТОВ ===");
    
    try {
        // Получаем статистику перед началом
        $stats = getMigrationStats();
        logAttachmentMigration("Статистика: всего сообщений со старыми аттачментами = {$stats['total']}, обработано = {$stats['processed']}, осталось = {$stats['remaining']}");
        
        // Проверяем, есть ли сообщения для миграции
        if ($stats['remaining'] === 0) {
            logAttachmentMigration("!!!КОНЕЦ!!! Все старые аттачменты успешно мигрированы!");
            return [
                'status' => 'completed',
                'message' => 'Все старые аттачменты мигрированы',
                'stats' => $stats
            ];
        }
        
        // Получаем сообщения для миграции
        $messages = getMessagesToMigrate(MESSAGES_PER_RUN);
        
        if (empty($messages)) {
            logAttachmentMigration("Нет сообщений для миграции");
            return [
                'status' => 'success',
                'message' => 'Нет сообщений для миграции',
                'stats' => $stats
            ];
        }
        
        logAttachmentMigration("Найдено сообщений для миграции: " . count($messages));
        
        // Счетчики
        $successCount = 0;
        $failCount = 0;
        $totalMigrated = 0;
        $totalFailed = 0;
        
        // Обрабатываем каждое сообщение
        foreach ($messages as $message) {
            $messageId = $message['id_message'];
            $attachmentsCount = $message['attachments'];
            
            logAttachmentMigration("--- Обработка сообщения ID={$messageId} (старых аттачментов: {$attachmentsCount}) ---");
            
            try {
                // Вызываем функцию миграции
                $result = migrateMessageAttachments($messageId);
                
                if ($result['success']) {
                    $successCount++;
                    $totalMigrated += $result['migrated'];
                    $totalFailed += $result['failed'];
                    logAttachmentMigration("Успешно: мигрировано={$result['migrated']}, ошибок={$result['failed']}, всего={$result['total']}");
                } else {
                    $failCount++;
                    logAttachmentMigration("Ошибка миграции: {$result['error']}", 'ERROR');
                }
            } catch (Exception $e) {
                $failCount++;
                logAttachmentMigration("Исключение при миграции сообщения {$messageId}: " . $e->getMessage(), 'ERROR');
            }
        }
        
        // Финальный отчет
        logAttachmentMigration("=== ИТОГИ ЗАПУСКА ===");
        logAttachmentMigration("Обработано сообщений: " . count($messages));
        logAttachmentMigration("Успешно: {$successCount}");
        logAttachmentMigration("С ошибками: {$failCount}");
        logAttachmentMigration("Всего аттачментов мигрировано: {$totalMigrated}");
        logAttachmentMigration("Всего аттачментов с ошибками: {$totalFailed}");
        
        // Обновленная статистика
        $newStats = getMigrationStats();
        logAttachmentMigration("Осталось сообщений со старыми аттачментами: {$newStats['remaining']}");
        
        if ($newStats['remaining'] === 0) {
            logAttachmentMigration("!!!КОНЕЦ!!! Все старые аттачменты успешно мигрированы!");
        }
        
        logAttachmentMigration("=== ЗАВЕРШЕНИЕ РАБОТЫ ВОРКЕРА ===");
        
        return [
            'status' => 'success',
            'message' => 'Миграция завершена',
            'processed' => count($messages),
            'success' => $successCount,
            'failed' => $failCount,
            'migrated_attachments' => $totalMigrated,
            'failed_attachments' => $totalFailed,
            'stats' => $newStats
        ];
        
    } catch (Exception $e) {
        logAttachmentMigration("Критическая ошибка воркера: " . $e->getMessage(), 'ERROR');
        throw $e;
    }
}

/**
 * Получает сообщения со старыми аттачментами для миграции
 */
function getMessagesToMigrate($limit) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT id_message, attachments, id_place, time_created
        FROM tbl_messages
        WHERE attachments > 0
        ORDER BY time_created DESC
        LIMIT ?
    ");
    $stmt->bind_param("i", $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }
    
    return $messages;
}

/**
 * Получает статистику по миграции
 */
function getMigrationStats() {
    global $mysqli;
    
    // Всего сообщений
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_messages");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $total = $row['count'];
    
    // Сообщений со старыми аттачментами
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_messages WHERE attachments > 0");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $remaining = $row['count'];
    
    // Общее количество старых аттачментов
    $stmt = $mysqli->prepare("SELECT SUM(attachments) as count FROM tbl_messages WHERE attachments > 0");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $oldAttachmentsCount = $row['count'] ?? 0;
    
    return [
        'total' => $total,
        'remaining' => $remaining,
        'processed' => $total - $remaining,
        'old_attachments_count' => $oldAttachmentsCount
    ];
}

/**
 * Получает топ-10 сообщений со старыми аттачментами для отчета
 */
function getTopMessagesWithOldAttachments($limit = 10) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT id_message, attachments, id_place, time_created
        FROM tbl_messages
        WHERE attachments > 0
        ORDER BY time_created DESC
        LIMIT ?
    ");
    $stmt->bind_param("i", $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = "ID:{$row['id_message']} att:{$row['attachments']} place:{$row['id_place']} date:{$row['time_created']}";
    }
    
    return $messages;
}

// Основная логика - только для HTTP (cron)
logAttachmentMigration("Воркер миграции запущен (HTTP)");

// Устанавливаем заголовки для HTTP ответа
header('Content-Type: application/json; charset=UTF-8');

// Проверяем, что запрос идет от cron
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$isCronRequest = strpos($userAgent, 'Wget') !== false || 
                 strpos($userAgent, 'curl') !== false || 
                 strpos($userAgent, 'cron') !== false ||
                 php_sapi_name() === 'cli'; // Также разрешаем запуск из командной строки

if (!$isCronRequest && php_sapi_name() !== 'cli') {
    http_response_code(403);
    echo json_encode(['error' => 'Доступ запрещен. Только для cron задач.']);
    logAttachmentMigration("Отклонен запрос не от cron: User-Agent = {$userAgent}", 'WARNING');
    exit;
}

try {
    $result = runMigrationWorker();
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    logAttachmentMigration("Критическая ошибка воркера: " . $e->getMessage(), 'ERROR');
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Критическая ошибка воркера: ' . $e->getMessage()
    ]);
    exit(1);
}
?>

