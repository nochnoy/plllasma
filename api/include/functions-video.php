<?php
/**
 * Функции для работы с видео файлами
 * Генерация иконок и определение типа видео
 */

require_once 'functions-logging.php';

/**
 * Определяет, является ли файл видео
 * @param string $filePath Путь к файлу
 * @param string $mimeType MIME тип файла
 * @return bool true если это видео
 */
function isVideoFile($filePath, $mimeType = null) {
    if (!$mimeType) {
        $mimeType = mime_content_type($filePath);
    }
    
    $videoMimes = [
        'video/mp4',
        'video/avi',
        'video/mov',
        'video/wmv',
        'video/x-ms-wmv',
        'video/x-ms-asf',
        'video/flv',
        'video/webm',
        'video/mkv',
        'video/3gp',
        'video/quicktime',
        'video/x-pn-realvideo',
        'application/vnd.rn-realmedia',
        'video/vnd.rn-realvideo',
        'video/mpeg',
        'video/x-mpeg'
    ];
    
    if (in_array($mimeType, $videoMimes)) {
        return true;
    }
    
    // Дополнительная проверка по расширению
    $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp', 'm4v', 'rm', 'rmvb', 'mpg', 'mpeg'];
    
    return in_array($extension, $videoExtensions);
}

/**
 * Генерирует иконку для видео файла
 * @param string $videoPath Путь к видео файлу
 * @param string $iconPath Путь для сохранения иконки
 * @param int $width Ширина иконки
 * @param int $height Высота иконки
 * @return bool true если иконка создана успешно
 */
