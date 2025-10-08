<?php
/**
 * Воркер для автоматической ютубизации сообщений из очереди
 * Запускается cron'ом периодически
 * Обрабатывает сообщения из таблицы tbl_youtubize
 */

require_once 'include/main.php';
require_once 'include/functions-logging.php';
require_once 'include/functions-attachments.php';

// Конфигурация
define('MESSAGES_PER_RUN', 10); // Количество сообщений для обработки за раз
define('MAX_ATTEMPTS', 3); // Максимальное количество попыток обработки
define('SLEEP_BETWEEN_MESSAGES', 1); // Задержка между сообщениями в секундах (для защиты preview сервера)

/**
 * Основная функция воркера
 */
function runYoutubizeWorker() {
    logYouTube("=== ЗАПУСК ВОРКЕРА ЮТУБИЗАЦИИ ===");
    
    try {
        // Проверяем существование таблицы
        if (!checkYoutubizeTableExists()) {
            logYouTube("Таблица tbl_youtubize не существует, создаём...");
            createYoutubizeTable();
        }
        
        // Получаем статистику перед началом
        $stats = getYoutubizeStats();
        logYouTube("Статистика: pending={$stats['pending']}, processing={$stats['processing']}, completed={$stats['completed']}, failed={$stats['failed']}");
        
        // Проверяем, есть ли сообщения для обработки
        if ($stats['pending'] === 0) {
            logYouTube("Нет сообщений в очереди для обработки");
            
            // Проверяем зависшие processing (более 10 минут)
            resetStuckProcessing();
            
            return [
                'status' => 'success',
                'message' => 'Нет сообщений для обработки',
                'stats' => $stats
            ];
        }
        
        // Получаем сообщения для обработки
        $messages = getMessagesToYoutubize(MESSAGES_PER_RUN);
        
        if (empty($messages)) {
            logYouTube("Нет доступных сообщений для обработки");
            return [
                'status' => 'success',
                'message' => 'Нет доступных сообщений',
                'stats' => $stats
            ];
        }
        
        logYouTube("Найдено сообщений для ютубизации: " . count($messages));
        
        // Счетчики
        $successCount = 0;
        $failCount = 0;
        $totalCreated = 0;
        $totalDeleted = 0;
        
        // Обрабатываем каждое сообщение
        foreach ($messages as $message) {
            $messageId = $message['id_message'];
            $attempts = $message['attempts'];
            
            logYouTube("--- Обработка сообщения ID={$messageId} (попытка " . ($attempts + 1) . "/" . MAX_ATTEMPTS . ") ---");
            
            // Помечаем как обрабатываемое
            markAsProcessing($messageId);
            
            try {
                // Вызываем функцию ютубизации
                $result = youtubizeMessage($messageId);
                
                if ($result['success']) {
                    $successCount++;
                    $totalCreated += $result['created'];
                    $totalDeleted += $result['deleted'];
                    
                    // Помечаем как завершенное
                    markAsCompleted($messageId, $result['created'], $result['deleted']);
                    
                    logYouTube("Успешно: создано={$result['created']}, удалено={$result['deleted']}");
                } else {
                    $failCount++;
                    $newAttempts = $attempts + 1;
                    
                    // Если превышено количество попыток - помечаем как failed
                    if ($newAttempts >= MAX_ATTEMPTS) {
                        markAsFailed($messageId, $result['error'], $newAttempts);
                        logYouTube("Превышено количество попыток, помечаем как failed: {$result['error']}", 'ERROR');
                    } else {
                        // Возвращаем в pending для повторной попытки
                        markAsPending($messageId, $result['error'], $newAttempts);
                        logYouTube("Ошибка (попытка {$newAttempts}): {$result['error']}", 'WARNING');
                    }
                }
            } catch (Exception $e) {
                $failCount++;
                $newAttempts = $attempts + 1;
                $errorMessage = $e->getMessage();
                
                if ($newAttempts >= MAX_ATTEMPTS) {
                    markAsFailed($messageId, $errorMessage, $newAttempts);
                    logYouTube("Исключение при ютубизации (превышены попытки): {$errorMessage}", 'ERROR');
                } else {
                    markAsPending($messageId, $errorMessage, $newAttempts);
                    logYouTube("Исключение при ютубизации (попытка {$newAttempts}): {$errorMessage}", 'WARNING');
                }
            }
            
            // Задержка между сообщениями для защиты preview сервера
            if (SLEEP_BETWEEN_MESSAGES > 0 && $messageId !== end($messages)['id_message']) {
                sleep(SLEEP_BETWEEN_MESSAGES);
            }
        }
        
        // Финальный отчет
        logYouTube("=== ИТОГИ ЗАПУСКА ===");
        logYouTube("Обработано сообщений: " . count($messages));
        logYouTube("Успешно: {$successCount}");
        logYouTube("С ошибками: {$failCount}");
        logYouTube("Всего YouTube аттачментов создано: {$totalCreated}");
        logYouTube("Всего старых YouTube аттачментов удалено: {$totalDeleted}");
        
        // Обновленная статистика
        $newStats = getYoutubizeStats();
        logYouTube("Осталось в очереди: pending={$newStats['pending']}, failed={$newStats['failed']}");
        
        if ($newStats['pending'] === 0 && $newStats['processing'] === 0) {
            logYouTube("!!!КОНЕЦ!!! Вся очередь обработана!");
        }
        
        logYouTube("=== ЗАВЕРШЕНИЕ РАБОТЫ ВОРКЕРА ===");
        logYouTube("");
        logYouTube("");
        
        return [
            'status' => 'success',
            'message' => 'Ютубизация завершена',
            'processed' => count($messages),
            'success' => $successCount,
            'failed' => $failCount,
            'created_attachments' => $totalCreated,
            'deleted_attachments' => $totalDeleted,
            'stats' => $newStats
        ];
        
    } catch (Exception $e) {
        logYouTube("Критическая ошибка воркера: " . $e->getMessage(), 'ERROR');
        throw $e;
    }
}

