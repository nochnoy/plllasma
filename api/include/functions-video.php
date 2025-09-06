<?php
/**
 * Библиотека для работы с видео
 * Функции для генерации иконок, обработки видео и получения информации
 */

/**
 * Генерирует иконку для видео с автоматической обрезкой черных полей
 * 
 * @param string $videoPath Путь к видеофайлу
 * @param string $thumbnailPath Путь для сохранения иконки
 * @param string $size Размер иконки в формате "WIDTHxHEIGHT" (например "160x160")
 * @param int $timeOffset Секунда видео для создания иконки (по умолчанию 1)
 * @param bool $detectBlackBars Детектировать и обрезать черные поля (по умолчанию true)
 * @return array Результат операции
 */
function generateVideoThumbnail($videoPath, $thumbnailPath, $size = '160x160', $timeOffset = 1, $detectBlackBars = true) {
    $startTime = microtime(true);
    $result = [
        'success' => false,
        'error' => null,
        'processing_time' => 0,
        'thumbnail_path' => $thumbnailPath,
        'crop_params' => null,
        'ffmpeg_command' => null
    ];
    
    // Проверяем существование видеофайла
    if (!file_exists($videoPath)) {
        $result['error'] = "Видеофайл не найден: $videoPath";
        return $result;
    }
    
    // Разбираем размер на ширину и высоту
    if (!preg_match('/^(\d+)x(\d+)$/', $size, $matches)) {
        $result['error'] = "Неверный формат размера: $size. Используйте формат WIDTHxHEIGHT";
        return $result;
    }
    
    $width = (int)$matches[1];
    $height = (int)$matches[2];
    
    // Формируем команду ffmpeg
    $ffmpegCommand = '';
    $cropParams = null;
    
    if ($detectBlackBars) {
        // Сначала получаем параметры обрезки черных полей
        $cropDetectResult = detectVideoBlackBars($videoPath, $timeOffset);
        
        if ($cropDetectResult['success'] && $cropDetectResult['crop_params']) {
            $cropParams = $cropDetectResult['crop_params'];
            $result['crop_params'] = $cropParams;
            
            // Применяем найденные параметры обрезки
            $ffmpegCommand = sprintf(
                'ffmpeg -i "%s" -ss 00:00:%02d -vframes 1 -vf "crop=%s,scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d" -y "%s" 2>&1',
                $videoPath,
                $timeOffset,
                $cropParams,
                $width, $height,
                $width, $height,
                $thumbnailPath
            );
        } else {
            // Если не удалось определить параметры обрезки, используем обычную генерацию
            $ffmpegCommand = sprintf(
                'ffmpeg -i "%s" -ss 00:00:%02d -vframes 1 -vf "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d" -y "%s" 2>&1',
                $videoPath,
                $timeOffset,
                $width, $height,
                $width, $height,
                $thumbnailPath
            );
        }
    } else {
        // Обычная генерация без детекции черных полей
        $ffmpegCommand = sprintf(
            'ffmpeg -i "%s" -ss 00:00:%02d -vframes 1 -vf "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d" -y "%s" 2>&1',
            $videoPath,
            $timeOffset,
            $width, $height,
            $width, $height,
            $thumbnailPath
        );
    }
    
    $result['ffmpeg_command'] = $ffmpegCommand;
    
    // Выполняем команду
    $output = [];
    $returnCode = 0;
    exec($ffmpegCommand, $output, $returnCode);
    
    $endTime = microtime(true);
    $result['processing_time'] = ($endTime - $startTime) * 1000; // в миллисекундах
    
    if ($returnCode === 0 && file_exists($thumbnailPath)) {
        $result['success'] = true;
        $result['file_size'] = filesize($thumbnailPath);
        
        // Получаем информацию о созданной иконке
        $imageInfo = getimagesize($thumbnailPath);
        if ($imageInfo) {
            $result['image_width'] = $imageInfo[0];
            $result['image_height'] = $imageInfo[1];
            $result['image_type'] = $imageInfo['mime'];
        }
    } else {
        $result['error'] = "Ошибка ffmpeg (код: $returnCode): " . implode("\n", $output);
    }
    
    return $result;
}

/**
 * Детектирует черные поля в видео
 * 
 * @param string $videoPath Путь к видеофайлу
 * @param int $timeOffset Секунда видео для анализа (по умолчанию 1)
 * @param int $threshold Порог чувствительности (по умолчанию 24)
 * @return array Результат детекции
 */
