<? // Загрузка одного чанка multipart upload

include("include/main.php");

header('Content-Type: application/json');

loginBySessionOrToken();

$uploadId = @$_POST['uploadId'];
$chunkIndex = isset($_POST['chunkIndex']) ? intval($_POST['chunkIndex']) : -1;

if (!$uploadId || $chunkIndex < 0) {
    die(json_encode(['success' => false, 'error' => 'Не указаны обязательные параметры']));
}

// Проверяем наличие файла чанка
if (!isset($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
    die(json_encode(['success' => false, 'error' => 'Чанк не загружен']));
}

// Проверяем метаданные загрузки
$tempDir = getcwd() . '/../temp/multipart/' . $uploadId;
$metadataPath = $tempDir . '/metadata.json';

if (!file_exists($metadataPath)) {
    die(json_encode(['success' => false, 'error' => 'Загрузка не найдена']));
}

$metadata = json_decode(file_get_contents($metadataPath), true);

// Проверяем, что загрузка принадлежит текущему пользователю
if ($metadata['userId'] != $user['id_user']) {
    die(json_encode(['success' => false, 'error' => 'access']));
}

// Проверяем статус
if ($metadata['status'] !== 'uploading') {
    die(json_encode(['success' => false, 'error' => 'Загрузка уже завершена или отменена']));
}

// Проверяем индекс чанка
if ($chunkIndex >= $metadata['totalChunks']) {
    die(json_encode(['success' => false, 'error' => 'Неверный индекс чанка']));
}

// Сохраняем чанк
$chunkPath = $tempDir . '/chunk_' . str_pad($chunkIndex, 5, '0', STR_PAD_LEFT);

if (!move_uploaded_file($_FILES['chunk']['tmp_name'], $chunkPath)) {
    die(json_encode(['success' => false, 'error' => 'Ошибка сохранения чанка']));
}

// Обновляем метаданные
if (!in_array($chunkIndex, $metadata['uploadedChunks'])) {
    $metadata['uploadedChunks'][] = $chunkIndex;
    sort($metadata['uploadedChunks']);
}

file_put_contents($metadataPath, json_encode($metadata));

$uploadedCount = count($metadata['uploadedChunks']);
$totalChunks = $metadata['totalChunks'];

echo json_encode([
    'success' => true,
    'chunkIndex' => $chunkIndex,
    'uploadedChunks' => $uploadedCount,
    'totalChunks' => $totalChunks
]);

?>
