<?php
/**
 * Воркер для обновления превью и метаданных YouTube аттачментов
 * Запускается cron'ом периодически
 * 
 * Обрабатывает YouTube аттачменты без duration (признак необработанности)
 * Обновляет: title, duration, preview, icon
 */

require_once 'include/main.php';
require_once 'include/functions-logging.php';
require_once 'include/functions-attachments.php';

// Конфигурация
define('ATTACHMENTS_PER_RUN', 10); // Количество аттачментов для обработки за раз
define('SLEEP_BETWEEN_ATTACHMENTS', 2); // Задержка между аттачментами в секундах

/**
 * Основная функция воркера
 */
function runRefreshWorker() {
    logYouTube("=== ЗАПУСК ВОРКЕРА ОБНОВЛЕНИЯ YOUTUBE ПРЕВЬЮ ===");
    
    try {
        // Проверяем наличие столбца duration
        if (!checkDurationColumnExists()) {
            logYouTube("Столбец duration не существует. Выполните миграцию БД.", 'ERROR');
            return [
                'status' => 'error',
                'message' => 'Столбец duration не существует в tbl_attachments'
            ];
        }
        
        // Получаем статистику
        $stats = getRefreshStats();
        logYouTube("Статистика: всего YouTube аттачментов={$stats['total']}, требуют обновления={$stats['needs_refresh']}, недоступные={$stats['unavailable']}");
        
        if ($stats['needs_refresh'] === 0) {
            logYouTube("Нет аттачментов для обновления");
            return [
                'status' => 'success',
                'message' => 'Нет аттачментов для обновления',
                'stats' => $stats
            ];
        }
        
        // Получаем аттачменты для обработки
        $attachments = getAttachmentsToRefresh(ATTACHMENTS_PER_RUN);
        
        if (empty($attachments)) {
            logYouTube("Нет доступных аттачментов для обработки");
            return [
                'status' => 'success',
                'message' => 'Нет доступных аттачментов',
                'stats' => $stats
            ];
        }
        
        logYouTube("Найдено аттачментов для обновления: " . count($attachments));
        
        // Счетчики
        $successCount = 0;
        $failCount = 0;
        $skippedCount = 0;
        
        // Обрабатываем каждый аттачмент
        foreach ($attachments as $attachment) {
            $attachmentId = $attachment['id'];
            $source = $attachment['source'];
            
            logYouTube("--- Обработка аттачмента ID={$attachmentId} ---");
            
            try {
                // Получаем video ID
                $videoId = getYouTubeCode($source);
                
                if (!$videoId) {
                    logYouTube("Не удалось извлечь video ID из {$source}", 'WARNING');
                    $skippedCount++;
                    continue;
                }
                
                logYouTube("Video ID: {$videoId}");
                
                // Обновляем метаданные и превью
                $result = refreshYouTubeAttachment($attachmentId, $videoId, $attachment);
                
                if ($result['success']) {
                    $successCount++;
                    logYouTube("Успешно обновлен: title={$result['title_updated']}, duration={$result['duration_updated']}, preview={$result['preview_updated']}, icon={$result['icon_updated']}");
                } else {
                    $failCount++;
                    logYouTube("Ошибка обновления: {$result['error']}", 'ERROR');
                    
                    // Помечаем аттачмент как недоступный, если не удалось получить метаданные
                    if (strpos($result['error'], 'Failed to fetch info API') !== false || 
                        strpos($result['error'], 'Info API returned error') !== false) {
                        markAttachmentAsUnavailable($attachmentId, $result['error']);
                        logYouTube("Аттачмент {$attachmentId} помечен как недоступный: {$result['error']}", 'WARNING');
                    }
                }
                
            } catch (Exception $e) {
                $failCount++;
                logYouTube("Исключение при обработке аттачмента: " . $e->getMessage(), 'ERROR');
            }
            
            // Задержка между аттачментами
            if (SLEEP_BETWEEN_ATTACHMENTS > 0 && $attachmentId !== end($attachments)['id']) {
                sleep(SLEEP_BETWEEN_ATTACHMENTS);
            }
        }
        
        // Финальный отчет
        logYouTube("=== ИТОГИ ЗАПУСКА ===");
        logYouTube("Обработано аттачментов: " . count($attachments));
        logYouTube("Успешно: {$successCount}");
        logYouTube("С ошибками: {$failCount}");
        logYouTube("Пропущено: {$skippedCount}");
        
        // Обновленная статистика
        $newStats = getRefreshStats();
        logYouTube("Осталось для обновления: {$newStats['needs_refresh']}");
        
        if ($newStats['needs_refresh'] === 0) {
            logYouTube("!!!КОНЕЦ!!! Все аттачменты обновлены!");
        }
        
        logYouTube("=== ЗАВЕРШЕНИЕ РАБОТЫ ВОРКЕРА ===");
        logYouTube("");
        
        return [
            'status' => 'success',
            'message' => 'Обновление завершено',
            'processed' => count($attachments),
            'success' => $successCount,
            'failed' => $failCount,
            'skipped' => $skippedCount,
            'stats' => $newStats
        ];
        
    } catch (Exception $e) {
        logYouTube("Критическая ошибка воркера: " . $e->getMessage(), 'ERROR');
        throw $e;
    }
}