function detectVideoBlackBars($videoPath, $timeOffset = 1, $threshold = 24) {
    $result = [
        'success' => false,
        'error' => null,
        'crop_params' => null,
        'processing_time' => 0
    ];
    
    $startTime = microtime(true);
    
    // Команда для детекции черных полей
    $cropDetectCommand = sprintf(
        'ffmpeg -i "%s" -ss 00:00:%02d -vframes 1 -vf cropdetect=%d:16:0 -f null - 2>&1',
        $videoPath,
        $timeOffset,
        $threshold
    );
    
    $output = [];
    $returnCode = 0;
    exec($cropDetectCommand, $output, $returnCode);
    
    $endTime = microtime(true);
    $result['processing_time'] = ($endTime - $startTime) * 1000;
    
    if ($returnCode === 0) {
        // Ищем параметры crop в выводе
        foreach ($output as $line) {
            if (preg_match('/crop=(\d+:\d+:\d+:\d+)/', $line, $matches)) {
                $result['crop_params'] = $matches[1];
                $result['success'] = true;
                break;
            }
        }
        
        if (!$result['success']) {
            $result['error'] = "Черные поля не обнаружены или видео не требует обрезки";
            $result['success'] = true; // Это не ошибка, просто нет черных полей
        }
    } else {
        $result['error'] = "Ошибка детекции черных полей (код: $returnCode): " . implode("\n", $output);
    }
    
    return $result;
}

/**
 * Получает информацию о видеофайле
 * 
 * @param string $videoPath Путь к видеофайлу
 * @return array Информация о видео
 */
function getVideoInfo($videoPath) {
    $result = [
        'success' => false,
        'error' => null,
        'duration' => null,
        'file_size' => null,
        'bitrate' => null,
        'width' => null,
        'height' => null,
        'codec' => null,
        'fps' => null,
        'format' => null
    ];
    
    if (!file_exists($videoPath)) {
        $result['error'] = "Видеофайл не найден: $videoPath";
        return $result;
    }
    
    // Команда для получения информации о видео
    $infoCommand = sprintf('ffprobe -v quiet -print_format json -show_format -show_streams "%s"', $videoPath);
    
    $output = [];
    $returnCode = 0;
    exec($infoCommand, $output, $returnCode);
    
    if ($returnCode === 0) {
        $videoInfo = json_decode(implode('', $output), true);
        
        if ($videoInfo) {
            $result['success'] = true;
            
            // Информация о формате
            if (isset($videoInfo['format'])) {
                $format = $videoInfo['format'];
                $result['duration'] = isset($format['duration']) ? (float)$format['duration'] : null;
                $result['file_size'] = isset($format['size']) ? (int)$format['size'] : null;
                $result['bitrate'] = isset($format['bit_rate']) ? (int)$format['bit_rate'] : null;
                $result['format'] = isset($format['format_name']) ? $format['format_name'] : null;
            }
            
            // Информация о видео потоке
            foreach ($videoInfo['streams'] as $stream) {
                if ($stream['codec_type'] === 'video') {
                    $result['width'] = isset($stream['width']) ? (int)$stream['width'] : null;
                    $result['height'] = isset($stream['height']) ? (int)$stream['height'] : null;
                    $result['codec'] = isset($stream['codec_name']) ? $stream['codec_name'] : null;
                    
                    if (isset($stream['r_frame_rate'])) {
                        $fps = eval('return ' . $stream['r_frame_rate'] . ';');
                        $result['fps'] = $fps;
                    }
                    break;
                }
            }
        }
    } else {
        $result['error'] = "Ошибка получения информации о видео (код: $returnCode): " . implode("\n", $output);
    }
    
    return $result;
}

/**
 * Создает иконку для видео с автоматическим именованием
 * 
 * @param string $videoPath Путь к видеофайлу
 * @param string $outputDir Директория для сохранения иконки
 * @param string $size Размер иконки (по умолчанию "160x160")
 * @param int $timeOffset Секунда видео для создания иконки (по умолчанию 1)
 * @return array Результат операции
 */
function createVideoThumbnail($videoPath, $outputDir, $size = '160x160', $timeOffset = 1) {
    // Создаем имя файла для иконки
    $videoName = pathinfo($videoPath, PATHINFO_FILENAME);
    $thumbnailName = "thumbnail_{$videoName}_{$size}.jpg";
    $thumbnailPath = rtrim($outputDir, '/') . '/' . $thumbnailName;
    
    // Создаем директорию если не существует
    if (!is_dir($outputDir)) {
        if (!mkdir($outputDir, 0755, true)) {
            return [
                'success' => false,
                'error' => "Не удалось создать директорию: $outputDir"
            ];
        }
    }
    
    return generateVideoThumbnail($videoPath, $thumbnailPath, $size, $timeOffset, true);
}

