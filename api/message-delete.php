<?php
/**
 * REST для полного удаления сообщения
 * Удаляет сообщение, его аттачменты (новая и старая система) и файлы с диска
 */

require_once 'include/main.php';
require_once 'include/functions-attachments.php';
require_once 'include/functions-logging.php';
require_once 'include/s3.php';

header('Content-Type: application/json');

try {
    // Проверяем авторизацию
    loginBySessionOrToken();
    
    $messageId = intval($input['messageId'] ?? 0);
    
    if (!$messageId) {
        throw new Exception('Не указан ID сообщения');
    }
    
    // Получаем информацию о сообщении
    $stmt = $mysqli->prepare('
        SELECT m.*, p.id_place, p.name as place_name
        FROM tbl_messages m
        LEFT JOIN tbl_places p ON m.id_place = p.id_place
        WHERE m.id_message = ?
    ');
    $stmt->bind_param("i", $messageId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if (!$message = $result->fetch_assoc()) {
        throw new Exception('Сообщение не найдено');
    }
    
    // Проверяем права на удаление
    if (!canTrash($message['id_place'])) {
        throw new Exception('Нет прав на удаление сообщения');
    }
    
    plllasmaLog("Начинаем полное удаление сообщения {$messageId} из канала '{$message['place_name']}'", 'INFO', 'message-delete');
    
    // 1. Удаляем аттачменты новой системы (tbl_attachments)
    $attachmentsDeleted = deleteMessageAttachments($messageId);
    plllasmaLog("Удалено аттачментов новой системы: {$attachmentsDeleted}", 'INFO', 'message-delete');
    
    // 2. Удаляем аттачменты старой системы (файлы в папке attachments)
    $oldAttachmentsDeleted = deleteOldMessageAttachments($messageId, $message['id_place']);
    plllasmaLog("Удалено аттачментов старой системы: {$oldAttachmentsDeleted}", 'INFO', 'message-delete');
    
    // 3. Получаем всех детей сообщения для рекурсивного удаления
    $childrenIds = getChildrenMessageIds($messageId, $message['id_first_parent']);
    $allMessageIds = array_merge([$messageId], $childrenIds->childrenIds);
    
    plllasmaLog("Будет удалено сообщений: " . count($allMessageIds) . " (включая детей)", 'INFO', 'message-delete');
    
    // 4. Удаляем все сообщения и их аттачменты
    $deletedMessages = 0;
    foreach ($allMessageIds as $msgId) {
        if (deleteSingleMessage($msgId)) {
            $deletedMessages++;
        }
    }
    
    plllasmaLog("Успешно удалено сообщений: {$deletedMessages}", 'INFO', 'message-delete');

    // 5. Пересчитываем количество детей у родительского сообщения
    if ($message['id_parent'] > 0) {
        updateParentChildrenCount($message['id_parent']);
        plllasmaLog("Обновлено количество детей у родительского сообщения {$message['id_parent']}", 'INFO', 'message-delete');
    }

    echo json_encode([
        'success' => true,
        'deletedMessages' => $deletedMessages,
        'deletedAttachments' => $attachmentsDeleted,
        'deletedOldAttachments' => $oldAttachmentsDeleted
    ]);
    
} catch (Exception $e) {
    plllasmaLog("Ошибка удаления сообщения: " . $e->getMessage(), 'ERROR', 'message-delete');
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

/**
 * Удаляет аттачменты новой системы для сообщения
 */
function deleteMessageAttachments($messageId) {
    global $mysqli;
    
    $deletedCount = 0;
    
    // Получаем все аттачменты сообщения
    $stmt = $mysqli->prepare('SELECT id, type, icon, preview, file, filename, s3 FROM tbl_attachments WHERE id_message = ?');
    $stmt->bind_param("i", $messageId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $s3Errors = [];
    
    while ($attachment = $result->fetch_assoc()) {
        $attachmentId = $attachment['id'];
        
        // Снимаем блокировки воркера, если файл был заблокирован для обработки или миграции
        $lockStmt = $mysqli->prepare('UPDATE tbl_attachments SET processing_started = NULL, s3_migration_started = NULL WHERE id = ?');
        $lockStmt->bind_param("s", $attachmentId);
        $lockStmt->execute();
        
        // Удаляем файлы с диска или из S3
        $deleteResult = deleteAttachmentFiles($attachmentId, $attachment);
        
        if ($deleteResult !== true) {
            $s3Errors[] = $deleteResult;
        }
        
        // Удаляем запись из БД
        $deleteStmt = $mysqli->prepare('DELETE FROM tbl_attachments WHERE id = ?');
        $deleteStmt->bind_param("s", $attachmentId);
        if ($deleteStmt->execute()) {
            $deletedCount++;
        }
    }
    
    // Если были ошибки S3, выбрасываем исключение
    if (!empty($s3Errors)) {
        throw new Exception('Не удалось удалить файлы из S3: ' . implode('; ', $s3Errors));
    }
    
    return $deletedCount;
}

/**
 * Удаляет файлы аттачмента с диска или из S3
 * @return true|string Возвращает true при успехе или строку с ошибкой
 */
function deleteAttachmentFiles($attachmentId, $attachment) {
    $isS3 = isset($attachment['s3']) && intval($attachment['s3']) === 1;
    
    // Если файл в S3 - удаляем из S3
    if ($isS3 && $attachment['file'] > 0) {
        global $S3_key_id, $S3_key;
        
        if (empty($S3_key_id) || empty($S3_key) || $S3_key_id === 'Идентификатор секретного ключа') {
            plllasmaLog("ОШИБКА: S3 ключи не настроены для удаления {$attachmentId}", 'ERROR', 'message-delete');
            return "S3 ключи не настроены для аттачмента {$attachmentId}";
        }
        
        // Настраиваем S3 клиент
        S3::setAuth($S3_key_id, $S3_key);
        S3::setSSL(true);
        S3::$endpoint = 'storage.yandexcloud.net';
        
        $bucket = 'plllasma';
        $objectKey = $attachmentId;
        
        plllasmaLog("Удаляем файл из S3: {$bucket}/{$objectKey}", 'INFO', 'message-delete');
        
        $deleteResult = S3::deleteObject($bucket, $objectKey);
        
        if (!$deleteResult) {
            plllasmaLog("ОШИБКА: Не удалось удалить файл из S3: {$bucket}/{$objectKey}", 'ERROR', 'message-delete');
            return "Не удалось удалить файл {$attachmentId} из S3";
        }
        
        plllasmaLog("Файл успешно удален из S3: {$bucket}/{$objectKey}", 'INFO', 'message-delete');
    } else {
        // Удаляем основной файл с локального диска
        if ($attachment['file'] > 0 && $attachment['filename']) {
            $extension = strtolower(pathinfo($attachment['filename'], PATHINFO_EXTENSION));
            $filePath = "../" . ltrim(getAttachmentPath($attachmentId, $attachment['file'], '', $extension), '/');
            if (file_exists($filePath)) {
                unlink($filePath);
                plllasmaLog("Удален основной файл: {$filePath}", 'INFO', 'message-delete');
            }
        }
    }
    
    // Иконка и превью всегда хранятся локально
    // Удаляем иконку
    if ($attachment['icon'] > 0) {
        $iconPath = "../" . ltrim(getAttachmentPath($attachmentId, $attachment['icon'], 'i', 'jpg'), '/');
        if (file_exists($iconPath)) {
            unlink($iconPath);
            plllasmaLog("Удален файл иконки: {$iconPath}", 'INFO', 'message-delete');
        }
    }
    
    // Удаляем превью
    if ($attachment['preview'] > 0) {
        $previewPath = "../" . ltrim(getAttachmentPath($attachmentId, $attachment['preview'], 'p', 'jpg'), '/');
        if (file_exists($previewPath)) {
            unlink($previewPath);
            plllasmaLog("Удален файл превью: {$previewPath}", 'INFO', 'message-delete');
        }
    }
    
    // Удаляем папку аттачмента, если она пустая
    $xx = substr($attachmentId, 0, 2);
    $yy = substr($attachmentId, 2, 2);
    $attachmentDir = "../a/{$xx}/{$yy}/";
    
    if (is_dir($attachmentDir)) {
        $files = scandir($attachmentDir);
        if (count($files) <= 2) { // Только . и ..
            rmdir($attachmentDir);
            plllasmaLog("Удалена пустая папка аттачмента: {$attachmentDir}", 'INFO', 'message-delete');
        }
    }
    
    return true;
}

/**
 * Удаляет аттачменты старой системы
 */
function deleteOldMessageAttachments($messageId, $placeId) {
    $deletedCount = 0;
    $attachmentsDir = "../attachments/{$placeId}/";
    
    if (!is_dir($attachmentsDir)) {
        return 0;
    }
    
    // Ищем файлы старой системы (формат: messageId_index.ext)
    $pattern = $attachmentsDir . $messageId . '_*';
    $files = glob($pattern);
    
    foreach ($files as $file) {
        if (unlink($file)) {
            $deletedCount++;
            plllasmaLog("Удален файл старой системы: {$file}", 'INFO', 'message-delete');
        }
    }
    
    // Удаляем тумбнейлы (формат: messageId_indext.jpg)
    $thumbPattern = $attachmentsDir . $messageId . '_*t.jpg';
    $thumbFiles = glob($thumbPattern);
    
    foreach ($thumbFiles as $file) {
        if (unlink($file)) {
            $deletedCount++;
            plllasmaLog("Удален тумбнейл старой системы: {$file}", 'INFO', 'message-delete');
        }
    }
    
    return $deletedCount;
}

/**
 * Удаляет одно сообщение из БД
 */
function deleteSingleMessage($messageId) {
    global $mysqli;
    
    $stmt = $mysqli->prepare('DELETE FROM tbl_messages WHERE id_message = ?');
    $stmt->bind_param("i", $messageId);
    
    return $stmt->execute();
}

/**
 * Получает ID всех дочерних сообщений
 */
function getChildrenMessageIds($messageId, $firstParentId) {
    global $mysqli;
    
    $childrenIds = [];
    
    // Если это firstParent, ищем всех детей
    if ($firstParentId == $messageId) {
        $stmt = $mysqli->prepare('
            SELECT id_message 
            FROM tbl_messages 
            WHERE id_first_parent = ? AND id_message != ?
        ');
        $stmt->bind_param("ii", $messageId, $messageId);
    } else {
        // Ищем только прямых детей
        $stmt = $mysqli->prepare('
            SELECT id_message 
            FROM tbl_messages 
            WHERE id_parent = ?
        ');
        $stmt->bind_param("i", $messageId);
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    
    while ($row = $result->fetch_assoc()) {
        $childrenIds[] = $row['id_message'];
    }
    
    return (object)['childrenIds' => $childrenIds];
}

/**
 * Обновляет количество детей у родительского сообщения
 */
function updateParentChildrenCount($parentId) {
    global $mysqli;
    
    $stmt = $mysqli->prepare('
        UPDATE tbl_messages
        SET children = (
            SELECT COUNT(id_message) 
            FROM tbl_messages 
            WHERE id_parent = ?
        )
        WHERE id_message = ?
    ');
    $stmt->bind_param("ii", $parentId, $parentId);
    $stmt->execute();
}

?>
