<?php
require_once 'include/main.php';

header('Content-Type: application/json');

try {
    // Проверяем авторизацию
    loginBySessionOrToken();
    
    // Получаем ID аттачмента из GET или POST запроса
    $input = json_decode(file_get_contents('php://input'), true);
    $attachmentId = $_GET['id'] ?? $input['id'] ?? $_POST['id'] ?? null;
    
    if (!$attachmentId) {
        throw new Exception('ID аттачмента не указан');
    }
    
    // Валидируем ID аттачмента (должен быть GUID)
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $attachmentId)) {
        throw new Exception('Неверный формат ID аттачмента');
    }
    
    // Проверяем права доступа к аттачменту
    $stmt = $mysqli->prepare("SELECT id_message FROM tbl_attachments WHERE id = ? LIMIT 1");
    $stmt->bind_param("s", $attachmentId);
    $stmt->execute();
    $result = $stmt->get_result();
    $attachment = mysqli_fetch_assoc($result);
    
    if (!$attachment) {
        die('{"error": "attachment_not_found"}');
    }
    
    // Получаем канал сообщения
    $stmt = $mysqli->prepare("SELECT id_place FROM tbl_messages WHERE id_message = ? LIMIT 1");
    $stmt->bind_param("i", $attachment['id_message']);
    $stmt->execute();
    $result = $stmt->get_result();
    $message = mysqli_fetch_assoc($result);
    
    if (!$message || !canRead($message['id_place'])) {
        die('{"error": "access"}');
    }
    
    // Инкрементируем счётчик скачиваний
    $stmt = $mysqli->prepare("UPDATE tbl_attachments SET downloads = downloads + 1 WHERE id = ?");
    $stmt->bind_param("s", $attachmentId);
    $result = $stmt->execute();
    
    if (!$result) {
        throw new Exception('Ошибка обновления счётчика скачиваний');
    }
    
    // Возвращаем успешный ответ
    echo json_encode([
        'success' => true,
        'message' => 'Счётчик скачиваний обновлён'
    ]);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