/**
 * Проверяет, поддерживается ли ffmpeg на сервере
 * 
 * @return array Результат проверки
 */
function checkFFmpegSupport() {
    $result = [
        'ffmpeg_available' => false,
        'ffprobe_available' => false,
        'ffmpeg_version' => null,
        'ffprobe_version' => null,
        'error' => null
    ];
    
    // Проверяем ffmpeg
    $ffmpegOutput = [];
    $ffmpegReturnCode = 0;
    exec('ffmpeg -version 2>&1', $ffmpegOutput, $ffmpegReturnCode);
    
    if ($ffmpegReturnCode === 0) {
        $result['ffmpeg_available'] = true;
        if (isset($ffmpegOutput[0])) {
            $result['ffmpeg_version'] = $ffmpegOutput[0];
        }
    }
    
    // Проверяем ffprobe
    $ffprobeOutput = [];
    $ffprobeReturnCode = 0;
    exec('ffprobe -version 2>&1', $ffprobeOutput, $ffprobeReturnCode);
    
    if ($ffprobeReturnCode === 0) {
        $result['ffprobe_available'] = true;
        if (isset($ffprobeOutput[0])) {
            $result['ffprobe_version'] = $ffprobeOutput[0];
        }
    }
    
    if (!$result['ffmpeg_available']) {
        $result['error'] = "ffmpeg не установлен или недоступен";
    } elseif (!$result['ffprobe_available']) {
        $result['error'] = "ffprobe не установлен или недоступен";
    }
    
    return $result;
}

/**
 * Конвертирует видео в WebM формат с оптимизированными настройками
 * 
 * @param string $inputPath Путь к исходному видеофайлу
 * @param string $outputPath Путь для сохранения WebM файла
 * @param array $options Настройки конвертации
 * @return array Результат операции
 */