/**
 * Проверяет существование таблицы tbl_youtubize
 */
function checkYoutubizeTableExists() {
    global $mysqli;
    
    $result = mysqli_query($mysqli, "SHOW TABLES LIKE 'tbl_youtubize'");
    return mysqli_num_rows($result) > 0;
}

/**
 * Создает таблицу tbl_youtubize
 */
function createYoutubizeTable() {
    global $mysqli;
    
    $sql = "
    CREATE TABLE IF NOT EXISTS tbl_youtubize (
        id_message INT NOT NULL,
        status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
        attempts TINYINT NOT NULL DEFAULT 0,
        time_added DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        time_processed DATETIME NULL,
        error_message TEXT NULL,
        PRIMARY KEY (id_message),
        INDEX idx_status (status),
        INDEX idx_time_added (time_added)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";
    
    if (mysqli_query($mysqli, $sql)) {
        logYouTube("Таблица tbl_youtubize успешно создана");
        return true;
    } else {
        logYouTube("Ошибка создания таблицы: " . mysqli_error($mysqli), 'ERROR');
        return false;
    }
}

/**
 * Получает сообщения для ютубизации из очереди
 */
function getMessagesToYoutubize($limit) {
    global $mysqli;
    
    $maxAttempts = MAX_ATTEMPTS;
    $stmt = $mysqli->prepare("
        SELECT id_message, status, attempts, time_added
        FROM tbl_youtubize
        WHERE status = 'pending' AND attempts < ?
        ORDER BY time_added ASC
        LIMIT ?
    ");
    $stmt->bind_param("ii", $maxAttempts, $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }
    
    return $messages;
}

/**
 * Получает статистику по очереди ютубизации
 */
function getYoutubizeStats() {
    global $mysqli;
    
    $stats = [
        'pending' => 0,
        'processing' => 0,
        'completed' => 0,
        'failed' => 0,
        'total' => 0
    ];
    
    $stmt = $mysqli->prepare("
        SELECT status, COUNT(*) as count
        FROM tbl_youtubize
        GROUP BY status
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    while ($row = $result->fetch_assoc()) {
        $stats[$row['status']] = (int)$row['count'];
        $stats['total'] += (int)$row['count'];
    }
    
    return $stats;
}

/**
 * Помечает сообщение как обрабатываемое
 */
function markAsProcessing($messageId) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        UPDATE tbl_youtubize
        SET status = 'processing', time_processed = NOW()
        WHERE id_message = ?
    ");
    $stmt->bind_param("i", $messageId);
    return $stmt->execute();
}

/**
 * Помечает сообщение как успешно обработанное
 */
function markAsCompleted($messageId, $created = 0, $deleted = 0) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        UPDATE tbl_youtubize
        SET status = 'completed', 
            time_processed = NOW(),
            error_message = CONCAT('Created: ', ?, ', Deleted: ', ?)
        WHERE id_message = ?
    ");
    $stmt->bind_param("iii", $created, $deleted, $messageId);
    return $stmt->execute();
}

/**
 * Помечает сообщение как failed (превышено количество попыток)
 */
function markAsFailed($messageId, $errorMessage, $attempts) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        UPDATE tbl_youtubize
        SET status = 'failed',
            attempts = ?,
            time_processed = NOW(),
            error_message = ?
        WHERE id_message = ?
    ");
    $stmt->bind_param("isi", $attempts, $errorMessage, $messageId);
    return $stmt->execute();
}

