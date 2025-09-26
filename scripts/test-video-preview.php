<?php
/**
 * Тестовый скрипт для проверки генерации превью видео
 * Проверяет новую логику с прозрачным фоном и gap
 */

require_once '../api/include/main.php';
require_once '../api/include/functions-video.php';
require_once '../api/include/functions-logging.php';

// Тестовые параметры
$testVideoPath = '../attachments/test_video.mp4'; // Путь к тестовому видео
$testPreviewPath = '../attachments/test_preview.jpg'; // Путь для сохранения превью

echo "=== ТЕСТ ГЕНЕРАЦИИ ПРЕВЬЮ ВИДЕО ===\n";

// Проверяем, существует ли тестовое видео
if (!file_exists($testVideoPath)) {
    echo "ОШИБКА: Тестовое видео не найдено: {$testVideoPath}\n";
    echo "Поместите тестовое видео в папку attachments/ с именем test_video.mp4\n";
    exit(1);
}

echo "Тестовое видео найдено: {$testVideoPath}\n";
echo "Размер видео: " . filesize($testVideoPath) . " байт\n";

// Проверяем доступность ffmpeg
if (!isFFmpegAvailable()) {
    echo "ОШИБКА: FFmpeg недоступен\n";
    exit(1);
}

echo "FFmpeg доступен\n";

// Генерируем превью с новыми параметрами
echo "Генерируем превью с новыми параметрами...\n";
echo "- Цветной фон #D7CABB\n";
echo "- Кадры 100x100px\n";
echo "- Строки по 6 кадров\n";
echo "- Gap 4px между кадрами\n";

$result = generateVideoPreview($testVideoPath, $testPreviewPath, 600, 100, 100, 5);

if ($result && file_exists($testPreviewPath)) {
    $previewSize = filesize($testPreviewPath);
    echo "✅ Превью создано успешно!\n";
    echo "Путь: {$testPreviewPath}\n";
    echo "Размер: {$previewSize} байт\n";
    
    // Получаем информацию об изображении
    $imageInfo = getimagesize($testPreviewPath);
    if ($imageInfo) {
        echo "Размеры превью: {$imageInfo[0]}x{$imageInfo[1]}px\n";
        echo "Тип: {$imageInfo['mime']}\n";
    }
    
    // Проверяем, что файл JPG
    $extension = strtolower(pathinfo($testPreviewPath, PATHINFO_EXTENSION));
    if ($extension === 'jpg' || $extension === 'jpeg') {
        echo "✅ Файл сохранен как JPG\n";
    } else {
        echo "❌ Файл сохранен как {$extension} (должен быть JPG)\n";
    }
    
} else {
    echo "❌ Ошибка создания превью\n";
    exit(1);
}

echo "\n=== ТЕСТ ЗАВЕРШЕН ===\n";
?>
