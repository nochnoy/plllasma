<?php
// API для миграции аттачментов сообщения в S3 хранилище

require_once 'include/main.php';
require_once 'include/functions-logging.php';
require_once 'include/functions-attachments.php';
require_once 'include/s3.php';

header('Content-Type: application/json');

loginBySessionOrToken();

$messageId = intval($input['messageId'] ?? 0);

if ($messageId <= 0) {
    exit(json_encode([
        'success' => false,
        'error' => 'Invalid message ID'
    ]));
}

// Проверяем права доступа к сообщению
$sql = $mysqli->prepare('SELECT id_place FROM tbl_messages WHERE id_message = ?');
$sql->bind_param("i", $messageId);
$sql->execute();
$result = $sql->get_result();

if (!$result || $result->num_rows === 0) {
    exit(json_encode([
        'success' => false,
        'error' => 'Message not found'
    ]));
}

$row = $result->fetch_assoc();
$placeId = $row['id_place'];

// Проверяем, может ли пользователь писать в этот канал (право на модификацию)
if (!canWrite($placeId)) {
    exit(json_encode([
        'success' => false,
        'error' => 'Access denied'
    ]));
}

// Выполняем миграцию в S3
$result = migrateAttachmentsToS3($messageId);

exit(json_encode($result));

/**
 * Мигрирует аттачменты сообщения в S3 хранилище
 */
function migrateAttachmentsToS3($messageId) {
    global $mysqli, $S3_key_id, $S3_key;
    
    logInfo("Starting S3 migration for message $messageId", 's3-migration');
    
    // Получаем все аттачменты сообщения, которые еще не в S3
    $sql = $mysqli->prepare('
        SELECT id, filename, file, type 
        FROM tbl_attachments 
        WHERE id_message = ? AND s3 = 0 AND file > 0 AND filename IS NOT NULL
    ');
    $sql->bind_param("i", $messageId);
    $sql->execute();
    $result = $sql->get_result();
    
    $attachments = [];
    while ($row = $result->fetch_assoc()) {
        $attachments[] = $row;
    }
    
    if (empty($attachments)) {
        logInfo("No attachments to migrate for message $messageId", 's3-migration');
        return [
            'success' => true,
            'message' => 'No attachments to migrate',
            'processed' => 0,
            'success_count' => 0,
            'failed_count' => 0
        ];
    }
    
    logInfo("Found " . count($attachments) . " attachments to migrate for message $messageId", 's3-migration');
    
    // Проверяем наличие S3 ключей
    if (empty($S3_key_id) || empty($S3_key) || $S3_key_id === 'Идентификатор секретного ключа') {
        logError("S3 keys not configured", 's3-migration');
        return [
            'success' => false,
            'error' => 'S3 keys not configured',
            'processed' => 0,
            'success_count' => 0,
            'failed_count' => 0
        ];
    }
    
    // Настраиваем S3 клиент
    S3::setAuth($S3_key_id, $S3_key);
    S3::setSSL(true);
    
    // Создаем экземпляр S3 с правильным endpoint для Yandex Cloud
    $s3 = new S3($S3_key_id, $S3_key, true, 'storage.yandexcloud.net');
    
    $bucketName = 'plllasma';
    $successCount = 0;
    $failedCount = 0;
    $migratedAttachmentIds = [];
    
    foreach ($attachments as $attachment) {
        $attachmentId = $attachment['id'];
        $filename = $attachment['filename'];
        $fileVersion = $attachment['file'];
        $type = $attachment['type'];
        
        logInfo("Processing attachment $attachmentId (type: $type, file: $filename)", 's3-migration');
        
        // Строим путь к локальному файлу
        $localFilePath = buildAttachmentFilePhysicalPath($attachmentId, $fileVersion, $filename);
        
        if (!$localFilePath || !file_exists($localFilePath)) {
            logError("Local file not found for attachment $attachmentId: $localFilePath", 's3-migration');
            $failedCount++;
            continue;
        }
        
        // Определяем MIME тип
        $mimeType = mime_content_type($localFilePath);
        if (!$mimeType) {
            $mimeType = 'application/octet-stream';
        }
        
        // Ключ объекта в S3 = ID аттачмента
        $objectKey = $attachmentId;
        
        try {
            // Загружаем файл в S3
            $uploadResult = S3::putObjectFile(
                $localFilePath,
                $bucketName,
                $objectKey,
                S3::ACL_PRIVATE,
                array(),
                array('Content-Type' => $mimeType)
            );
            
            if ($uploadResult) {
                // Обновляем поле s3 = 1 в БД
                $updateSql = $mysqli->prepare('UPDATE tbl_attachments SET s3 = 1 WHERE id = ?');
                $updateSql->bind_param("s", $attachmentId);
                
                if ($updateSql->execute()) {
                    logInfo("Successfully migrated attachment $attachmentId to S3", 's3-migration');
                    $successCount++;
                    $migratedAttachmentIds[] = $attachmentId;
                } else {
                    logError("Failed to update s3 flag for attachment $attachmentId: " . $mysqli->error, 's3-migration');
                    $failedCount++;
                }
            } else {
                logError("Failed to upload attachment $attachmentId to S3", 's3-migration');
                $failedCount++;
            }
            
        } catch (Exception $e) {
            logError("Exception during S3 upload for attachment $attachmentId: " . $e->getMessage(), 's3-migration');
            $failedCount++;
        }
    }
    
    // Обновляем JSON сообщения с мигрированными аттачментами
    if (!empty($migratedAttachmentIds)) {
        logInfo("Updating message JSON with migrated attachments", 's3-migration');
        
        // Получаем все аттачменты сообщения для обновления JSON
        $allAttachments = getMessageAttachments($messageId);
        if (!empty($allAttachments)) {
            updateMessageJson($messageId, $allAttachments);
        }
    }
    
    $totalProcessed = $successCount + $failedCount;
    
    logInfo("S3 migration completed for message $messageId: processed=$totalProcessed, success=$successCount, failed=$failedCount", 's3-migration');
    
    return [
        'success' => true,
        'message' => 'Migration completed',
        'processed' => $totalProcessed,
        'success_count' => $successCount,
        'failed_count' => $failedCount
    ];
}

?>