function convertToWebM($inputPath, $outputPath, $options = []) {
    $startTime = microtime(true);
    $result = [
        'success' => false,
        'error' => null,
        'processing_time' => 0,
        'output_path' => $outputPath,
        'input_size' => 0,
        'output_size' => 0,
        'compression_ratio' => 0,
        'ffmpeg_command' => null
    ];
    
    // Проверяем существование исходного файла
    if (!file_exists($inputPath)) {
        $result['error'] = "Исходный видеофайл не найден: $inputPath";
        return $result;
    }
    
    $result['input_size'] = filesize($inputPath);
    
    // Настройки по умолчанию
    $defaultOptions = [
        'quality' => 'medium', // low, medium, high
        'max_width' => 1280,
        'max_height' => 720,
        'bitrate' => 'auto', // auto или конкретное значение в kbps
        'audio_bitrate' => 128,
        'remove_audio' => false,
        'fps' => 'auto' // auto или конкретное значение
    ];
    
    $options = array_merge($defaultOptions, $options);
    
    // Определяем параметры качества (более агрессивное сжатие)
    $qualitySettings = [
        'low' => [
            'crf' => 32,
            'max_bitrate' => '300k',
            'bufsize' => '600k',
            'cpu_used' => 4
        ],
        'medium' => [
            'crf' => 28,
            'max_bitrate' => '600k',
            'bufsize' => '1200k',
            'cpu_used' => 3
        ],
        'high' => [
            'crf' => 24,
            'max_bitrate' => '1000k',
            'bufsize' => '2000k',
            'cpu_used' => 2
        ]
    ];
    
    $quality = $qualitySettings[$options['quality']];
    
    // Формируем фильтры
    $filters = [];
    
    // Сначала детектируем и обрезаем черные поля
    $cropParams = null;
    if (isset($options['detect_black_bars']) && $options['detect_black_bars']) {
        $blackBarsResult = detectVideoBlackBars($inputPath, 1);
        if ($blackBarsResult['success'] && $blackBarsResult['crop_params']) {
            $cropParams = $blackBarsResult['crop_params'];
            $filters[] = "crop={$cropParams}";
        }
    }
    
    // Масштабирование
    if ($options['max_width'] && $options['max_height']) {
        $filters[] = "scale='min({$options['max_width']},iw)':'min({$options['max_height']},ih)':force_original_aspect_ratio=decrease";
    }
    
    // FPS
    if ($options['fps'] !== 'auto') {
        $filters[] = "fps={$options['fps']}";
    }
    
    $videoFilters = implode(',', $filters);
    
    // Формируем команду ffmpeg
    $ffmpegCommand = 'ffmpeg -i "' . $inputPath . '"';
    
    // Видео кодек и настройки (более агрессивное сжатие)
    $ffmpegCommand .= ' -c:v libvpx-vp9';
    $ffmpegCommand .= ' -crf ' . $quality['crf'];
    $ffmpegCommand .= ' -b:v ' . $quality['max_bitrate'];
    $ffmpegCommand .= ' -maxrate ' . $quality['max_bitrate'];
    $ffmpegCommand .= ' -bufsize ' . $quality['bufsize'];
    $ffmpegCommand .= ' -deadline good';
    $ffmpegCommand .= ' -cpu-used ' . $quality['cpu_used'];
    $ffmpegCommand .= ' -row-mt 1'; // Многопоточность
    $ffmpegCommand .= ' -tile-columns 2'; // Параллельная обработка
    $ffmpegCommand .= ' -frame-parallel 1'; // Параллельные кадры
    
    // Аудио настройки
    if ($options['remove_audio']) {
        $ffmpegCommand .= ' -an';
    } else {
        $ffmpegCommand .= ' -c:a libopus';
        $ffmpegCommand .= ' -b:a ' . $options['audio_bitrate'] . 'k';
    }
    
    // Фильтры
    if ($videoFilters) {
        $ffmpegCommand .= ' -vf "' . $videoFilters . '"';
    }
    
    // Дополнительные настройки
    $ffmpegCommand .= ' -movflags +faststart';
    $ffmpegCommand .= ' -y "' . $outputPath . '" 2>&1';
    
    $result['ffmpeg_command'] = $ffmpegCommand;
    
    // Выполняем команду
    $output = [];
    $returnCode = 0;
    exec($ffmpegCommand, $output, $returnCode);
    
    $endTime = microtime(true);
    $result['processing_time'] = ($endTime - $startTime) * 1000; // в миллисекундах
    
    if ($returnCode === 0 && file_exists($outputPath)) {
        $result['success'] = true;
        $result['output_size'] = filesize($outputPath);
        $result['compression_ratio'] = $result['input_size'] > 0 ? 
            round(($result['input_size'] - $result['output_size']) / $result['input_size'] * 100, 2) : 0;
    } else {
        $result['error'] = "Ошибка конвертации (код: $returnCode): " . implode("\n", $output);
    }
    
    return $result;
}

/**
 * Конвертирует видео в H.264 MP4 с агрессивным сжатием
 * 
 * @param string $inputPath Путь к исходному видеофайлу
 * @param string $outputPath Путь для сохранения MP4 файла
 * @param array $options Настройки конвертации
 * @return array Результат операции
 */