/**
 * Проверяет существование столбца duration
 */
function checkDurationColumnExists() {
    global $mysqli;
    
    $result = mysqli_query($mysqli, "SHOW COLUMNS FROM tbl_attachments LIKE 'duration'");
    return mysqli_num_rows($result) > 0;
}

/**
 * Получает статистику по YouTube аттачментам
 */
function getRefreshStats() {
    global $mysqli;
    
    $stats = [
        'total' => 0,
        'needs_refresh' => 0,
        'has_duration' => 0,
        'without_preview' => 0,
        'unavailable' => 0
    ];
    
    // Всего YouTube аттачментов
    $result = mysqli_query($mysqli, "SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'youtube'");
    if ($result) {
        $row = mysqli_fetch_assoc($result);
        $stats['total'] = (int)$row['count'];
    }
    
    // Требуют обновления (без duration, но с preview, и не недоступные)
    $result = mysqli_query($mysqli, "SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'youtube' AND (duration IS NULL OR duration = 0) AND preview > 0 AND status != 'unavailable'");
    if ($result) {
        $row = mysqli_fetch_assoc($result);
        $stats['needs_refresh'] = (int)$row['count'];
    }
    
    // Уже обновлены
    $result = mysqli_query($mysqli, "SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'youtube' AND duration IS NOT NULL AND duration > 0");
    if ($result) {
        $row = mysqli_fetch_assoc($result);
        $stats['has_duration'] = (int)$row['count'];
    }
    
    // Без preview (не могут быть обработаны этим воркером)
    $result = mysqli_query($mysqli, "SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'youtube' AND (duration IS NULL OR duration = 0) AND preview = 0");
    if ($result) {
        $row = mysqli_fetch_assoc($result);
        $stats['without_preview'] = (int)$row['count'];
    }
    
    // Недоступные (помечены как unavailable)
    $result = mysqli_query($mysqli, "SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'youtube' AND status = 'unavailable'");
    if ($result) {
        $row = mysqli_fetch_assoc($result);
        $stats['unavailable'] = (int)$row['count'];
    }
    
    return $stats;
}

/**
 * Получает YouTube аттачменты для обновления
 * Сначала аттачменты из самых новых сообщений, без duration, но с preview
 */
function getAttachmentsToRefresh($limit) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT 
            a.id, 
            a.source, 
            a.preview, 
            a.icon, 
            a.title, 
            a.duration, 
            a.created,
            m.time_created as message_created
        FROM tbl_attachments a
        INNER JOIN tbl_messages m ON a.id_message = m.id_message
        WHERE a.type = 'youtube' 
        AND (a.duration IS NULL OR a.duration = 0)
        AND a.source IS NOT NULL
        AND a.preview > 0
        AND a.status != 'unavailable'
        ORDER BY m.time_created DESC
        LIMIT ?
    ");
    $stmt->bind_param("i", $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $attachments = [];
    while ($row = $result->fetch_assoc()) {
        $attachments[] = $row;
    }
    
    return $attachments;
}

/**
 * Помечает аттачмент как недоступный
 */
function markAttachmentAsUnavailable($attachmentId, $reason) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("UPDATE tbl_attachments SET status = 'unavailable' WHERE id = ?");
    $stmt->bind_param("s", $attachmentId);
    
    if ($stmt->execute()) {
        logYouTube("Аттачмент {$attachmentId} помечен как недоступный. Причина: {$reason}");
        return true;
    } else {
        logYouTube("Ошибка пометки аттачмента как недоступного: " . $mysqli->error, 'ERROR');
        return false;
    }
}

/**
 * Обновляет метаданные и превью YouTube аттачмента
 */
