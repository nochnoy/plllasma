<? // Отмена multipart upload

include("include/main.php");

header('Content-Type: application/json');

loginBySessionOrToken();

$uploadId = @$_POST['uploadId'];

if (!$uploadId) {
    die(json_encode(['success' => false, 'error' => 'Не указан uploadId']));
}

// Проверяем метаданные
$tempDir = getcwd() . '/../temp/multipart/' . $uploadId;
$metadataPath = $tempDir . '/metadata.json';

if (!file_exists($metadataPath)) {
    // Загрузка уже удалена - это ОК
    echo json_encode(['success' => true]);
    exit;
}

$metadata = json_decode(file_get_contents($metadataPath), true);

// Проверяем владельца
if ($metadata['userId'] != $user['id_user']) {
    die(json_encode(['success' => false, 'error' => 'access']));
}

// Удаляем все чанки
$files = glob($tempDir . '/chunk_*');
foreach ($files as $file) {
    @unlink($file);
}

// Удаляем метаданные и папку
@unlink($metadataPath);
@rmdir($tempDir);

echo json_encode(['success' => true]);

?>
