<?php
// API для миграции одного аттачмента в S3 хранилище

require_once 'include/main.php';
require_once 'include/functions-logging.php';
require_once 'include/functions-attachments.php';

header('Content-Type: application/json');

loginBySessionOrToken();

$attachmentId = $input['attachmentId'] ?? '';
if (empty($attachmentId)) {
    exit(json_encode([
        'success' => false,
        'error' => 'Invalid attachment ID'
    ]));
}

$result = migrateAttachmentToS3($attachmentId);
exit(json_encode($result));
?>


