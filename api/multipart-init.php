<? // Инициализация multipart upload

include("include/main.php");

header('Content-Type: application/json');

loginBySessionOrToken();

$placeId = @$_POST['placeId'];
$messageId = @$_POST['messageId'];
$filename = @$_POST['filename'];
$filesize = intval(@$_POST['filesize']);
$totalChunks = intval(@$_POST['totalChunks']);
$mimeType = @$_POST['mimeType'] ?: 'application/octet-stream';

if (!$placeId || !$messageId || !$filename || !$filesize || !$totalChunks) {
    die(json_encode(['success' => false, 'error' => 'Не указаны обязательные параметры']));
}

if (!canWrite($placeId)) {
    die(json_encode(['success' => false, 'error' => 'access']));
}

// Проверяем, что сообщение принадлежит пользователю
$result = mysqli_query($mysqli, 
    'SELECT id_message FROM tbl_messages WHERE id_message='.$messageId.' AND id_user='.$user['id_user'].' AND id_place='.$placeId
);
if (!mysqli_fetch_assoc($result)) {
    die(json_encode(['success' => false, 'error' => 'access']));
}

// Проверяем размер файла
if ($filesize > ATTACHMENT_MAX_WEIGHT_MB * 1024 * 1024) {
    die(json_encode(['success' => false, 'error' => 'Файл слишком большой']));
}

// Генерируем уникальный ID загрузки
$uploadId = guid();

// Создаём временную папку для чанков (внутри проекта)
$tempBaseDir = getcwd() . '/../temp/multipart';
if (!file_exists($tempBaseDir)) {
    mkdir($tempBaseDir, 0777, true);
}
$tempDir = $tempBaseDir . '/' . $uploadId;
if (!file_exists($tempDir)) {
    mkdir($tempDir, 0777, true);
}

// Сохраняем метаданные загрузки
$metadata = [
    'uploadId' => $uploadId,
    'placeId' => $placeId,
    'messageId' => $messageId,
    'userId' => $user['id_user'],
    'filename' => $filename,
    'filesize' => $filesize,
    'mimeType' => $mimeType,
    'totalChunks' => $totalChunks,
    'uploadedChunks' => [],
    'createdAt' => time(),
    'status' => 'uploading'
];

file_put_contents($tempDir . '/metadata.json', json_encode($metadata));

echo json_encode([
    'success' => true,
    'uploadId' => $uploadId
]);

?>
