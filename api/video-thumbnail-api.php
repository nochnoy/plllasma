<?php
/**
 * API endpoint для генерации иконок видео
 * Использует библиотеку functions-video.php
 */

// Подключаем библиотеку для работы с видео
require_once 'include/functions-video.php';

// Устанавливаем заголовки
header('Content-Type: application/json; charset=utf-8');

// Получаем параметры
$videoPath = $_GET['video'] ?? '';
$size = $_GET['size'] ?? '160x160';
$timeOffset = (int)($_GET['time'] ?? 1);
$outputDir = $_GET['output_dir'] ?? 'thumbnails';

// Проверяем обязательные параметры
if (empty($videoPath)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Параметр video обязателен'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Проверяем поддержку ffmpeg
$ffmpegCheck = checkFFmpegSupport();
if (!$ffmpegCheck['ffmpeg_available']) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'ffmpeg не доступен на сервере'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Безопасность: проверяем путь к видео
if (strpos($videoPath, '..') !== false && !preg_match('/^\.\.\//', $videoPath)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Небезопасный путь к файлу'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Если путь не абсолютный, делаем его относительно корня проекта
if (!file_exists($videoPath)) {
    $videoPath = '../' . $videoPath;
}

// Создаем иконку
$result = createVideoThumbnail($videoPath, $outputDir, $size, $timeOffset);

// Возвращаем результат
if ($result['success']) {
    http_response_code(200);
} else {
    http_response_code(500);
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
?>
