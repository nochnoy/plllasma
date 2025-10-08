<? // REST для получения информации об аттачменте
include("include/main.php");

// Проверяем авторизацию
loginBySessionOrToken();

$attachmentId = @$_GET['id'];
if (empty($attachmentId)) { 
    exit(json_encode((object)['error' => 'missing_id', 'success' => false])); 
}

$attachment = getAttachmentById($attachmentId);
if (!$attachment) { 
    exit(json_encode((object)['error' => 'attachment_not_found', 'success' => false])); 
}

// Проверяем права доступа к сообщению
$sql = $mysqli->prepare('SELECT id_place FROM tbl_messages WHERE id_message = ? LIMIT 1');
$sql->bind_param("i", $attachment['id_message']);
$sql->execute();
$result = $sql->get_result();
$message = mysqli_fetch_assoc($result);

if (!$message) {
    exit(json_encode((object)['error' => 'message_not_found', 'success' => false])); 
}

if (!canRead($message['id_place'])) { 
    exit(json_encode((object)['error' => 'access_denied', 'success' => false])); 
}

exit(json_encode((object)['success' => true, 'attachment' => $attachment]));
?>