function generateVideoIcon($videoPath, $iconPath, $width = 160, $height = 160) {
    // Проверяем, доступен ли ffmpeg
    if (!isFFmpegAvailable()) {
        plllasmaLog("[VIDEO] FFmpeg недоступен, не создаем иконку для видео");
        return false;
    }
    
    try {
        // Создаем временный файл для кадра в папке attachments-new
        $tempDir = '../attachments-new/tmp';
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }
        $tempFrame = $tempDir . '/video_frame_' . uniqid() . '.jpg';
        plllasmaLog("[VIDEO] Создан временный файл: {$tempFrame}");
        
        // Сначала получаем длительность видео
        $durationCommand = sprintf(
            'ffprobe -v quiet -show_entries format=duration -of csv="p=0" %s',
            escapeshellarg($videoPath)
        );
        
        $durationOutput = [];
        $durationReturnCode = 0;
        exec($durationCommand, $durationOutput, $durationReturnCode);
        
        $duration = 0;
        if ($durationReturnCode === 0 && !empty($durationOutput[0])) {
            $duration = floatval($durationOutput[0]);
        }
        
        // Если не удалось получить длительность, используем 2 секунды
        $seekTime = $duration > 0 ? $duration * 0.3 : 2;
        
        // Извлекаем кадр из видео (на 30% от длительности - лучше чем первый кадр)
        // Определяем тип файла для специальной обработки
        $extension = strtolower(pathinfo($videoPath, PATHINFO_EXTENSION));
        
        if (in_array($extension, ['wmv', 'asf'])) {
            // Для WMV используем специальные параметры
            plllasmaLog("Обрабатываем WMV файл с специальными параметрами", 'INFO', 'video-worker');
            $command = "ffmpeg -i " . escapeshellarg($videoPath) . " -ss " . $seekTime . " -vframes 1 -q:v 2 -c:v mjpeg -y " . escapeshellarg($tempFrame) . " 2>/dev/null";
        } elseif (in_array($extension, ['rm', 'rmvb'])) {
            // Для Real Media используем специальные параметры
            plllasmaLog("Обрабатываем Real Media файл с специальными параметрами", 'INFO', 'video-worker');
            $command = "ffmpeg -i " . escapeshellarg($videoPath) . " -ss " . $seekTime . " -vframes 1 -q:v 2 -f image2 -y " . escapeshellarg($tempFrame) . " 2>/dev/null";
        } else {
            // Для остальных форматов используем стандартные параметры
            $command = "ffmpeg -i " . escapeshellarg($videoPath) . " -ss " . $seekTime . " -vframes 1 -q:v 2 -y " . escapeshellarg($tempFrame) . " 2>/dev/null";
        }
        
        plllasmaLog("Временный файл: {$tempFrame}", 'INFO', 'video-worker');
        plllasmaLog("Выполняем команду ffmpeg: {$command}", 'INFO', 'video-worker');
    
        $output = [];
        $returnCode = 0;
        exec($command, $output, $returnCode);
        
        // Небольшая задержка для завершения записи файла
        usleep(100000); // 0.1 секунды
        
        $fileExists = file_exists($tempFrame);
        $fileSize = $fileExists ? filesize($tempFrame) : 0;
        
        plllasmaLog("Результат ffmpeg: код={$returnCode}, файл_существует=" . ($fileExists ? 'ДА' : 'НЕТ') . ", размер={$fileSize} байт", 'INFO', 'video-worker');
        
        if ($returnCode !== 0 || !$fileExists || $fileSize === 0) {
            // Если не удалось извлечь кадр, не создаем иконку
            plllasmaLog("Не удалось извлечь кадр из видео, код возврата: {$returnCode}, файл существует: " . ($fileExists ? 'ДА' : 'НЕТ') . ", размер: {$fileSize}", 'WARNING', 'video-worker');
            return false;
        }
        
        plllasmaLog("Кадр успешно извлечен: {$tempFrame}, размер: " . filesize($tempFrame) . " байт", 'INFO', 'video-worker');
        
        // Создаем иконку нужного размера
        plllasmaLog("Вызываем generateImageIcon с кадром {$tempFrame}", 'INFO', 'video-worker');
        $result = generateImageIcon($tempFrame, $iconPath, $width, $height);
        
        if ($result) {
            plllasmaLog("Иконка успешно создана из кадра видео", 'INFO', 'video-worker');
        } else {
            plllasmaLog("Ошибка создания иконки из кадра, не создаем иконку", 'WARNING', 'video-worker');
            $result = false;
        }
        
        // Удаляем временный файл
        if (file_exists($tempFrame)) {
            unlink($tempFrame);
    }
    
    return $result;
        
    } catch (Exception $e) {
        // В случае ошибки не создаем иконку
        plllasmaLog("Исключение при генерации иконки видео: " . $e->getMessage(), 'ERROR', 'video-worker');
        return false;
    }
}

/**
 * Проверяет, доступен ли ffmpeg
 * @return bool true если ffmpeg доступен
 */
function isFFmpegAvailable() {
    $output = [];
    $returnCode = 0;
    exec('ffmpeg -version 2>/dev/null', $output, $returnCode);
    return $returnCode === 0;
}

/**
 * Создает дефолтную иконку для видео
 * @param string $iconPath Путь для сохранения иконки
 * @param int $width Ширина иконки
 * @param int $height Высота иконки
 * @return bool true если иконка создана
 */
