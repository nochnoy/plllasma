<?php
/**
 * Веб-интерфейс для конвертации видео в WebM формат
 */

// Подключаем библиотеку для работы с видео
require_once 'include/functions-video.php';

// Устанавливаем заголовки для отображения в браузере
header('Content-Type: text/html; charset=utf-8');

// Получаем параметры из GET запроса
$videoPath = $_GET['video'] ?? 'test/test.mp4';
$codec = $_GET['codec'] ?? 'h264'; // h264 или webm
$quality = $_GET['quality'] ?? 'medium';
$maxWidth = (int)($_GET['max_width'] ?? 1280);
$maxHeight = (int)($_GET['max_height'] ?? 720);
$audioBitrate = (int)($_GET['audio_bitrate'] ?? 96);
$removeAudio = isset($_GET['remove_audio']) && $_GET['remove_audio'] === '1';
$detectBlackBars = isset($_GET['detect_black_bars']) && $_GET['detect_black_bars'] === '1';
$fps = $_GET['fps'] ?? 'auto';
$convert = isset($_GET['convert']) && $_GET['convert'] === '1';

// Проверяем, что путь к видео безопасный
$originalVideoPath = $videoPath;
if (strpos($originalVideoPath, '..') !== false && !preg_match('/^\.\.\//', $originalVideoPath)) {
    die('Ошибка: Небезопасный путь к файлу!');
}

// Если путь не абсолютный, делаем его относительно корня проекта
if (!file_exists($videoPath)) {
    $videoPath = '../' . $videoPath;
}

// Проверяем существование видеофайла
if (!file_exists($videoPath)) {
    echo "<h2>❌ Ошибка</h2>";
    echo "<p>Видеофайл '$videoPath' не найден!</p>";
    echo "<p>Проверьте, что файл существует в корневой папке проекта.</p>";
    exit;
}

// Получаем информацию о видео
$videoInfo = getVideoInfo($videoPath);
$recommendedSettings = getRecommendedConversionSettings($videoPath);

// Создаем имя для выходного файла
$extension = $codec === 'h264' ? 'mp4' : 'webm';
$outputPath = dirname($videoPath) . '/converted_' . basename($videoPath, '.mp4') . '_' . $quality . '.' . $extension;

// Выполняем конвертацию если нажата кнопка
$conversionResult = null;
if ($convert) {
    $options = [
        'quality' => $quality,
        'max_width' => $maxWidth,
        'max_height' => $maxHeight,
        'audio_bitrate' => $audioBitrate,
        'remove_audio' => $removeAudio,
        'detect_black_bars' => $detectBlackBars,
        'fps' => $fps
    ];
    
    if ($codec === 'h264') {
        $conversionResult = convertToH264($videoPath, $outputPath, $options);
    } else {
        $conversionResult = convertToWebM($videoPath, $outputPath, $options);
    }
}

