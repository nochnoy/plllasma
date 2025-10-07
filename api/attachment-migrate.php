<?php
// API для миграции старых аттачментов сообщения в новую систему

require_once 'include/main.php';
require_once 'include/functions-logging.php';
require_once 'include/functions-video.php';

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

// Выполняем миграцию
$result = migrateMessageAttachments($messageId);

exit(json_encode($result));

?>