/**
 * Возвращает сообщение в pending для повторной попытки
 */
function markAsPending($messageId, $errorMessage, $attempts) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        UPDATE tbl_youtubize
        SET status = 'pending',
            attempts = ?,
            time_processed = NOW(),
            error_message = ?
        WHERE id_message = ?
    ");
    $stmt->bind_param("isi", $attempts, $errorMessage, $messageId);
    return $stmt->execute();
}

/**
 * Сбрасывает зависшие processing записи обратно в pending
 * (если они в статусе processing более 10 минут)
 */
function resetStuckProcessing() {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        UPDATE tbl_youtubize
        SET status = 'pending'
        WHERE status = 'processing' 
        AND time_processed < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
    ");
    $stmt->execute();
    $affected = mysqli_affected_rows($mysqli);
    
    if ($affected > 0) {
        logYouTube("Сброшено зависших processing записей: {$affected}", 'WARNING');
    }
    
    return $affected;
}

// Основная логика - только для HTTP (cron) или CLI
logYouTube("Воркер ютубизации запущен");

// Устанавливаем заголовки для HTTP ответа
if (php_sapi_name() !== 'cli') {
    header('Content-Type: application/json; charset=UTF-8');
}

// Проверяем, что запрос идет от cron или CLI
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$isCronRequest = strpos($userAgent, 'Wget') !== false || 
                 strpos($userAgent, 'curl') !== false || 
                 strpos($userAgent, 'cron') !== false ||
                 php_sapi_name() === 'cli';

if (!$isCronRequest && php_sapi_name() !== 'cli') {
    http_response_code(403);
    echo json_encode(['error' => 'Доступ запрещен. Только для cron задач.']);
    logYouTube("Отклонен запрос не от cron: User-Agent = {$userAgent}", 'WARNING');
    exit;
}

try {
    $result = runYoutubizeWorker();
    
    if (php_sapi_name() === 'cli') {
        // Вывод для CLI
        echo "\n=== РЕЗУЛЬТАТ ===\n";
        echo "Статус: {$result['status']}\n";
        echo "Сообщение: {$result['message']}\n";
        if (isset($result['processed'])) {
            echo "Обработано: {$result['processed']}\n";
            echo "Успешно: {$result['success']}\n";
            echo "С ошибками: {$result['failed']}\n";
            echo "Создано аттачментов: {$result['created_attachments']}\n";
            echo "Удалено аттачментов: {$result['deleted_attachments']}\n";
        }
        if (isset($result['stats'])) {
            echo "\nСтатистика очереди:\n";
            echo "  Pending: {$result['stats']['pending']}\n";
            echo "  Processing: {$result['stats']['processing']}\n";
            echo "  Completed: {$result['stats']['completed']}\n";
            echo "  Failed: {$result['stats']['failed']}\n";
            echo "  Всего: {$result['stats']['total']}\n";
        }
        echo "\n";
    } else {
        // JSON для HTTP
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    logYouTube("Критическая ошибка воркера: " . $e->getMessage(), 'ERROR');
    
    if (php_sapi_name() !== 'cli') {
        http_response_code(500);
    }
    
    echo json_encode([
        'status' => 'error',
        'message' => 'Критическая ошибка воркера: ' . $e->getMessage()
    ]);
    exit(1);
}
?>