?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Конвертация видео в WebM</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .info { background: #e9ecef; padding: 15px; border-radius: 4px; margin: 15px 0; }
        .form-group { margin: 15px 0; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="number"], select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0056b3; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .video-info { background: #e3f2fd; padding: 15px; border-radius: 4px; }
        .settings { background: #fff3e0; padding: 15px; border-radius: 4px; }
        .result { background: #f3e5f5; padding: 15px; border-radius: 4px; }
        .download-link { display: inline-block; background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .download-link:hover { background: #218838; }
        input[type="checkbox"] { margin-right: 8px; }
        .checkbox-label { display: flex; align-items: center; margin-bottom: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Конвертация видео в WebM</h1>
        
        <div class="grid">
            <div class="video-info">
                <h3>📹 Информация о видео</h3>
                <?php if ($videoInfo['success']): ?>
                    <p><strong>Файл:</strong> <?php echo htmlspecialchars(basename($videoPath)); ?></p>
                    <p><strong>Разрешение:</strong> <?php echo $videoInfo['width']; ?>x<?php echo $videoInfo['height']; ?></p>
                    <p><strong>Длительность:</strong> <?php echo gmdate("H:i:s", $videoInfo['duration']); ?></p>
                    <p><strong>Размер файла:</strong> <?php echo number_format($videoInfo['file_size']); ?> байт</p>
                    <p><strong>Кодек:</strong> <?php echo $videoInfo['codec']; ?></p>
                    <p><strong>FPS:</strong> <?php echo $videoInfo['fps']; ?></p>
                    <p><strong>Битрейт:</strong> <?php echo number_format($videoInfo['bitrate']); ?> bps</p>
                <?php else: ?>
                    <p class="error">Ошибка получения информации о видео</p>
                <?php endif; ?>
            </div>
            
            <div class="settings">
                <h3>⚙️ Рекомендуемые настройки</h3>
                <p><strong>Качество:</strong> <?php echo $recommendedSettings['quality']; ?></p>
                <p><strong>Макс. разрешение:</strong> <?php echo $recommendedSettings['max_width']; ?>x<?php echo $recommendedSettings['max_height']; ?></p>
                <p><strong>FPS:</strong> <?php echo $recommendedSettings['fps']; ?></p>
                <p><strong>Аудио битрейт:</strong> <?php echo $recommendedSettings['audio_bitrate']; ?> kbps</p>
            </div>
        </div>
        
        <div class="form-group">
            <form method="GET">
                <label for="video">Путь к видеофайлу:</label>
                <input type="text" id="video" name="video" value="<?php echo htmlspecialchars($videoPath); ?>" placeholder="test/test.mp4">
                
                <label for="codec">Кодек:</label>
                <select id="codec" name="codec">
                    <option value="h264" <?php echo $codec === 'h264' ? 'selected' : ''; ?>>H.264 MP4 (лучшее сжатие, совместимость)</option>
                    <option value="webm" <?php echo $codec === 'webm' ? 'selected' : ''; ?>>VP9 WebM (современный, веб-оптимизированный)</option>
                </select>
                
                <label for="quality">Качество:</label>
                <select id="quality" name="quality">
                    <option value="low" <?php echo $quality === 'low' ? 'selected' : ''; ?>>Низкое (максимальное сжатие)</option>
                    <option value="medium" <?php echo $quality === 'medium' ? 'selected' : ''; ?>>Среднее (баланс)</option>
                    <option value="high" <?php echo $quality === 'high' ? 'selected' : ''; ?>>Высокое (лучшее качество)</option>
                </select>
                
                <label for="max_width">Максимальная ширина:</label>
                <input type="number" id="max_width" name="max_width" value="<?php echo $maxWidth; ?>" min="320" max="3840">
                
                <label for="max_height">Максимальная высота:</label>
                <input type="number" id="max_height" name="max_height" value="<?php echo $maxHeight; ?>" min="240" max="2160">
                
                <label for="audio_bitrate">Битрейт аудио (kbps):</label>
                <input type="number" id="audio_bitrate" name="audio_bitrate" value="<?php echo $audioBitrate; ?>" min="64" max="320">
                
                <label for="fps">FPS:</label>
                <select id="fps" name="fps">
                    <option value="auto" <?php echo $fps === 'auto' ? 'selected' : ''; ?>>Авто (исходный)</option>
                    <option value="24" <?php echo $fps === '24' ? 'selected' : ''; ?>>24 FPS</option>
                    <option value="30" <?php echo $fps === '30' ? 'selected' : ''; ?>>30 FPS</option>
                    <option value="60" <?php echo $fps === '60' ? 'selected' : ''; ?>>60 FPS</option>
                </select>
                
                <label class="checkbox-label">
                    <input type="checkbox" name="remove_audio" value="1" <?php echo $removeAudio ? 'checked' : ''; ?>>
                    Удалить аудио (только видео)
                </label>
                
                <label class="checkbox-label">
                    <input type="checkbox" name="detect_black_bars" value="1" <?php echo $detectBlackBars ? 'checked' : ''; ?>>
                    Детектировать и обрезать встроенные черные поля (медленнее, но лучше качество)
                </label>
                
                <button type="submit" name="convert" value="1">🔄 Конвертировать видео</button>
            </form>
        </div>

        <?php if ($conversionResult): ?>
            <div class="result">
                <h3>📊 Результат конвертации</h3>
                
                <?php if ($conversionResult['success']): ?>
                    <div class="success">
                        <h4>✅ Конвертация успешно завершена!</h4>
                        <p><strong>Время обработки:</strong> <?php echo number_format($conversionResult['processing_time'] / 1000, 2); ?> сек</p>
                        <p><strong>Исходный размер:</strong> <?php echo number_format($conversionResult['input_size']); ?> байт</p>
                        <p><strong>Размер <?php echo strtoupper($extension); ?>:</strong> <?php echo number_format($conversionResult['output_size']); ?> байт</p>
                        <p><strong>Сжатие:</strong> <?php echo $conversionResult['compression_ratio']; ?>%</p>
                        <?php if ($detectBlackBars): ?>
                            <p><strong>Детекция черных полей:</strong> Включена</p>
                        <?php endif; ?>
                        
                        <a href="<?php echo basename($conversionResult['output_path']); ?>" class="download-link" download>
                            📥 Скачать <?php echo strtoupper($extension); ?> файл
                        </a>
                        
                        <h4>🎥 Предварительный просмотр:</h4>
                        <video controls width="400" style="max-width: 100%;">
                            <source src="<?php echo basename($conversionResult['output_path']); ?>" type="video/<?php echo $extension; ?>">
                            Ваш браузер не поддерживает этот формат видео.
                        </video>
                    </div>
                <?php else: ?>
                    <div class="error">
                        <h4>❌ Ошибка конвертации</h4>
                        <p><?php echo htmlspecialchars($conversionResult['error']); ?></p>
                    </div>
                <?php endif; ?>
                
                <h4>🔧 Команда ffmpeg:</h4>
                <pre><?php echo htmlspecialchars($conversionResult['ffmpeg_command']); ?></pre>
            </div>
        <?php else: ?>
            <div class="info">
                <h3>Готов к конвертации</h3>
                <p>Настройте параметры и нажмите кнопку "Конвертировать видео" для начала обработки.</p>
            <p><strong>H.264 MP4</strong> - лучшее сжатие, максимальная совместимость, рекомендуется для экономии места.</p>
            <p><strong>VP9 WebM</strong> - современный формат, оптимизирован для веб-использования.</p>
            <p><strong>Детекция черных полей</strong> - автоматически находит и обрезает встроенные черные поля в видео, улучшая качество и уменьшая размер файла.</p>
            </div>
        <?php endif; ?>
        
        <div class="info">
            <h3>ℹ️ О форматах</h3>
            <h4>H.264 MP4:</h4>
            <ul>
                <li><strong>Лучшее сжатие</strong> - максимальная экономия места</li>
                <li><strong>Универсальная совместимость</strong> - работает везде</li>
                <li><strong>Быстрая обработка</strong> - оптимизированные алгоритмы</li>
                <li><strong>Рекомендуется</strong> для экономии дискового пространства</li>
            </ul>
            <h4>VP9 WebM:</h4>
            <ul>
                <li><strong>Современный кодек</strong> - новейшие технологии сжатия</li>
                <li><strong>Opus аудио</strong> - высококачественный звук</li>
                <li><strong>Веб-оптимизация</strong> - быстрая загрузка в браузере</li>
                <li><strong>Открытый формат</strong> - без лицензионных ограничений</li>
            </ul>
        </div>
    </div>
</body>
</html>