function generateDefaultVideoIcon($iconPath, $width = 160, $height = 160) {
    // Путь к дефолтной иконке видео
    $defaultIconPath = __DIR__ . '/../images/attachment-icons/video.png';
    
    // Если дефолтная иконка существует, копируем её
    if (file_exists($defaultIconPath)) {
        // Загружаем дефолтную иконку
        $defaultIcon = loadImage($defaultIconPath);
        if ($defaultIcon) {
            // Создаем иконку нужного размера
            $icon = imagecreatetruecolor($width, $height);
            
            // Получаем размеры исходной иконки
            $srcWidth = imagesx($defaultIcon);
            $srcHeight = imagesy($defaultIcon);
            
            // Копируем и масштабируем
            imagecopyresampled($icon, $defaultIcon, 0, 0, 0, 0, $width, $height, $srcWidth, $srcHeight);
            
            // Сохраняем
            $result = imagejpeg($icon, $iconPath, 90);
            imagedestroy($icon);
            imagedestroy($defaultIcon);
    
    return $result;
}
    }
    
    // Если дефолтная иконка недоступна, создаем простую
    $icon = imagecreatetruecolor($width, $height);
    
    // Темно-серый фон
    $bgColor = imagecolorallocate($icon, 40, 40, 40);
    imagefill($icon, 0, 0, $bgColor);
    
    // Белый треугольник (play button)
    $white = imagecolorallocate($icon, 255, 255, 255);
    $triangleSize = min($width, $height) * 0.3;
    $centerX = $width / 2;
    $centerY = $height / 2;
    
    $points = [
        $centerX - $triangleSize/2, $centerY - $triangleSize/2,
        $centerX - $triangleSize/2, $centerY + $triangleSize/2,
        $centerX + $triangleSize/2, $centerY
    ];
    
    imagefilledpolygon($icon, $points, 3, $white);
    
    $result = imagejpeg($icon, $iconPath, 90);
    imagedestroy($icon);
    
    return $result;
}

/**
 * Генерирует иконку из изображения (переиспользуем существующую функцию)
 * @param string $sourcePath Путь к исходному изображению
 * @param string $iconPath Путь для сохранения иконки
 * @param int $width Ширина иконки
 * @param int $height Высота иконки
 * @return bool true если иконка создана
 */
function generateImageIcon($sourcePath, $iconPath, $width, $height) {
    plllasmaLog("Начинаем генерацию иконки {$sourcePath} -> {$iconPath}", 'INFO', 'video-worker');
    
    $image = loadImage($sourcePath);
    if (!$image) {
        plllasmaLog("Не удалось загрузить изображение {$sourcePath}", 'WARNING', 'video-worker');
        return false;
    }
    
    $icon = imagecreatetruecolor($width, $height);
    if (!$icon) {
        plllasmaLog("Не удалось создать canvas для иконки", 'WARNING', 'video-worker');
        imagedestroy($image);
        return false;
    }
    
    $sourceWidth = imagesx($image);
    $sourceHeight = imagesy($image);
    plllasmaLog("Размеры исходного изображения: {$sourceWidth}x{$sourceHeight}", 'INFO', 'video-worker');
    
    // Используем crop to fit - заполняем всю область, обрезая лишнее
    $ratio = max($width / $sourceWidth, $height / $sourceHeight);
    $newWidth = $sourceWidth * $ratio;
    $newHeight = $sourceHeight * $ratio;
    
    // Вычисляем координаты для обрезки (центрируем)
    $srcX = ($newWidth - $width) / 2 / $ratio;
    $srcY = ($newHeight - $height) / 2 / $ratio;
    $srcWidth = $width / $ratio;
    $srcHeight = $height / $ratio;
    
    plllasmaLog("Crop to fit: исходный {$sourceWidth}x{$sourceHeight}, обрезка с ({$srcX},{$srcY}) размером {$srcWidth}x{$srcHeight}", 'INFO', 'video-worker');
    
    $resampleResult = imagecopyresampled($icon, $image, 0, 0, $srcX, $srcY, $width, $height, $srcWidth, $srcHeight);
    if (!$resampleResult) {
        plllasmaLog("Ошибка при изменении размера изображения", 'WARNING', 'video-worker');
        imagedestroy($icon);
        imagedestroy($image);
        return false;
    }
    
    $result = imagejpeg($icon, $iconPath, 90);
    if (!$result) {
        plllasmaLog("Ошибка при сохранении иконки в {$iconPath}", 'WARNING', 'video-worker');
    } else {
        plllasmaLog("Иконка успешно сохранена в {$iconPath}", 'INFO', 'video-worker');
    }
    
    imagedestroy($icon);
    imagedestroy($image);
    
    return $result;
}

/**
 * Загружает изображение из файла
 * @param string $path Путь к файлу
 * @return resource|false Ресурс изображения или false
 */
