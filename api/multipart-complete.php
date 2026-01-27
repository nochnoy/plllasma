<? // Завершение multipart upload - собирает файл из чанков

include("include/main.php");

header('Content-Type: application/json');

// Увеличиваем лимит времени для сборки больших файлов
set_time_limit(600);

loginBySessionOrToken();

$uploadId = @$_POST['uploadId'];

if (!$uploadId) {
    die(json_encode(['success' => false, 'error' => 'Не указан uploadId']));
}

// Проверяем метаданные
$tempDir = getcwd() . '/../temp/multipart/' . $uploadId;
$metadataPath = $tempDir . '/metadata.json';

if (!file_exists($metadataPath)) {
    die(json_encode(['success' => false, 'error' => 'Загрузка не найдена']));
}

$metadata = json_decode(file_get_contents($metadataPath), true);

// Проверяем владельца
if ($metadata['userId'] != $user['id_user']) {
    die(json_encode(['success' => false, 'error' => 'access']));
}

// Проверяем статус
if ($metadata['status'] !== 'uploading') {
    die(json_encode(['success' => false, 'error' => 'Загрузка уже завершена или отменена']));
}

// Проверяем, что все чанки загружены
if (count($metadata['uploadedChunks']) !== $metadata['totalChunks']) {
    $missing = $metadata['totalChunks'] - count($metadata['uploadedChunks']);
    die(json_encode(['success' => false, 'error' => "Не все чанки загружены. Не хватает: {$missing}"]));
}

// Генерируем ID аттачмента
$attachmentId = guid();

// Создаём папки
$xx = substr($attachmentId, 0, 2);
$yy = substr($attachmentId, 2, 2);
$attachmentDir = getcwd() . "/../a/{$xx}/{$yy}/";

if (!file_exists($attachmentDir)) {
    mkdir($attachmentDir, 0777, true);
}

// Определяем расширение
$extension = strtolower(pathinfo($metadata['filename'], PATHINFO_EXTENSION));
if (!$extension) {
    $extension = 'bin';
}

$fileName = "{$attachmentId}-1.{$extension}";
$filePath = $attachmentDir . $fileName;

// Собираем файл из чанков
$outputFile = fopen($filePath, 'wb');
if (!$outputFile) {
    die(json_encode(['success' => false, 'error' => 'Не удалось создать файл']));
}

for ($i = 0; $i < $metadata['totalChunks']; $i++) {
    $chunkPath = $tempDir . '/chunk_' . str_pad($i, 5, '0', STR_PAD_LEFT);
    
    if (!file_exists($chunkPath)) {
        fclose($outputFile);
        @unlink($filePath);
        die(json_encode(['success' => false, 'error' => "Чанк {$i} не найден"]));
    }
    
    $chunkData = file_get_contents($chunkPath);
    fwrite($outputFile, $chunkData);
    
    // Удаляем чанк после записи
    @unlink($chunkPath);
}

fclose($outputFile);

// Получаем размер файла
$actualSize = filesize($filePath);

// Определяем тип аттачмента
$mimeType = $metadata['mimeType'];
$mime = explode('/', $mimeType)[0];
$attachmentType = 'file';

if ($mime === 'image') {
    $attachmentType = 'image';
} else if ($mime === 'video') {
    $attachmentType = 'video';
} else {
    // Проверяем по расширению
    $imageExts = ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp'];
    $videoExts = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'rm', 'rmvb', '3gp', 'm4v', 'mpg', 'mpeg'];
    
    if (in_array($extension, $imageExts)) $attachmentType = 'image';
    if (in_array($extension, $videoExts)) $attachmentType = 'video';
}

// Генерируем иконку для изображений
$iconGenerated = false;
if ($attachmentType === 'image') {
    $iconPath = $attachmentDir . "{$attachmentId}-1-i.jpg";
    if (function_exists('generateImageIcon') && generateImageIcon($filePath, $iconPath, 160, 160)) {
        $iconGenerated = true;
    }
}

// Статус зависит от типа
$status = ($attachmentType === 'video') ? 'pending' : 'ready';

// Сохраняем в БД
$iconVersion = $iconGenerated ? 1 : 0;
$previewVersion = 0;
$fileVersion = 1;
$safeFilename = mysqli_real_escape_string($mysqli, $metadata['filename']);
$messageId = intval($metadata['messageId']);

mysqli_query($mysqli, 
    "INSERT INTO tbl_attachments SET ".
    "id='{$attachmentId}', ".
    "id_message={$messageId}, ".
    "type='{$attachmentType}', ".
    "created=NOW(), ".
    "icon={$iconVersion}, ".
    "preview={$previewVersion}, ".
    "file={$fileVersion}, ".
    "filename='{$safeFilename}', ".
    "source=NULL, ".
    "status='{$status}', ".
    "views=0, ".
    "downloads=0, ".
    "size={$actualSize}"
);

// Обновляем JSON сообщения
$result = mysqli_query($mysqli, "SELECT * FROM tbl_attachments WHERE id_message = {$messageId} ORDER BY created");
$attachments = [];
while ($row = mysqli_fetch_assoc($result)) {
    $attachments[] = [
        'id' => $row['id'],
        'type' => $row['type'],
        'created' => $row['created'],
        'icon' => (int)$row['icon'],
        'preview' => (int)$row['preview'],
        'file' => (int)$row['file'],
        'filename' => $row['filename'],
        'source' => $row['source'],
        'status' => $row['status'],
        'views' => (int)$row['views'],
        'downloads' => (int)$row['downloads'],
        'size' => (int)$row['size']
    ];
}

$jsonData = mysqli_real_escape_string($mysqli, json_encode(['j' => $attachments]));
mysqli_query($mysqli, "UPDATE tbl_messages SET json = '{$jsonData}' WHERE id_message = {$messageId}");

// Очищаем временную папку
@unlink($metadataPath);
@rmdir($tempDir);

echo json_encode([
    'success' => true,
    'attachment' => [
        'id' => $attachmentId,
        'type' => $attachmentType,
        'filename' => $metadata['filename'],
        'icon' => $iconVersion,
        'preview' => $previewVersion,
        'file' => $fileVersion,
        'status' => $status,
        'size' => $actualSize
    ]
]);

?>
