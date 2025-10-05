<?php
/**
 * REST для полного удаления сообщения
 * Удаляет сообщение, его аттачменты (новая и старая система) и файлы с диска
 */

require_once 'include/main.php';
require_once 'include/functions-attachments.php';
require_once 'include/functions-logging.php';

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
    $stmt = $mysqli->prepare('SELECT id, type, icon, preview, file, filename FROM tbl_attachments WHERE id_message = ?');
    $stmt->bind_param("i", $messageId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    while ($attachment = $result->fetch_assoc()) {
        $attachmentId = $attachment['id'];
        
        // Удаляем файлы с диска
        deleteAttachmentFiles($attachmentId, $attachment);
        
        // Удаляем запись из БД
        $deleteStmt = $mysqli->prepare('DELETE FROM tbl_attachments WHERE id = ?');
        $deleteStmt->bind_param("s", $attachmentId);
        if ($deleteStmt->execute()) {
            $deletedCount++;
        }
    }
    
    return $deletedCount;
}

/**
 * Удаляет файлы аттачмента с диска
 */
function deleteAttachmentFiles($attachmentId, $attachment) {
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
    
    // Удаляем основной файл
    if ($attachment['file'] > 0 && $attachment['filename']) {
        $extension = strtolower(pathinfo($attachment['filename'], PATHINFO_EXTENSION));
        $filePath = "../" . ltrim(getAttachmentPath($attachmentId, $attachment['file'], '', $extension), '/');
        if (file_exists($filePath)) {
            unlink($filePath);
            plllasmaLog("Удален основной файл: {$filePath}", 'INFO', 'message-delete');
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

?>
