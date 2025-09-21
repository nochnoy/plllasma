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
        plllasmaLog("Всего видео: {$diagnostics['total_videos']}, готовых: {$diagnostics['ready_videos']}, с файлом: {$diagnostics['videos_with_file']}, без иконки: {$diagnostics['videos_without_icon']}, без превью: {$diagnostics['videos_without_preview']}, в обработке: {$diagnostics['videos_processing']}, неуспешных: {$diagnostics['videos_failed']}", 'INFO', 'video-worker');
        
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
        
        // Проверяем, есть ли файлы для обработки
        $availableCount = getAvailableFilesCount();
        
        if ($availableCount === 0) {
            plllasmaLog("Нет файлов для обработки", 'INFO', 'video-worker');
            return ['status' => 'success', 'message' => 'Нет файлов для обработки'];
        }
        
        plllasmaLog("Доступно файлов для обработки: {$availableCount}", 'INFO', 'video-worker');
        
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
 */
function isWorkerRunning() {
    global $mysqli;
    
    // Ищем файлы, которые обрабатываются сейчас
    $stmt = $mysqli->prepare("
        SELECT COUNT(*) as count 
        FROM tbl_attachments 
        WHERE processing_started IS NOT NULL 
        AND processing_started > DATE_SUB(NOW(), INTERVAL ? SECOND)
    ");
    
    $maxTime = MAX_PROCESSING_TIME;
    $stmt->bind_param("i", $maxTime);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    return $row['count'] > 0;
}

/**
 * Получает количество доступных файлов для обработки
 */
function getAvailableFilesCount() {
    global $mysqli;
    
    $stmt = $mysqli->prepare("
        SELECT COUNT(*) as count 
        FROM tbl_attachments 
        WHERE type = 'video' 
        AND status = 'ready' 
        AND file IS NOT NULL
        AND (icon = 0 OR preview = 0)
        AND (processing_started IS NULL OR processing_started < DATE_SUB(NOW(), INTERVAL ? SECOND))
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
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND (icon = 0) AND status != 'processing_failed'");
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $diagnostics['videos_without_icon'] = $row['count'];
    
    // Видео без превью
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND (preview = 0) AND status != 'processing_failed'");
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
    
    // Видео с неуспешной обработкой
    $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_attachments WHERE type = 'video' AND status = 'processing_failed'");
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
        $xx = substr($row['id'], 0, 2);
        $yy = substr($row['id'], 2, 2);
        
        // Строим путь к файлу
        if ($row['filename'] && $row['file'] > 0) {
            $extension = strtolower(pathinfo($row['filename'], PATHINFO_EXTENSION));
            $filePath = "../attachments-new/{$xx}/{$yy}/{$row['id']}-{$row['file']}.{$extension}";
        } else {
            $filePath = null;
        }
        
        $iconPath = $row['icon'] > 0 ? "../attachments-new/{$xx}/{$yy}/{$row['id']}-{$row['icon']}-i.jpg" : null;
        $previewPath = $row['preview'] > 0 ? "../attachments-new/{$xx}/{$yy}/{$row['id']}-{$row['preview']}-p.jpg" : null;
        
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
        if ($row['status'] === 'processing_failed') {
            $reasons[] = "processing_failed";
        } elseif ($row['status'] !== 'ready') {
            $reasons[] = "status_not_ready:{$row['status']}";
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
    $stmt = $mysqli->prepare("
        UPDATE tbl_attachments 
        SET processing_started = NOW() 
        WHERE id = (
            SELECT id FROM (
                SELECT id FROM tbl_attachments 
                WHERE type = 'video' 
                AND status = 'ready' 
                AND file IS NOT NULL
                AND (icon = 0 OR preview = 0)
                AND (processing_started IS NULL OR processing_started < DATE_SUB(NOW(), INTERVAL ? SECOND))
                ORDER BY created DESC 
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
        SELECT a.*, m.id_place 
        FROM tbl_attachments a
        JOIN tbl_messages m ON a.id_message = m.id_message
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
    
    plllasmaLog("=== НАЧИНАЕМ ОБРАБОТКУ АТТАЧМЕНТА ===", 'INFO', 'video-worker');
    plllasmaLog("ID: {$attachmentId}, файл версия: {$fileVersion}, имя файла: {$filename}, статус: {$attachment['status']}, создан: {$attachment['created']}", 'INFO', 'video-worker');
    
    // Составляем путь к файлу используя новую схему версионирования
    $xx = substr($attachmentId, 0, 2);
    $yy = substr($attachmentId, 2, 2);
    
    if (!$filename) {
        plllasmaLog("ОШИБКА: Отсутствует имя файла для аттачмента {$attachmentId}", 'ERROR', 'video-worker');
        return false;
    }
    
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $filePath = "../attachments-new/{$xx}/{$yy}/{$attachmentId}-{$fileVersion}.{$extension}";
    
    // Проверяем, существует ли файл
    plllasmaLog("Проверяем существование файла: {$filePath}", 'INFO', 'video-worker');
    if (!file_exists($filePath)) {
        plllasmaLog("ОШИБКА: Файл не найден: {$filePath}", 'ERROR', 'video-worker');
        plllasmaLog("Директория существует: " . (is_dir(dirname($filePath)) ? 'да' : 'нет'), 'INFO', 'video-worker');
        plllasmaLog("Содержимое директории: " . (is_dir(dirname($filePath)) ? implode(', ', scandir(dirname($filePath))) : 'N/A'), 'INFO', 'video-worker');
        return false;
    }
    
    $fileSize = filesize($filePath);
    plllasmaLog("Файл найден, размер: {$fileSize} байт", 'INFO', 'video-worker');
    
    // Определяем MIME тип
    $mimeType = mime_content_type($filePath);
    
    // Проверяем, является ли файл видео
    if (!isVideoFile($filePath, $mimeType)) {
        plllasmaLog("Файл {$attachmentId} не является видео ({$mimeType})", 'INFO', 'video-worker');
        return false;
    }
    
    plllasmaLog("Обнаружено видео: {$attachmentId} ({$mimeType})", 'INFO', 'video-worker');
    
    // Определяем, нужно ли генерировать иконку
    $needIcon = $attachment['icon'] == 0;
    $iconVersion = $attachment['icon'];
    
    if ($needIcon) {
        // Генерируем иконку для видео (используем версию 1 для новой иконки)
        $iconVersion = max(1, $attachment['icon'] + 1);
        $iconPath = "../attachments-new/{$xx}/{$yy}/{$attachmentId}-{$iconVersion}-i.jpg";
        plllasmaLog("Генерируем иконку: {$filePath} -> {$iconPath}", 'INFO', 'video-worker');
        $iconGenerated = generateVideoIcon($filePath, $iconPath, 160, 160);
        
        if (!$iconGenerated) {
            plllasmaLog("Не удалось сгенерировать иконку для {$attachmentId}, помечаем как неуспешную обработку", 'WARNING', 'video-worker');
            
            // Устанавливаем статус неуспешной обработки
            $stmt = $mysqli->prepare("UPDATE tbl_attachments SET status = 'processing_failed' WHERE id = ?");
            $stmt->bind_param("s", $attachmentId);
            $stmt->execute();
            
            plllasmaLog("Аттачмент {$attachmentId} помечен как неуспешная обработка", 'INFO', 'video-worker');
            return false;
        }
        
        // Проверяем, что файл иконки действительно создался
        if (file_exists($iconPath)) {
            $iconSize = filesize($iconPath);
            plllasmaLog("Иконка создана успешно: {$iconPath}, размер: {$iconSize} байт", 'INFO', 'video-worker');
        } else {
            plllasmaLog("Файл иконки не найден после генерации: {$iconPath}", 'ERROR', 'video-worker');
            return false;
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
        $previewPath = "../attachments-new/{$xx}/{$yy}/{$attachmentId}-{$previewVersion}-p.jpg";
        plllasmaLog("Генерируем превью: {$filePath} -> {$previewPath}", 'INFO', 'video-worker');
        $previewGenerated = generateVideoPreview($filePath, $previewPath, 600, 100, 100, 5);
        
        if (!$previewGenerated) {
            plllasmaLog("Не удалось сгенерировать превью для {$attachmentId}, но продолжаем", 'WARNING', 'video-worker');
            $previewVersion = 0; // Сбрасываем версию превью, если не удалось создать
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
        plllasmaLog("Обновляем БД: icon версия = {$iconVersion}, preview версия = {$previewVersion} для аттачмента {$attachmentId}", 'INFO', 'video-worker');
        
        $stmt = $mysqli->prepare("
            UPDATE tbl_attachments 
            SET icon = ?, preview = ? 
            WHERE id = ?
        ");
        $stmt->bind_param("iis", $iconVersion, $previewVersion, $attachmentId);
        $result = $stmt->execute();
    } else {
        plllasmaLog("Иконка и превью уже существуют, обновление БД не требуется", 'INFO', 'video-worker');
        $result = true; // Считаем успешным, если ничего не нужно было делать
    }
    
    if (!$result) {
        plllasmaLog("Ошибка выполнения UPDATE для аттачмента {$attachmentId}: " . $mysqli->error, 'ERROR', 'video-worker');
        return false;
    }
    
    $affectedRows = $mysqli->affected_rows;
    plllasmaLog("БД обновлена: затронуто строк: {$affectedRows}", 'INFO', 'video-worker');
    
    // Обновляем JSON в сообщении
    plllasmaLog("Обновляем JSON для сообщения {$attachment['id_message']}", 'INFO', 'video-worker');
    updateMessageAttachmentsJson($attachment['id_message']);
    plllasmaLog("JSON обновлен для сообщения {$attachment['id_message']}", 'INFO', 'video-worker');
    
    plllasmaLog("Аттачмент {$attachmentId} успешно преобразован в видео", 'INFO', 'video-worker');
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
    $jsonData = json_encode(['newAttachments' => $newAttachments]);
    $stmt = $mysqli->prepare("UPDATE tbl_messages SET json = ? WHERE id_message = ?");
    $stmt->bind_param("si", $jsonData, $messageId);
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
