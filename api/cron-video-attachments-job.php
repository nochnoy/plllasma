<?php
/**
 * Воркер для обработки видео аттачментов
 * Запускается cron'ом каждые 5 минут
 * Обрабатывает один файл за запуск
 * Использует только проверку в БД для предотвращения множественных запусков
 */

require_once 'include/main.php';
require_once 'include/functions-video.php';
require_once 'include/functions-logging.php';
require_once 'include/functions-attachments.php';
require_once 'include/s3.php';

// Конфигурация
define('MAX_PROCESSING_TIME', 300); // 5 минут - максимальное время обработки одного файла


/**
 * Основная функция воркера
 */
function runWorker() {
    plllasmaLog("=== ЗАПУСК ВОРКЕРА ВИДЕО АТТАЧМЕНТОВ ===", 'INFO', 'video-worker');
    
    try {
        // Проверяем, не запущен ли уже воркер
        if (isWorkerRunning()) {
            plllasmaLog("Воркер уже запущен, завершаемся", 'INFO', 'video-worker');
            return ['status' => 'skipped', 'message' => 'Воркер уже запущен'];
        }
        
        // Получаем детальную диагностику
        $diagnostics = getVideoFilesDiagnostics();
        $recentFiles = getRecentVideoFilesDetailed(5);
        
        plllasmaLog("=== ДИАГНОСТИКА ВИДЕО ФАЙЛОВ ===", 'INFO', 'video-worker');
        $failedCount = $diagnostics['videos_failed'] ?? 0;
        plllasmaLog("Всего видео: {$diagnostics['total_videos']}, готовых: {$diagnostics['ready_videos']}, с файлом: {$diagnostics['videos_with_file']}, без иконки: {$diagnostics['videos_without_icon']}, без превью: {$diagnostics['videos_without_preview']}, в обработке: {$diagnostics['videos_processing']}, ожидающих: {$diagnostics['videos_pending']}, необрабатываемых: {$failedCount}", 'INFO', 'video-worker');
        
        // Показываем последние файлы
        if (!empty($recentFiles)) {
            plllasmaLog("=== ПОСЛЕДНИЕ 5 ВИДЕО ФАЙЛОВ ===", 'INFO', 'video-worker');
            foreach ($recentFiles as $file) {
                $iconStatus = $file['icon_file_exists'] ? '✅' : '❌';
                $previewStatus = $file['preview_file_exists'] ? '✅' : '❌';
                $blockingReasons = '';
                if (!empty($file['blocking_reasons']) && is_array($file['blocking_reasons'])) {
                    $blockingReasons = ' (блокировки: ' . implode(', ', $file['blocking_reasons']) . ')';
                }
                plllasmaLog("ID: {$file['id']}, файл: {$file['filename']}, статус: {$file['status']}, иконка: {$iconStatus}, превью: {$previewStatus}{$blockingReasons}", 'INFO', 'video-worker');
            }
        }
        
        // Проверяем, есть ли видео файлы для обработки
        $availableCount = getAvailableFilesCount();
        plllasmaLog("getAvailableFilesCount() вернул: {$availableCount}", 'DEBUG', 'video-worker');
        
        if ($availableCount === 0) {
            plllasmaLog("Нет видео для обработки, проверяем файлы для S3 миграции", 'INFO', 'video-worker');
            
            // Пробуем мигрировать файлы в S3
            $migrationResult = tryS3Migration();
            if ($migrationResult) {
                return $migrationResult;
            }
            
            return ['status' => 'success', 'message' => 'Нет файлов для обработки'];
        }
        
        plllasmaLog("Доступно видео для обработки: {$availableCount}", 'INFO', 'video-worker');
        
        // Блокируем следующий файл для обработки
        if (!getNextFileToProcess()) {
            plllasmaLog("Не удалось заблокировать файл для обработки", 'WARNING', 'video-worker');
            return ['status' => 'warning', 'message' => 'Не удалось заблокировать файл для обработки'];
        }
        
        // Получаем заблокированный файл
        $attachment = getLockedFile();
        
        if (!$attachment) {
            plllasmaLog("Не удалось получить заблокированный файл", 'ERROR', 'video-worker');
            return ['status' => 'error', 'message' => 'Не удалось получить заблокированный файл'];
        }
        
        plllasmaLog("Обрабатываем файл: {$attachment['filename']} (ID: {$attachment['id']})", 'INFO', 'video-worker');
        
        // Обрабатываем файл
        $result = processAttachment($attachment);
        
        // Освобождаем блокировку
        releaseFileLock($attachment['id']);
        
        if ($result) {
            plllasmaLog("Обработка завершена успешно", 'INFO', 'video-worker');
            return ['status' => 'success', 'message' => 'Обработка завершена успешно'];
        } else {
            plllasmaLog("Обработка завершена с ошибкой", 'WARNING', 'video-worker');
            return ['status' => 'warning', 'message' => 'Обработка завершена с ошибкой'];
        }
        
    } catch (Exception $e) {
        plllasmaLog("Критическая ошибка воркера: " . $e->getMessage(), 'ERROR', 'video-worker');
        
        // Пытаемся освободить блокировку в случае ошибки
        if (isset($attachment)) {
            releaseFileLock($attachment['id']);
        }
        
        throw $e;
    }
}