function refreshYouTubeAttachment($attachmentId, $videoId, $oldAttachment) {
    global $mysqli;
    
    $result = [
        'success' => false,
        'title_updated' => false,
        'duration_updated' => false,
        'preview_updated' => false,
        'icon_updated' => false,
        'error' => null
    ];
    
    // 1. Получаем метаданные с info API
    $infoUrl = "http://194.135.33.47:5000/api/info/" . $videoId;
    $infoResponse = @file_get_contents($infoUrl);
    
    if (!$infoResponse) {
        $result['error'] = 'Failed to fetch info API';
        return $result;
    }
    
    $info = json_decode($infoResponse, true);
    if (!$info || isset($info['error'])) {
        $result['error'] = 'Info API returned error: ' . ($info['error'] ?? 'unknown');
        return $result;
    }
    
    $title = $info['title'] ?? null;
    $duration = isset($info['duration']) ? intval($info['duration']) * 1000 : null;
    
    logYouTube("Получены метаданные: title={$title}, duration={$duration}ms");
    
    // 2. Обновляем title и duration в БД
    if ($title || $duration !== null) {
        $updateSql = $mysqli->prepare("UPDATE tbl_attachments SET title = ?, duration = ? WHERE id = ?");
        $updateSql->bind_param("sis", $title, $duration, $attachmentId);
        
        if ($updateSql->execute()) {
            $result['title_updated'] = true;
            $result['duration_updated'] = true;
            logYouTube("Метаданные обновлены в БД");
        } else {
            logYouTube("Ошибка обновления метаданных в БД: " . $mysqli->error, 'ERROR');
        }
    }
    
    // 3. Создаем папку для файлов
    $folderPath = createAttachmentFolder($attachmentId);
    if (!$folderPath) {
        $result['error'] = 'Failed to create folder';
        return $result;
    }
    
    // 4. Обновляем preview
    $oldPreviewVersion = intval($oldAttachment['preview']);
    $newPreviewVersion = $oldPreviewVersion + 1;
    
    $previewUrl = "http://194.135.33.47:5000/api/preview/" . $videoId;
    $newPreviewPath = buildAttachmentPreviewPhysicalPath($attachmentId, $newPreviewVersion);
    
    logYouTube("Скачиваем preview v{$newPreviewVersion} с {$previewUrl}");
    
    if (downloadFile($previewUrl, $newPreviewPath)) {
        // Проверяем что файл создан и не пустой
        if (file_exists($newPreviewPath) && filesize($newPreviewPath) > 1024) {
            // Обновляем версию preview в БД
            $updatePreviewSql = $mysqli->prepare("UPDATE tbl_attachments SET preview = ? WHERE id = ?");
            $updatePreviewSql->bind_param("is", $newPreviewVersion, $attachmentId);
            $updatePreviewSql->execute();
            
            $result['preview_updated'] = true;
            logYouTube("Preview обновлен: v{$oldPreviewVersion} -> v{$newPreviewVersion}");
            
            // Удаляем старый preview
            if ($oldPreviewVersion > 0) {
                $oldPreviewPath = buildAttachmentPreviewPhysicalPath($attachmentId, $oldPreviewVersion);
                if ($oldPreviewPath && file_exists($oldPreviewPath)) {
                    if (@unlink($oldPreviewPath)) {
                        logYouTube("Удален старый preview: v{$oldPreviewVersion}");
                    } else {
                        logYouTube("Не удалось удалить старый preview: v{$oldPreviewVersion}", 'WARNING');
                    }
                }
            }
        } else {
            logYouTube("Preview файл пустой или не создан", 'WARNING');
            @unlink($newPreviewPath);
        }
    } else {
        logYouTube("Не удалось скачать preview", 'WARNING');
    }
    
    // 5. НЕ обновляем icon для YouTube аттачментов
    // Иконки уже созданы правильно при первоначальной обработке
    // Обновление иконок может их портить
    logYouTube("Icon не обновляется (для YouTube аттачментов иконки создаются один раз)");
    
    // Результат успешен если обновлены хотя бы метаданные
    $result['success'] = $result['title_updated'] || $result['duration_updated'];
    
    return $result;
}

// Основная логика - только для HTTP (cron) или CLI
logYouTube("Воркер обновления YouTube превью запущен");

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
    $result = runRefreshWorker();
    
    if (php_sapi_name() === 'cli') {
        // Вывод для CLI
        echo "\n=== РЕЗУЛЬТАТ ===\n";
        echo "Статус: {$result['status']}\n";
        echo "Сообщение: {$result['message']}\n";
        if (isset($result['processed'])) {
            echo "Обработано: {$result['processed']}\n";
            echo "Успешно: {$result['success']}\n";
            echo "С ошибками: {$result['failed']}\n";
            echo "Пропущено: {$result['skipped']}\n";
        }
        if (isset($result['stats'])) {
            echo "\nСтатистика:\n";
            echo "  Всего YouTube аттачментов: {$result['stats']['total']}\n";
            echo "  Требуют обновления (с preview): {$result['stats']['needs_refresh']}\n";
            echo "  Уже обновлены: {$result['stats']['has_duration']}\n";
            echo "  Без preview (пропущены): {$result['stats']['without_preview']}\n";
            echo "  Недоступные (пропущены): {$result['stats']['unavailable']}\n";
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