function loadImage($path) {
    if (!file_exists($path)) {
        plllasmaLog("Файл не существует: {$path}", 'WARNING', 'video-worker');
        return false;
    }
    
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    plllasmaLog("Загружаем изображение {$path}, расширение: {$extension}", 'INFO', 'video-worker');
    
    switch ($extension) {
        case 'jpg':
        case 'jpeg':
            $result = imagecreatefromjpeg($path);
            if (!$result) plllasmaLog("Ошибка загрузки JPEG: {$path}", 'WARNING', 'video-worker');
            return $result;
        case 'png':
            $result = imagecreatefrompng($path);
            if (!$result) plllasmaLog("Ошибка загрузки PNG: {$path}", 'WARNING', 'video-worker');
            return $result;
        case 'gif':
            $result = imagecreatefromgif($path);
            if (!$result) plllasmaLog("Ошибка загрузки GIF: {$path}", 'WARNING', 'video-worker');
            return $result;
        case 'webp':
            $result = imagecreatefromwebp($path);
            if (!$result) plllasmaLog("Ошибка загрузки WebP: {$path}", 'WARNING', 'video-worker');
            return $result;
        case 'bmp':
            $result = imagecreatefrombmp($path);
            if (!$result) plllasmaLog("Ошибка загрузки BMP: {$path}", 'WARNING', 'video-worker');
            return $result;
        default:
            plllasmaLog("Неподдерживаемый формат: {$extension} для файла {$path}", 'WARNING', 'video-worker');
            return false;
    }
}

/**
 * Генерирует превью видео с кадрами
 * @param string $videoPath Путь к видео файлу
 * @param string $previewPath Путь для сохранения превью
 * @param int $previewWidth Ширина превью (по умолчанию 1000px)
 * @param int $frameSize Размер каждого кадра (по умолчанию 100px)
 * @param int $maxFrames Максимальное количество кадров (по умолчанию 100)
 * @param int $minInterval Минимальный интервал между кадрами в секундах (по умолчанию 10)
 * @return bool true если превью создано успешно
 */