/**
 * Проверяет, не запущен ли уже воркер
 * Проверяет оба флага: processing_started (видео) и s3_migration_started (S3)
 */
function isWorkerRunning() {
    global $mysqli;
    
    $maxTime = MAX_PROCESSING_TIME;
    
    // Ищем файлы, которые обрабатываются сейчас (видео или S3 миграция)
    $stmt = $mysqli->prepare("
        SELECT COUNT(*) as count 
        FROM tbl_attachments 
        WHERE (processing_started IS NOT NULL AND processing_started > DATE_SUB(NOW(), INTERVAL ? SECOND))
           OR (s3_migration_started IS NOT NULL AND s3_migration_started > DATE_SUB(NOW(), INTERVAL ? SECOND))
    ");
    
    $stmt->bind_param("ii", $maxTime, $maxTime);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    plllasmaLog("isWorkerRunning: активных задач = {$row['count']} (maxTime={$maxTime})", 'DEBUG', 'video-worker');
    
    return $row['count'] > 0;
}

/**
 * Получает количество доступных файлов для обработки
 */
function getAvailableFilesCount() {
    global $mysqli;
    
    // Добавлена проверка существования сообщения через JOIN
    $stmt = $mysqli->prepare("
        SELECT COUNT(*) as count 
        FROM tbl_attachments a
        JOIN tbl_messages m ON a.id_message = m.id_message
        WHERE a.type = 'video' 
        AND a.status = 'pending'
        AND a.file IS NOT NULL
        AND (a.processing_started IS NULL OR a.processing_started < DATE_SUB(NOW(), INTERVAL ? SECOND))
    ");
    
    $maxTime = MAX_PROCESSING_TIME;
    $stmt->bind_param("i", $maxTime);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    return $row['count'];
}

/**
 * Получает детальную диагностику видео файлов
 */
function getVideoFilesDiagnostics() {
    global $mysqli;
    
    $diagnostics = [];
    
    // Всего видео файлов
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video'");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['total_videos'] = $row['count'];
    
    // Видео со статусом 'ready'
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND status = 'ready'");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['ready_videos'] = $row['count'];
    
    // Видео с файлом
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND file IS NOT NULL");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['videos_with_file'] = $row['count'];
    
    // Видео без иконки
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND (icon = 0)");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['videos_without_icon'] = $row['count'];
    
    // Видео без превью
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND (preview = 0)");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['videos_without_preview'] = $row['count'];
    
    // Видео в обработке
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND processing_started IS NOT NULL AND processing_started > DATE_SUB(NOW(), INTERVAL 300 SECOND)");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['videos_processing'] = $row['count'];
    
    // Видео в состоянии ожидания обработки
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND status = 'pending'");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['videos_pending'] = $row['count'];
    
    // Видео со статусом failed (обработка не удалась)
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND status = 'failed'");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['videos_failed'] = $row['count'];
    
    // Видео с разными статусами
    $stmt = $mysqli->prepare("SELECT status, COUNT(*) as count FROM tbl_attachments WHERE type = 'video' GROUP BY status");
    $stmt->execute();
    $result = $stmt->get_result();
    $statusCounts = [];
    while ($row = $result->fetch_assoc()) {
        $statusCounts[$row['status']] = $row['count'];
    }
    $diagnostics['status_breakdown'] = $statusCounts;
    
    return $diagnostics;
}

/**
 * Получает последние видео файлы с детальной информацией
 */
function getRecentVideoFilesDetailed($limit = 10) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT id, file, icon, preview, status, processing_started, created, id_message, filename
        FROM tbl_attachments 
        WHERE type = 'video'
        ORDER BY created DESC
        LIMIT ?
    ");
    $stmt->bind_param("i", $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $files = [];
    while ($row = $result->fetch_assoc()) {
        // Проверяем существование файлов (используем новую схему версионирования)
        
        // Строим путь к файлу
        if ($row['filename'] && $row['file'] > 0) {
            $extension = strtolower(pathinfo($row['filename'], PATHINFO_EXTENSION));
            $filePath = buildAttachmentFilePhysicalPath($row['id'], $row['file'], $row['filename']);
        } else {
            $filePath = null;
        }
        
        $iconPath = $row['icon'] > 0 ? buildAttachmentIconPhysicalPath($row['id'], $row['icon']) : null;
        $previewPath = $row['preview'] > 0 ? buildAttachmentPreviewPhysicalPath($row['id'], $row['preview']) : null;
        
        $row['video_file_exists'] = $filePath ? file_exists($filePath) : false;
        $row['video_file_path'] = $filePath;
        $row['video_file_size'] = $row['video_file_exists'] ? filesize($filePath) : 0;
        $row['icon_file_exists'] = $iconPath ? file_exists($iconPath) : false;
        $row['icon_file_path'] = $iconPath;
        $row['icon_file_size'] = $row['icon_file_exists'] ? filesize($iconPath) : 0;
        $row['preview_file_exists'] = $previewPath ? file_exists($previewPath) : false;
        $row['preview_file_path'] = $previewPath;
        $row['preview_file_size'] = $row['preview_file_exists'] ? filesize($previewPath) : 0;
        
        // Проверяем, почему файл не обрабатывается
        $reasons = [];
        if ($row['status'] === 'pending') {
            $reasons[] = "pending_processing";
        } elseif ($row['status'] !== 'ready' && $row['status'] !== 'pending') {
            $reasons[] = "status_unknown:{$row['status']}";
        }
        if (empty($row['file'])) {
            $reasons[] = "no_file";
        }
        if ($row['icon'] > 0 && $row['preview'] > 0) {
            $reasons[] = "has_icon_and_preview:{$row['icon']},{$row['preview']}";
        } elseif ($row['icon'] > 0) {
            $reasons[] = "has_icon_no_preview:{$row['icon']}";
        } elseif ($row['preview'] > 0) {
            $reasons[] = "has_preview_no_icon:{$row['preview']}";
        }
        if ($row['processing_started'] && strtotime($row['processing_started']) > (time() - 300)) {
            $reasons[] = "processing:{$row['processing_started']}";
        }
        if (!$row['video_file_exists']) {
            $reasons[] = "file_not_exists";
        }
        
        $row['blocking_reasons'] = empty($reasons) ? 'ready_for_processing' : implode(',', $reasons);
        
        $files[] = $row;
    }
    
    return $files;
}

/**
 * Получает общее количество файлов типа 'file'
 */
function getTotalFilesCount() {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT COUNT(*) as count 
        FROM tbl_attachments 
        WHERE type = 'video'
    ");
    
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    return $row['count'];
}

/**
 * Получает статистику по типам аттачментов
 */
function getAllAttachmentTypes() {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT type, COUNT(*) as count 
        FROM tbl_attachments 
        GROUP BY type
        ORDER BY type
    ");
    
    $stmt->execute();
    $result = $stmt->get_result();
    
    $types = [];
    while ($row = $result->fetch_assoc()) {
        $types[] = "{$row['type']}: {$row['count']}";
    }
    
    return implode(', ', $types);
}

/**
 * Получает детали всех видео файлов
 */
function getVideoFilesDetails() {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT id, file, icon, status, processing_started, created
        FROM tbl_attachments 
        WHERE type = 'video'
        ORDER BY created DESC
        LIMIT 5
    ");
    
    $stmt->execute();
    $result = $stmt->get_result();
    
    $details = [];
    while ($row = $result->fetch_assoc()) {
        $iconStatus = empty($row['icon']) ? 'no_icon' : 'has_icon';
        $processingStatus = $row['processing_started'] ? 'processing' : 'free';
        $details[] = "id:{$row['id']} icon:{$iconStatus} status:{$row['status']} proc:{$processingStatus}";
    }
    
    return implode('; ', $details);
}

/**
 * Получает следующий файл для обработки
 */
function getNextFileToProcess() {
    global $mysqli;
    
    // Атомарно блокируем один файл для обработки
    // Добавлена проверка существования сообщения через JOIN
    $stmt = $mysqli->prepare("
        UPDATE tbl_attachments 
        SET processing_started = NOW() 
        WHERE id = (
            SELECT id FROM (
                SELECT a.id 
                FROM tbl_attachments a
                JOIN tbl_messages m ON a.id_message = m.id_message
                WHERE a.type = 'video' 
                AND a.status = 'pending'
                AND a.file IS NOT NULL
                AND (a.processing_started IS NULL OR a.processing_started < DATE_SUB(NOW(), INTERVAL ? SECOND))
                ORDER BY a.created DESC 
                LIMIT 1
            ) AS temp
        )
    ");
    
    $maxTime = MAX_PROCESSING_TIME;
    $stmt->bind_param("i", $maxTime);
    $stmt->execute();
    
    return $mysqli->affected_rows > 0;
}

/**
 * Получает заблокированный файл
 */
function getLockedFile() {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT a.*, m.id_place, p.name as channel_name
        FROM tbl_attachments a
        JOIN tbl_messages m ON a.id_message = m.id_message
        LEFT JOIN tbl_places p ON m.id_place = p.id_place
        WHERE a.processing_started IS NOT NULL 
        AND a.processing_started > DATE_SUB(NOW(), INTERVAL ? SECOND)
        ORDER BY a.processing_started DESC
        LIMIT 1
    ");
    
    $maxTime = MAX_PROCESSING_TIME;
    $stmt->bind_param("i", $maxTime);
    
    $stmt->execute();
    $result = $stmt->get_result();
    
    return $result->fetch_assoc();
}

/**
 * Записывает результат работы воркера в video-summary.log
 * Использует систему логирования Plasma, но пишет в фиксированный файл без даты
 * @param string $message Сообщение для записи
 */
function writeVideoSummaryLog($message) {
    if (!defined('LOG_DIR')) {
        return; // Система логирования не инициализирована
    }
    
    $logFile = LOG_DIR . 'video-summary.log';
    
    // Ротируем лог если он слишком большой (10MB)
    if (file_exists($logFile) && filesize($logFile) > 10 * 1024 * 1024) {
        // Сохраняем последние 1000 строк
        $lines = file($logFile);
        if ($lines !== false && count($lines) > 1000) {
            $lines = array_slice($lines, -1000);
            file_put_contents($logFile, implode('', $lines), LOCK_EX);
        }
    }
    
    $timestamp = date('Y-m-d H:i:s');
    $logLine = "[{$timestamp}] {$message}" . PHP_EOL;
    
    @file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
}

/**
 * Форматирует размер в байтах в читаемый формат
 * @param int $bytes Размер в байтах
 * @return string Отформатированный размер
 */
function formatBytes($bytes) {
    if ($bytes == 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $i = floor(log($bytes, 1024));
    return round($bytes / pow(1024, $i), 2) . ' ' . $units[$i];
}

/**
 * Освобождает блокировку файла
 */
function releaseFileLock($attachmentId) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        UPDATE tbl_attachments 
        SET processing_started = NULL 
        WHERE id = ?
    ");
    $stmt->bind_param("s", $attachmentId);
    $stmt->execute();
}

/**
 * Обрабатывает один аттачмент
 */
function processAttachment($attachment) {
    global $mysqli;
    
    $attachmentId = $attachment['id'];
    $fileVersion = $attachment['file'];
    $filename = $attachment['filename'];
    $messageId = $attachment['id_message'];
    
    plllasmaLog("=== НАЧИНАЕМ ОБРАБОТКУ АТТАЧМЕНТА ===", 'INFO', 'video-worker');
    plllasmaLog("ID: {$attachmentId}, файл версия: {$fileVersion}, имя файла: {$filename}, статус: {$attachment['status']}, создан: {$attachment['created']}", 'INFO', 'video-worker');
    
    // Проверяем, что сообщение ещё существует (могло быть удалено во время обработки)
    $stmt = $mysqli->prepare("SELECT id_message FROM tbl_messages WHERE id_message = ?");
    $stmt->bind_param("i", $messageId);
    $stmt->execute();
    $result = $stmt->get_result();
    if (!$result->fetch_assoc()) {
        plllasmaLog("Сообщение {$messageId} удалено, прерываем обработку аттачмента {$attachmentId}", 'WARNING', 'video-worker');
        return false;
    }
    
    // Проверяем, что аттачмент ещё существует в БД (мог быть удалён)
    $stmt = $mysqli->prepare("SELECT id FROM tbl_attachments WHERE id = ?");
    $stmt->bind_param("s", $attachmentId);
    $stmt->execute();
    $result = $stmt->get_result();
    if (!$result->fetch_assoc()) {
        plllasmaLog("Аттачмент {$attachmentId} удалён из БД, прерываем обработку", 'WARNING', 'video-worker');
        return false;
    }
    
    // Составляем путь к файлу используя новую схему версионирования
    
    if (!$filename) {
        plllasmaLog("ОШИБКА: Отсутствует имя файла для аттачмента {$attachmentId}", 'ERROR', 'video-worker');
        return false;
    }
    
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $isS3 = isset($attachment['s3']) && intval($attachment['s3']) === 1;
    $tempFilePath = null;
    
    if ($isS3) {
        // Файл хранится в S3 - скачиваем во временную директорию
        plllasmaLog("Файл хранится в S3, скачиваем для обработки", 'INFO', 'video-worker');
        
        global $S3_key_id, $S3_key;
        
        if (empty($S3_key_id) || empty($S3_key) || $S3_key_id === 'Идентификатор секретного ключа') {
            plllasmaLog("ОШИБКА: S3 ключи не настроены", 'ERROR', 'video-worker');
            return false;
        }
        
        // Настраиваем S3 клиент
        S3::setAuth($S3_key_id, $S3_key);
        S3::setSSL(true);
        S3::$endpoint = 'storage.yandexcloud.net';
        
        $bucket = 'plllasma';
        $objectKey = $attachmentId;
        
        // Создаём временный файл
        $tempDir = sys_get_temp_dir();
        $tempFilePath = $tempDir . '/plasma_video_' . $attachmentId . '.' . $extension;
        
        plllasmaLog("Скачиваем из S3: {$bucket}/{$objectKey} -> {$tempFilePath}", 'INFO', 'video-worker');
        
        $result = S3::getObject($bucket, $objectKey, $tempFilePath);
        
        if (!$result || $result->error !== false) {
            $errorMsg = $result ? (is_array($result->error) ? $result->error['message'] : 'Unknown error') : 'No response';
            plllasmaLog("ОШИБКА: Не удалось скачать файл из S3: {$errorMsg}", 'ERROR', 'video-worker');
            return false;
        }
        
        if (!file_exists($tempFilePath)) {
            plllasmaLog("ОШИБКА: Временный файл не создан после скачивания из S3", 'ERROR', 'video-worker');
            return false;
        }
        
        $filePath = $tempFilePath;
        plllasmaLog("Файл успешно скачан из S3, размер: " . filesize($tempFilePath) . " байт", 'INFO', 'video-worker');
    } else {
        // Локальный файл - используем абсолютный путь
        $filePath = buildAttachmentFilePhysicalPath($attachmentId, $fileVersion, $attachment['filename']);
        
        // Проверяем, существует ли файл
        plllasmaLog("Проверяем существование файла: {$filePath}", 'INFO', 'video-worker');
        if (!$filePath || !file_exists($filePath)) {
            plllasmaLog("ОШИБКА: Файл не найден: {$filePath}", 'ERROR', 'video-worker');
            if ($filePath) {
                plllasmaLog("Директория существует: " . (is_dir(dirname($filePath)) ? 'да' : 'нет'), 'INFO', 'video-worker');
                plllasmaLog("Содержимое директории: " . (is_dir(dirname($filePath)) ? implode(', ', scandir(dirname($filePath))) : 'N/A'), 'INFO', 'video-worker');
            }
            return false;
        }
    }
    
    $fileSize = filesize($filePath);
    plllasmaLog("Файл найден, размер: {$fileSize} байт", 'INFO', 'video-worker');
    
    // Определяем MIME тип
    $mimeType = mime_content_type($filePath);
    
    // Проверяем, является ли файл видео
    if (!isVideoFile($filePath, $mimeType)) {
        plllasmaLog("Файл {$attachmentId} не является видео ({$mimeType})", 'INFO', 'video-worker');
        // Удаляем временный файл, если был создан
        if ($tempFilePath && file_exists($tempFilePath)) {
            unlink($tempFilePath);
        }
        return false;
    }
    
    plllasmaLog("Обнаружено видео: {$attachmentId} ({$mimeType})", 'INFO', 'video-worker');
    
    // Определяем, нужно ли генерировать иконку
    $needIcon = $attachment['icon'] == 0;
    $iconVersion = $attachment['icon'];
    
    if ($needIcon) {
        // Генерируем иконку для видео (используем версию 1 для новой иконки)
        $iconVersion = max(1, $attachment['icon'] + 1);
        $iconPath = buildAttachmentIconPhysicalPath($attachmentId, $iconVersion);
        plllasmaLog("Генерируем иконку: {$filePath} -> {$iconPath}", 'INFO', 'video-worker');
        $iconGenerated = generateVideoIcon($filePath, $iconPath, 160, 160);
        
        if (!$iconGenerated) {
            plllasmaLog("Не удалось сгенерировать иконку для {$attachmentId}, но продолжаем обработку", 'WARNING', 'video-worker');
            $iconVersion = 0; // Оставляем 0, если не удалось создать
        }
        
        // Проверяем, что файл иконки действительно создался
        if ($iconGenerated && file_exists($iconPath)) {
            $iconSize = filesize($iconPath);
            plllasmaLog("Иконка создана успешно: {$iconPath}, размер: {$iconSize} байт", 'INFO', 'video-worker');
        } else if ($iconGenerated) {
            plllasmaLog("Файл иконки не найден после генерации: {$iconPath}", 'WARNING', 'video-worker');
            $iconVersion = 0; // Сбрасываем версию иконки, если файл не найден
        }
    } else {
        plllasmaLog("Иконка уже существует (версия {$iconVersion}), пропускаем генерацию иконки", 'INFO', 'video-worker');
    }
    
    // Определяем, нужно ли генерировать превью
    $needPreview = $attachment['preview'] == 0;
    $previewVersion = $attachment['preview'];
    
    if ($needPreview) {
        // Генерируем превью для видео (используем версию 1 для нового превью)
        $previewVersion = max(1, $attachment['preview'] + 1);
        $previewPath = buildAttachmentPreviewPhysicalPath($attachmentId, $previewVersion);
        plllasmaLog("Генерируем превью: {$filePath} -> {$previewPath}", 'INFO', 'video-worker');
        $previewGenerated = generateVideoPreview($filePath, $previewPath, 600, 100, 100, 5);
        
        if (!$previewGenerated) {
            plllasmaLog("Не удалось сгенерировать превью для {$attachmentId}, но продолжаем", 'WARNING', 'video-worker');
            $previewVersion = 0; // Оставляем 0, если не удалось создать
        } else {
            // Проверяем, что файл превью действительно создался
            if (file_exists($previewPath)) {
                $previewSize = filesize($previewPath);
                plllasmaLog("Превью создано успешно: {$previewPath}, размер: {$previewSize} байт", 'INFO', 'video-worker');
            } else {
                plllasmaLog("Файл превью не найден после генерации: {$previewPath}", 'WARNING', 'video-worker');
                $previewVersion = 0; // Сбрасываем версию превью, если файл не найден
            }
        }
    } else {
        plllasmaLog("Превью уже существует (версия {$previewVersion}), пропускаем генерацию превью", 'INFO', 'video-worker');
    }
    
    // Обновляем аттачмент в базе данных, только если что-то изменилось
    if ($needIcon || $needPreview) {
        // Определяем статус: если ничего не создалось (icon=0 и preview=0) - failed, иначе ready
        $newStatus = ($iconVersion === 0 && $previewVersion === 0) ? 'failed' : 'ready';
        
        plllasmaLog("Обновляем БД: icon версия = {$iconVersion}, preview версия = {$previewVersion}, статус = {$newStatus} для аттачмента {$attachmentId}", 'INFO', 'video-worker');
        
        $stmt = $mysqli->prepare("
            UPDATE tbl_attachments 
            SET icon = ?, preview = ?, status = ? 
            WHERE id = ?
        ");
        $stmt->bind_param("iiss", $iconVersion, $previewVersion, $newStatus, $attachmentId);
        $result = $stmt->execute();
    } else {
        plllasmaLog("Иконка и превью уже существуют, обновление БД не требуется", 'INFO', 'video-worker');
        $result = true; // Считаем успешным, если ничего не нужно было делать
    }
    
    if (!$result) {
        plllasmaLog("Ошибка выполнения UPDATE для аттачмента {$attachmentId}: " . $mysqli->error, 'ERROR', 'video-worker');
        // Удаляем временный файл, если был создан
        if ($tempFilePath && file_exists($tempFilePath)) {
            unlink($tempFilePath);
        }
        return false;
    }
    
    $affectedRows = $mysqli->affected_rows;
    plllasmaLog("БД обновлена: затронуто строк: {$affectedRows}", 'INFO', 'video-worker');
    
    // Обновляем JSON в сообщении
    plllasmaLog("Обновляем JSON для сообщения {$attachment['id_message']}", 'INFO', 'video-worker');
    updateMessageAttachmentsJson($attachment['id_message']);
    plllasmaLog("JSON обновлен для сообщения {$attachment['id_message']}", 'INFO', 'video-worker');
    
    // Удаляем временный файл, если он был создан для S3
    if ($tempFilePath && file_exists($tempFilePath)) {
        unlink($tempFilePath);
        plllasmaLog("Временный файл удалён: {$tempFilePath}", 'INFO', 'video-worker');
    }
    
    if (isset($newStatus) && $newStatus === 'failed') {
        plllasmaLog("Аттачмент {$attachmentId} помечен как failed (не удалось создать иконку/превью)", 'WARNING', 'video-worker');
    } else {
        plllasmaLog("Аттачмент {$attachmentId} успешно преобразован в видео", 'INFO', 'video-worker');
        
        // Записываем в summary лог
        if (isset($newStatus) && $newStatus === 'ready' && ($iconVersion > 0 || $previewVersion > 0)) {
            $filename = $attachment['filename'] ?? 'unknown';
            $size = isset($attachment['size']) ? formatBytes($attachment['size']) : 'unknown';
            $channelName = $attachment['channel_name'] ?? 'unknown';
            
            $iconText = $iconVersion > 0 ? 'иконка' : '';
            $previewText = $previewVersion > 0 ? 'превью' : '';
            $createdText = trim($iconText . ($iconText && $previewText ? ' и ' : '') . $previewText);
            
            writeVideoSummaryLog("Аттачмент {$filename} ({$size}) в канале {$channelName} - создана {$createdText}");
        }
    }
    return true;
}

/**
 * Обновляет JSON аттачментов в сообщении
 */
function updateMessageAttachmentsJson($messageId) {
    global $mysqli;
    
    // Получаем все аттачменты сообщения
    $stmt = $mysqli->prepare("SELECT * FROM tbl_attachments WHERE id_message = ? ORDER BY created");
    $stmt->bind_param("i", $messageId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $attachments = [];
    while ($row = $result->fetch_assoc()) {
        $attachments[] = $row;
    }
    
    // Преобразуем в нужный формат
    $newAttachments = array_map(function($attachment) {
        return [
            'id' => $attachment['id'],
            'type' => $attachment['type'],
            'created' => $attachment['created'],
            'icon' => (int)$attachment['icon'], // Версия иконки (число)
            'preview' => (int)$attachment['preview'], // Версия превью (число)
            'file' => (int)$attachment['file'], // Версия файла (число)
            'filename' => $attachment['filename'], // Оригинальное имя файла
            'source' => $attachment['source'],
            'status' => $attachment['status'],
            'views' => (int)$attachment['views'],
            'downloads' => (int)$attachment['downloads'],
            'size' => (int)$attachment['size']
        ];
    }, $attachments);
    
    // Обновляем JSON в сообщении
    $jsonData = json_encode(['j' => $newAttachments]);
    $stmt = $mysqli->prepare("UPDATE tbl_messages SET json = ? WHERE id_message = ?");
    $stmt->bind_param("si", $jsonData, $messageId);
    $stmt->execute();
}

/**
 * Пытается выполнить S3 миграцию, если есть файлы для переноса
 * @return array|null Результат миграции или null если нечего мигрировать
 */
function tryS3Migration() {
    global $mysqli, $S3_key_id, $S3_key;
    
    plllasmaLog("=== НАЧАЛО tryS3Migration ===", 'DEBUG', 'video-worker');
    plllasmaLog("S3_key_id: " . (empty($S3_key_id) ? 'EMPTY' : substr($S3_key_id, 0, 10) . '...'), 'DEBUG', 'video-worker');
    plllasmaLog("S3_key: " . (empty($S3_key) ? 'EMPTY' : 'SET'), 'DEBUG', 'video-worker');
    
    // Проверяем наличие S3 ключей
    if (empty($S3_key_id) || empty($S3_key) || $S3_key_id === 'Идентификатор секретного ключа') {
        plllasmaLog("S3 ключи не настроены, пропускаем миграцию", 'INFO', 'video-worker');
        return null;
    }
    
    plllasmaLog("S3 ключи настроены, ищем файлы для миграции", 'DEBUG', 'video-worker');
    
    // Получаем самый большой файл, не перенесённый в S3
    $attachment = getNextFileForS3Migration();
    
    plllasmaLog("Результат getNextFileForS3Migration: " . ($attachment ? json_encode($attachment) : 'NULL'), 'DEBUG', 'video-worker');
    
    if (!$attachment) {
        plllasmaLog("Нет файлов для S3 миграции", 'INFO', 'video-worker');
        return null;
    }
    
    plllasmaLog("Найден файл для S3 миграции: {$attachment['filename']} (ID: {$attachment['id']}, размер: " . number_format($attachment['size']) . " байт)", 'INFO', 'video-worker');
    
    // Блокируем файл для миграции
    if (!lockFileForS3Migration($attachment['id'])) {
        plllasmaLog("Не удалось заблокировать файл для S3 миграции", 'WARNING', 'video-worker');
        return ['status' => 'warning', 'message' => 'Не удалось заблокировать файл для S3 миграции'];
    }
    
    try {
        require_once 'include/functions-attachments.php';
        
        $result = migrateAttachmentToS3($attachment['id']);
        
        // Снимаем блокировку
        releaseS3MigrationLock($attachment['id']);
        
        if ($result['success']) {
            plllasmaLog("S3 миграция завершена успешно: {$attachment['filename']}", 'INFO', 'video-worker');
            
            // Записываем в summary лог
            $filename = $attachment['filename'] ?? 'unknown';
            $size = isset($attachment['size']) ? formatBytes($attachment['size']) : 'unknown';
            $channelName = $attachment['channel_name'] ?? 'unknown';
            writeVideoSummaryLog("Аттачмент {$filename} ({$size}) в канале {$channelName} - перенесён в S3");
            
            return ['status' => 'success', 'message' => 'S3 миграция завершена успешно'];
        } else {
            plllasmaLog("S3 миграция завершена с ошибкой: " . ($result['error'] ?? 'unknown'), 'WARNING', 'video-worker');
            return ['status' => 'warning', 'message' => 'S3 миграция завершена с ошибкой: ' . ($result['error'] ?? 'unknown')];
        }
    } catch (Exception $e) {
        releaseS3MigrationLock($attachment['id']);
        plllasmaLog("Ошибка S3 миграции: " . $e->getMessage(), 'ERROR', 'video-worker');
        return ['status' => 'error', 'message' => 'Ошибка S3 миграции: ' . $e->getMessage()];
    }
}

/**
 * Получает следующий файл для S3 миграции (самый большой локальный файл)
 * @return array|null Информация о файле или null
 */
function getNextFileForS3Migration() {
    global $mysqli;
    
    plllasmaLog("=== getNextFileForS3Migration ===", 'DEBUG', 'video-worker');
    
    // Сначала посмотрим, сколько вообще файлов с s3=0
    $debugStmt = $mysqli->prepare("
        SELECT COUNT(*) as cnt, 
               SUM(CASE WHEN a.file > 0 THEN 1 ELSE 0 END) as with_file,
               SUM(CASE WHEN a.filename IS NOT NULL THEN 1 ELSE 0 END) as with_filename
        FROM tbl_attachments a
        JOIN tbl_messages m ON a.id_message = m.id_message
        WHERE a.s3 = 0
    ");
    $debugStmt->execute();
    $debugResult = $debugStmt->get_result();
    $debugRow = $debugResult->fetch_assoc();
    plllasmaLog("Все каналы, s3=0: всего={$debugRow['cnt']}, с file>0={$debugRow['with_file']}, с filename={$debugRow['with_filename']}", 'DEBUG', 'video-worker');
    
    // Покажем конкретные записи
    $listStmt = $mysqli->prepare("
        SELECT a.id, a.filename, a.size, a.file, a.s3, a.s3_migration_started, m.id_place
        FROM tbl_attachments a
        JOIN tbl_messages m ON a.id_message = m.id_message
        WHERE a.s3 = 0
        ORDER BY a.created DESC
        LIMIT 5
    ");
    $listStmt->execute();
    $listResult = $listStmt->get_result();
    while ($row = $listResult->fetch_assoc()) {
        plllasmaLog("  Attachment: id={$row['id']}, file={$row['file']}, s3={$row['s3']}, filename=" . ($row['filename'] ?? 'NULL') . ", size={$row['size']}, migration_started=" . ($row['s3_migration_started'] ?? 'NULL'), 'DEBUG', 'video-worker');
    }
    
    // Берём самый большой файл с s3=0 (локальный), у которого есть файл (file > 0)
    // и который не заблокирован для миграции
    $maxTime = MAX_PROCESSING_TIME;
    
    $stmt = $mysqli->prepare("
        SELECT a.id, a.filename, a.size, a.file, p.name as channel_name
        FROM tbl_attachments a
        JOIN tbl_messages m ON a.id_message = m.id_message
        LEFT JOIN tbl_places p ON m.id_place = p.id_place
        WHERE a.s3 = 0 
          AND a.file > 0 
          AND a.filename IS NOT NULL
          AND (a.s3_migration_started IS NULL OR a.s3_migration_started < DATE_SUB(NOW(), INTERVAL ? SECOND))
        ORDER BY a.size DESC
        LIMIT 1
    ");
    
    $stmt->bind_param("i", $maxTime);
    $stmt->execute();
    $result = $stmt->get_result();
    
    plllasmaLog("Основной запрос: найдено строк = " . $result->num_rows, 'DEBUG', 'video-worker');
    
    if ($result && $result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

/**
 * Блокирует файл для S3 миграции
 * @param string $attachmentId ID аттачмента
 * @return bool Успешность блокировки
 */
function lockFileForS3Migration($attachmentId) {
    global $mysqli;
    
    plllasmaLog("lockFileForS3Migration: пытаемся заблокировать {$attachmentId}", 'DEBUG', 'video-worker');
    
    $stmt = $mysqli->prepare("
        UPDATE tbl_attachments 
        SET s3_migration_started = NOW() 
        WHERE id = ? AND (s3_migration_started IS NULL OR s3_migration_started < DATE_SUB(NOW(), INTERVAL ? SECOND))
    ");
    
    $maxTime = MAX_PROCESSING_TIME;
    $stmt->bind_param("si", $attachmentId, $maxTime);
    $stmt->execute();
    
    $success = $stmt->affected_rows > 0;
    plllasmaLog("lockFileForS3Migration: affected_rows = {$stmt->affected_rows}, success = " . ($success ? 'true' : 'false'), 'DEBUG', 'video-worker');
    
    return $success;
}

/**
 * Снимает блокировку S3 миграции
 * @param string $attachmentId ID аттачмента
 */
function releaseS3MigrationLock($attachmentId) {
    global $mysqli;
    
    $stmt = $mysqli->prepare("UPDATE tbl_attachments SET s3_migration_started = NULL WHERE id = ?");
    $stmt->bind_param("s", $attachmentId);
    $stmt->execute();
}

// Основная логика - только для HTTP (cron)
plllasmaLog("Воркер запущен (HTTP)", 'INFO', 'video-worker');

// Устанавливаем заголовки для HTTP ответа
header('Content-Type: application/json; charset=UTF-8');

// Проверяем, что запрос идет от cron (можно добавить дополнительную проверку)
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$isCronRequest = strpos($userAgent, 'Wget') !== false || 
                 strpos($userAgent, 'curl') !== false || 
                 strpos($userAgent, 'cron') !== false;

if (!$isCronRequest) {
    http_response_code(403);
    echo json_encode(['error' => 'Доступ запрещен. Только для cron задач.']);
    exit;
}

try {
    $result = runWorker();
    echo json_encode($result);
} catch (Exception $e) {
    plllasmaLog("Критическая ошибка воркера: " . $e->getMessage(), 'ERROR', 'video-worker');
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Критическая ошибка воркера: ' . $e->getMessage()]);
    exit(1);
}
?>
