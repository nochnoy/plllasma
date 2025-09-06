<?php
/**
 * API endpoint для конвертации видео в WebM формат
 * Использует библиотеку functions-video.php
 */

// Подключаем библиотеку для работы с видео
require_once 'include/functions-video.php';

// Устанавливаем заголовки
header('Content-Type: application/json; charset=utf-8');

// Получаем параметры
$videoPath = $_GET['video'] ?? '';
$codec = $_GET['codec'] ?? 'h264'; // h264 или webm
$quality = $_GET['quality'] ?? 'medium';
$maxWidth = (int)($_GET['max_width'] ?? 1280);
$maxHeight = (int)($_GET['max_height'] ?? 720);
$audioBitrate = (int)($_GET['audio_bitrate'] ?? 96);
$removeAudio = isset($_GET['remove_audio']) && $_GET['remove_audio'] === '1';
$detectBlackBars = isset($_GET['detect_black_bars']) && $_GET['detect_black_bars'] === '1';
$fps = $_GET['fps'] ?? 'auto';
$outputDir = $_GET['output_dir'] ?? 'converted';

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

// Создаем выходную директорию
if (!is_dir($outputDir)) {
    if (!mkdir($outputDir, 0755, true)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => "Не удалось создать директорию: $outputDir"
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// Создаем имя для выходного файла
$videoName = pathinfo($videoPath, PATHINFO_FILENAME);
$extension = $codec === 'h264' ? 'mp4' : 'webm';
$outputPath = rtrim($outputDir, '/') . "/converted_{$videoName}_{$quality}.{$extension}";

// Настройки конвертации
$options = [
    'quality' => $quality,
    'max_width' => $maxWidth,
    'max_height' => $maxHeight,
    'audio_bitrate' => $audioBitrate,
    'remove_audio' => $removeAudio,
    'detect_black_bars' => $detectBlackBars,
    'fps' => $fps
];

// Выполняем конвертацию
if ($codec === 'h264') {
    $result = convertToH264($videoPath, $outputPath, $options);
} else {
    $result = convertToWebM($videoPath, $outputPath, $options);
}

// Возвращаем результат
if ($result['success']) {
    http_response_code(200);
} else {
    http_response_code(500);
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
?>