function generateVideoPreview($videoPath, $previewPath, $previewWidth = 1000, $frameSize = 100, $maxFrames = 100, $minInterval = 5) {
    // Проверяем, доступен ли ffmpeg
    if (!isFFmpegAvailable()) {
        plllasmaLog("[VIDEO] FFmpeg недоступен, не создаем превью для видео", 'WARNING', 'video-worker');
        return false;
    }
    
    try {
        plllasmaLog("[VIDEO] Начинаем генерацию превью для {$videoPath}", 'INFO', 'video-worker');
        
        // Создаем временную папку для кадров
        $tempDir = '../attachments-new/tmp';
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0755, true);
        }
        
        // Получаем длительность видео
        $durationCommand = sprintf(
            'ffprobe -v quiet -show_entries format=duration -of csv="p=0" %s',
            escapeshellarg($videoPath)
        );
        
        $durationOutput = [];
        $durationReturnCode = 0;
        exec($durationCommand, $durationOutput, $durationReturnCode);
        
        $duration = 0;
        if ($durationReturnCode === 0 && !empty($durationOutput[0])) {
            $duration = floatval($durationOutput[0]);
        }
        
        plllasmaLog("[VIDEO] Длительность видео: {$duration} секунд", 'INFO', 'video-worker');
        
        if ($duration <= 0) {
            plllasmaLog("[VIDEO] Не удалось определить длительность видео", 'WARNING', 'video-worker');
            return false;
        }
        
        // Вычисляем количество кадров и интервал
        $totalFrames = $maxFrames;
        $interval = $duration / $totalFrames;
        
        // Если интервал меньше минимального, уменьшаем количество кадров
        if ($interval < $minInterval) {
            $totalFrames = max(1, floor($duration / $minInterval));
            $interval = $duration / $totalFrames;
        }
        
        plllasmaLog("[VIDEO] Будем извлекать {$totalFrames} кадров с интервалом {$interval} секунд", 'INFO', 'video-worker');
        
        // Извлекаем кадры одной командой ffmpeg
        $frameFiles = [];
        $sessionId = uniqid();
        $framePattern = $tempDir . '/frame_' . $sessionId . '_%03d.jpg';
        
        // Создаем список временных позиций для select фильтра
        $selectExpression = [];
        for ($i = 0; $i < $totalFrames; $i++) {
            $timePos = $i * $interval;
            $selectExpression[] = "eq(t,{$timePos})";
        }
        $selectFilter = implode('+', $selectExpression);
        
        // Определяем тип файла для специальной обработки
        $extension = strtolower(pathinfo($videoPath, PATHINFO_EXTENSION));
        
        plllasmaLog("[VIDEO] Извлекаем {$totalFrames} кадров одной командой ffmpeg", 'INFO', 'video-worker');
        
        // Пробуем встроенный tile фильтр для всех форматов
        $tiledPreviewPath = $tempDir . '/tiled_preview_' . $sessionId . '.jpg';
        $framesPerRow = 6; // Фиксированное количество кадров на строку
        $totalRows = ceil($totalFrames / $framesPerRow);
        
        // Используем fps фильтр для равномерного извлечения кадров
        $fps = $totalFrames / $duration;
        $command = "ffmpeg -i " . escapeshellarg($videoPath) . 
                  " -vf \"fps={$fps},select='lt(n,{$totalFrames})',scale=100:100:force_original_aspect_ratio=increase,crop=100:100,tile={$framesPerRow}x{$totalRows}:padding=0:margin=0:color=0xD7CABB\" " .
                  " -frames:v 1 -q:v 2 -y " . escapeshellarg($tiledPreviewPath) . " 2>/dev/null";
        
        plllasmaLog("[VIDEO] Пробуем встроенный tile фильтр: {$command}", 'INFO', 'video-worker');
        
        $output = [];
        $returnCode = 0;
        exec($command, $output, $returnCode);
        
        if ($returnCode === 0 && file_exists($tiledPreviewPath) && filesize($tiledPreviewPath) > 0) {
            // Успех! Копируем готовый файл
            if (copy($tiledPreviewPath, $previewPath)) {
                plllasmaLog("[VIDEO] Превью создано встроенным tile фильтром", 'INFO', 'video-worker');
                unlink($tiledPreviewPath);
                return true;
            }
        }
        
        plllasmaLog("[VIDEO] Tile фильтр не сработал, используем покадровый метод", 'WARNING', 'video-worker');
        
        // Fallback к покадровому методу с select
        $command = "ffmpeg -i " . escapeshellarg($videoPath) . 
                  " -vf \"select='(" . $selectFilter . ")',scale=100:100:force_original_aspect_ratio=increase,crop=100:100\" " .
                  " -q:v 2 -y " . escapeshellarg($framePattern) . " 2>/dev/null";
        
        plllasmaLog("[VIDEO] Команда ffmpeg (покадровый): {$command}", 'INFO', 'video-worker');
        
        $output = [];
        $returnCode = 0;
        exec($command, $output, $returnCode);
        
        if ($returnCode === 0) {
            // Собираем список созданных файлов
            for ($i = 0; $i < $totalFrames; $i++) {
                $frameFile = $tempDir . '/frame_' . $sessionId . '_' . sprintf('%03d', $i + 1) . '.jpg';
                if (file_exists($frameFile) && filesize($frameFile) > 0) {
                    $frameFiles[] = $frameFile;
                }
            }
            plllasmaLog("[VIDEO] Извлечено кадров покадровым методом: " . count($frameFiles), 'INFO', 'video-worker');
        } else {
            plllasmaLog("[VIDEO] Покадровый метод не сработал, превью не создано", 'WARNING', 'video-worker');
            return false;
        }
        
        // Если tile фильтр уже создал превью, выходим
        if (file_exists($previewPath)) {
            plllasmaLog("[VIDEO] Превью уже создано tile фильтром", 'INFO', 'video-worker');
            return true;
        }
        
        if (empty($frameFiles)) {
            plllasmaLog("[VIDEO] Не удалось извлечь ни одного кадра", 'ERROR', 'video-worker');
            return false;
        }
        
        plllasmaLog("[VIDEO] Извлечено кадров: " . count($frameFiles), 'INFO', 'video-worker');
        
        // Создаем превью из отдельных кадров (PHP сборка) - плотная сетка без отступов
        $framesPerRow = 6; // Фиксированное количество кадров на строку
        $totalRows = ceil(count($frameFiles) / $framesPerRow);
        $previewWidth = 600; // Фиксированная ширина превью
        
        $previewHeight = $totalRows * $frameSize;
        
        plllasmaLog("[VIDEO] Размер превью: {$previewWidth}x{$previewHeight}, кадров в ряду: {$framesPerRow}, рядов: {$totalRows}", 'INFO', 'video-worker');
        
        // Создаем холст с цветом фона #D7CABB
        $preview = imagecreatetruecolor($previewWidth, $previewHeight);
        $bgColor = imagecolorallocate($preview, 215, 202, 187); // #D7CABB
        imagefill($preview, 0, 0, $bgColor);
        
        $frameIndex = 0;
        foreach ($frameFiles as $frameFile) {
            $frame = loadImage($frameFile);
            if ($frame) {
                $row = floor($frameIndex / $framesPerRow);
                $col = $frameIndex % $framesPerRow;
                
                // Позиция без отступов - кадры вплотную друг к другу
                $x = $col * $frameSize;
                $y = $row * $frameSize;
                
                // Масштабируем кадр до 100x100 с обрезкой (crop to fit)
                $frameWidth = imagesx($frame);
                $frameHeight = imagesy($frame);
                
                $ratio = max($frameSize / $frameWidth, $frameSize / $frameHeight);
                $newWidth = $frameWidth * $ratio;
                $newHeight = $frameHeight * $ratio;
                
                $srcX = ($newWidth - $frameSize) / 2 / $ratio;
                $srcY = ($newHeight - $frameSize) / 2 / $ratio;
                $srcWidth = $frameSize / $ratio;
                $srcHeight = $frameSize / $ratio;
                
                // Вставляем кадр точно в позицию без отступов
                imagecopyresampled($preview, $frame, $x, $y, $srcX, $srcY, $frameSize, $frameSize, $srcWidth, $srcHeight);
                imagedestroy($frame);
                
                plllasmaLog("[VIDEO] Кадр {$frameIndex} размещен в сетке ({$x}, {$y})", 'INFO', 'video-worker');
            }
            $frameIndex++;
        }
        
        // Сохраняем превью
        $result = imagejpeg($preview, $previewPath, 90);
        imagedestroy($preview);
        
        // Очищаем временные файлы
        foreach ($frameFiles as $frameFile) {
            if (file_exists($frameFile)) {
                unlink($frameFile);
            }
        }
        
        if ($result && file_exists($previewPath)) {
            $previewSize = filesize($previewPath);
            plllasmaLog("[VIDEO] Превью создано успешно: {$previewPath}, размер: {$previewSize} байт", 'INFO', 'video-worker');
            return true;
        } else {
            plllasmaLog("[VIDEO] Ошибка при сохранении превью", 'ERROR', 'video-worker');
            return false;
        }
        
    } catch (Exception $e) {
        plllasmaLog("[VIDEO] Исключение при генерации превью: " . $e->getMessage(), 'ERROR', 'video-worker');
        return false;
    }
}

/**
 * Генерирует черную иконку
 * @param string $iconPath Путь для сохранения иконки
 * @param int $width Ширина иконки
 * @param int $height Высота иконки
 * @return bool true если иконка создана
 */
function generateBlackIcon($iconPath, $width, $height) {
    $icon = imagecreatetruecolor($width, $height);
    $black = imagecolorallocate($icon, 0, 0, 0);
    imagefill($icon, 0, 0, $black);
    
    $result = imagejpeg($icon, $iconPath, 90);
    imagedestroy($icon);
    
    return $result;
}

?>