<?
include("include/main.php");

// Этот эндпоинт перенаправляет на S3 URL файла, если у аттачмента s3 = 1

// Переопределяем заголовок, т.к. main.php ставит application/json
header('Content-Type: text/plain; charset=UTF-8');

// Авторизация пользователя
loginBySessionOrToken();

$attachmentId = @$_GET['id'];
if (empty($attachmentId)) {
    http_response_code(400);
    echo 'missing_id';
    exit;
}

// Получаем аттачмент
$attachment = getAttachmentById($attachmentId);
if (!$attachment) {
    http_response_code(404);
    echo 'attachment_not_found';
    exit;
}

// Проверяем канал сообщения
$sql = $mysqli->prepare('SELECT id_place FROM tbl_messages WHERE id_message = ? LIMIT 1');
$sql->bind_param("i", $attachment['id_message']);
$sql->execute();
$result = $sql->get_result();
$message = mysqli_fetch_assoc($result);

if (!$message) {
    http_response_code(404);
    echo 'message_not_found';
    exit;
}

if (!canRead($message['id_place'])) {
    http_response_code(403);
    echo 'access_denied';
    exit;
}

// Проверяем, что файл хранится в S3 и доступен
if (empty($attachment['s3']) || intval($attachment['s3']) !== 1) {
    http_response_code(400);
    echo 'not_in_s3';
    exit;
}

if (empty($attachment['file']) || intval($attachment['file']) <= 0 || empty($attachment['filename'])) {
    http_response_code(404);
    echo 'file_not_ready';
    exit;
}

// Строим ключ объекта - просто ID аттачмента без слешей и расширений
$objectKey = $attachmentId;

// Имя бакета
$bucket = 'plllasma';

// Подключаем S3 класс
require_once 'include/s3.php';

// Проверяем наличие S3 ключей
global $S3_key_id, $S3_key;
if (empty($S3_key_id) || empty($S3_key) || $S3_key_id === 'Идентификатор секретного ключа') {
    http_response_code(500);
    echo 's3_not_configured';
    exit;
}

// Настраиваем S3 клиент для Yandex Cloud
S3::setAuth($S3_key_id, $S3_key);
S3::setSSL(true);
S3::$endpoint = 'storage.yandexcloud.net';

// Генерируем преподписанный URL (действителен 1 час)
$lifetime = 3600; // 1 час
$s3Url = S3::getAuthenticatedURL($bucket, $objectKey, $lifetime, false, true);

if (!$s3Url) {
    http_response_code(500);
    echo 'failed_to_generate_url';
    exit;
}

// Делаем временный редирект на преподписанный URL
header('Cache-Control: private, max-age=0');
header('Location: ' . $s3Url, true, 302);
exit;
?>

