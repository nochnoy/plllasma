<? // REST для получения информации об аттачменте
include("include/main.php");
require_once 'include/functions-logging.php';

// Проверяем авторизацию
loginBySessionOrToken();

$attachmentId = @$_GET['id'];
if (empty($attachmentId)) { 
    logApi("Ошибка: не указан ID аттачмента", 'ERROR');
    exit(json_encode((object)['error' => 'missing_id', 'success' => false])); 
}

logApi("Запрос аттачмента: {$attachmentId} от пользователя {$user['id_user']}");

$attachment = getAttachmentById($attachmentId);
if (!$attachment) { 
    logApi("Аттачмент не найден в БД: {$attachmentId}", 'ERROR');
    exit(json_encode((object)['error' => 'attachment_not_found', 'success' => false])); 
}

logApi("Аттачмент найден в БД: {$attachmentId}, message_id: {$attachment['id_message']}");

// Проверяем права доступа к сообщению
$sql = $mysqli->prepare('SELECT id_place FROM tbl_messages WHERE id_message = ? LIMIT 1');
$sql->bind_param("i", $attachment['id_message']);
$sql->execute();
$result = $sql->get_result();
$message = mysqli_fetch_assoc($result);

if (!$message) {
    logApi("Сообщение не найдено для аттачмента: {$attachmentId}, message_id: {$attachment['id_message']}", 'ERROR');
    exit(json_encode((object)['error' => 'message_not_found', 'success' => false])); 
}

logApi("Сообщение найдено: place_id: {$message['id_place']}");

if (!canRead($message['id_place'])) { 
    logApi("Доступ запрещен к каналу {$message['id_place']} для пользователя {$user['id_user']} (аттачмент: {$attachmentId})", 'ERROR');
    exit(json_encode((object)['error' => 'access_denied', 'success' => false])); 
}

logApi("Аттачмент успешно получен: {$attachmentId}");
exit(json_encode((object)['success' => true, 'attachment' => $attachment]));
?>