function convertToH264($inputPath, $outputPath, $options = []) {
    $startTime = microtime(true);
    $result = [
        'success' => false,
        'error' => null,
        'processing_time' => 0,
        'output_path' => $outputPath,
        'input_size' => 0,
        'output_size' => 0,
        'compression_ratio' => 0,
        'ffmpeg_command' => null
    ];
    
    // Проверяем существование исходного файла
    if (!file_exists($inputPath)) {
        $result['error'] = "Исходный видеофайл не найден: $inputPath";
        return $result;
    }
    
    $result['input_size'] = filesize($inputPath);
    
    // Настройки по умолчанию
    $defaultOptions = [
        'quality' => 'medium', // low, medium, high
        'max_width' => 1280,
        'max_height' => 720,
        'audio_bitrate' => 96,
        'remove_audio' => false,
        'fps' => 'auto'
    ];
    
    $options = array_merge($defaultOptions, $options);
    
    // Определяем параметры качества для H.264
    $qualitySettings = [
        'low' => [
            'crf' => 30,
            'preset' => 'fast',
            'profile' => 'baseline'
        ],
        'medium' => [
            'crf' => 26,
            'preset' => 'medium',
            'profile' => 'main'
        ],
        'high' => [
            'crf' => 22,
            'preset' => 'slow',
            'profile' => 'high'
        ]
    ];
    
    $quality = $qualitySettings[$options['quality']];
    
    // Формируем фильтры
    $filters = [];
    
    // Сначала детектируем и обрезаем черные поля
    $cropParams = null;
    if (isset($options['detect_black_bars']) && $options['detect_black_bars']) {
        $blackBarsResult = detectVideoBlackBars($inputPath, 1);
        if ($blackBarsResult['success'] && $blackBarsResult['crop_params']) {
            $cropParams = $blackBarsResult['crop_params'];
            $filters[] = "crop={$cropParams}";
        }
    }
    
    // Масштабирование
    if ($options['max_width'] && $options['max_height']) {
        $filters[] = "scale='min({$options['max_width']},iw)':'min({$options['max_height']},ih)':force_original_aspect_ratio=decrease";
    }
    
    // FPS
    if ($options['fps'] !== 'auto') {
        $filters[] = "fps={$options['fps']}";
    }
    
    $videoFilters = implode(',', $filters);
    
    // Формируем команду ffmpeg
    $ffmpegCommand = 'ffmpeg -i "' . $inputPath . '"';
    
    // Видео кодек H.264 с агрессивным сжатием
    $ffmpegCommand .= ' -c:v libx264';
    $ffmpegCommand .= ' -crf ' . $quality['crf'];
    $ffmpegCommand .= ' -preset ' . $quality['preset'];
    $ffmpegCommand .= ' -profile:v ' . $quality['profile'];
    $ffmpegCommand .= ' -tune film'; // Оптимизация для фильмов
    $ffmpegCommand .= ' -movflags +faststart';
    
    // Аудио настройки
    if ($options['remove_audio']) {
        $ffmpegCommand .= ' -an';
    } else {
        $ffmpegCommand .= ' -c:a aac';
        $ffmpegCommand .= ' -b:a ' . $options['audio_bitrate'] . 'k';
        $ffmpegCommand .= ' -ac 2'; // Стерео
    }
    
    // Фильтры
    if ($videoFilters) {
        $ffmpegCommand .= ' -vf "' . $videoFilters . '"';
    }
    
    $ffmpegCommand .= ' -y "' . $outputPath . '" 2>&1';
    
    $result['ffmpeg_command'] = $ffmpegCommand;
    
    // Выполняем команду
    $output = [];
    $returnCode = 0;
    exec($ffmpegCommand, $output, $returnCode);
    
    $endTime = microtime(true);
    $result['processing_time'] = ($endTime - $startTime) * 1000;
    
    if ($returnCode === 0 && file_exists($outputPath)) {
        $result['success'] = true;
        $result['output_size'] = filesize($outputPath);
        $result['compression_ratio'] = $result['input_size'] > 0 ? 
            round(($result['input_size'] - $result['output_size']) / $result['input_size'] * 100, 2) : 0;
    } else {
        $result['error'] = "Ошибка конвертации (код: $returnCode): " . implode("\n", $output);
    }
    
    return $result;
}

/**
 * Получает рекомендуемые настройки конвертации на основе исходного видео
 * 
 * @param string $videoPath Путь к видеофайлу
 * @return array Рекомендуемые настройки
 */
function getRecommendedConversionSettings($videoPath) {
    $videoInfo = getVideoInfo($videoPath);
    $settings = [
        'quality' => 'medium',
        'max_width' => 1280,
        'max_height' => 720,
        'bitrate' => 'auto',
        'audio_bitrate' => 128,
        'remove_audio' => false,
        'fps' => 'auto'
    ];
    
    if ($videoInfo['success']) {
        // Определяем качество на основе разрешения
        if ($videoInfo['width'] && $videoInfo['height']) {
            if ($videoInfo['width'] <= 640) {
                $settings['quality'] = 'low';
                $settings['max_width'] = 640;
                $settings['max_height'] = 480;
            } elseif ($videoInfo['width'] <= 1280) {
                $settings['quality'] = 'medium';
                $settings['max_width'] = 1280;
                $settings['max_height'] = 720;
            } else {
                $settings['quality'] = 'high';
                $settings['max_width'] = 1920;
                $settings['max_height'] = 1080;
            }
        }
        
        // Определяем FPS
        if ($videoInfo['fps'] && $videoInfo['fps'] > 30) {
            $settings['fps'] = 30;
        }
        
        // Определяем битрейт аудио
        if ($videoInfo['bitrate'] && $videoInfo['bitrate'] < 500000) {
            $settings['audio_bitrate'] = 96;
        }
    }
    
    return $settings;
}

/**
 * Логирование отключено для упрощения системы
 * Все операции выполняются без записи в файлы логов
 */
?>
