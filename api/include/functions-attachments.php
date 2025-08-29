<?
// Функции для работы с новой системой аттачментов

// Извлекает код YouTube из URL
function getYouTubeCode($url) {
    $patterns = [
        '/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/',
        '/youtu\.be\/([a-zA-Z0-9_-]+)/',
        '/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/',
        '/youtube\.com\/v\/([a-zA-Z0-9_-]+)/',
        '/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/'
    ];
    
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $url, $matches)) {
            return $matches[1];
        }
    }
    
    return null;
}

// Проверяет, является ли URL ссылкой на YouTube
function isYouTubeUrl($url) {
    return getYouTubeCode($url) !== null;
}

// Извлекает все YouTube ссылки из текста
function extractYouTubeUrls($text) {
    $urls = [];
    $pattern = '/https?:\/\/[^\s<>"]+/';
    
    if (preg_match_all($pattern, $text, $matches)) {
        foreach ($matches[0] as $url) {
            if (isYouTubeUrl($url)) {
                $urls[] = $url;
            }
        }
    }
    
    return array_unique($urls);
}

// Создает новый аттачмент
function createAttachment($messageId, $type, $source = null, $videoId = null) {
    global $mysqli;
    
    $id = generateGuid();
    $created = date('Y-m-d H:i:s');
    
    $sql = $mysqli->prepare('
        INSERT INTO tbl_attachments (id, id_message, type, created, source, status) 
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $status = 'pending';
    $sql->bind_param("sissss", $id, $messageId, $type, $created, $source, $status);
    
    if ($sql->execute()) {
        // Если это YouTube аттачмент, сразу скачиваем превью и иконку
        if ($type === 'youtube' && $videoId) {
            downloadYouTubeAssets($id, $videoId);
        }
        return $id;
    }
    
    return null;
}

// Скачивает превью и иконку для YouTube видео
function downloadYouTubeAssets($attachmentId, $videoId) {
    // Создаем пути для файлов
    $folderPath = createAttachmentFolder($attachmentId);
    if (!$folderPath) {
        error_log("YouTube attachment $attachmentId: Failed to create folder");
        return false;
    }
    
    $previewPath = $folderPath . $attachmentId . '-p.jpg';
    $iconPath = $folderPath . $attachmentId . '-i.jpg';
    
    // Скачиваем превью
    $previewUrl = "http://194.135.33.47:5000/api/preview/" . $videoId;
    $previewSuccess = downloadFile($previewUrl, $previewPath);
    
    // Дополнительная проверка: файл действительно существует и не пустой
    if ($previewSuccess && (!file_exists($previewPath) || filesize($previewPath) < 1024)) {
        $previewSuccess = false;
        error_log("YouTube attachment $attachmentId: Preview file not created or too small");
    }
    
    // Скачиваем иконку (то же превью, но создаем иконку 160x160)
    $iconSuccess = false;
    if ($previewSuccess && file_exists($previewPath)) {
        $iconSuccess = createIconFromPreview($previewPath, $iconPath);
        
        // Дополнительная проверка иконки
        if ($iconSuccess && (!file_exists($iconPath) || filesize($iconPath) < 1024)) {
            $iconSuccess = false;
            error_log("YouTube attachment $attachmentId: Icon file not created or too small");
        }
    }
    
    // Обновляем запись в БД
    $iconFlag = $iconSuccess ? '1' : '0';
    $previewFlag = $previewSuccess ? '1' : '0';
    updateAttachmentFlags($attachmentId, $iconFlag, $previewFlag);
    
    // Обновляем статус
    $status = ($previewSuccess || $iconSuccess) ? 'ready' : 'unavailable';
    updateAttachmentStatus($attachmentId, $status);
    
    // Логируем результат
    error_log("YouTube attachment $attachmentId: preview=$previewSuccess, icon=$iconSuccess, status=$status");
    
    return $previewSuccess || $iconSuccess;
}

// Скачивает файл по URL
function downloadFile($url, $path) {
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'user_agent' => 'Mozilla/5.0 (compatible; Plasma/1.0)'
        ]
    ]);
    
    $content = @file_get_contents($url, false, $context);
    if ($content === false) {
        error_log("Failed to download from URL: $url");
        return false;
    }
    
    // Проверяем что контент не пустой и это изображение
    if (strlen($content) < 1024) {
        error_log("Downloaded content too small: " . strlen($content) . " bytes from $url");
        return false;
    }
    
    // Проверяем что это JPEG (начинается с FF D8 FF)
    if (substr($content, 0, 3) !== "\xFF\xD8\xFF") {
        error_log("Downloaded content is not a valid JPEG from $url");
        return false;
    }
    
    $result = file_put_contents($path, $content);
    if ($result === false) {
        error_log("Failed to write file to: $path");
        return false;
    }
    
    return true;
}

// Создает иконку 160x160 из превью (crop to fit)
function createIconFromPreview($previewPath, $iconPath) {
    if (!file_exists($previewPath)) {
        return false;
    }
    
    // Загружаем изображение
    $image = @imagecreatefromjpeg($previewPath);
    if (!$image) {
        return false;
    }
    
    // Получаем размеры
    $width = imagesx($image);
    $height = imagesy($image);
    
    // Создаем новое изображение 160x160
    $icon = imagecreatetruecolor(160, 160);
    
    // Вычисляем масштаб для заполнения всего пространства
    $scaleX = 160 / $width;
    $scaleY = 160 / $height;
    $scale = max($scaleX, $scaleY); // Берем больший масштаб
    
    // Вычисляем новые размеры после масштабирования
    $newWidth = $width * $scale;
    $newHeight = $height * $scale;
    
    // Вычисляем координаты для обрезки (центрируем)
    $srcX = ($newWidth - 160) / 2 / $scale;
    $srcY = ($newHeight - 160) / 2 / $scale;
    
    // Копируем и масштабируем с обрезкой
    imagecopyresampled($icon, $image, 0, 0, $srcX, $srcY, 160, 160, 160 / $scale, 160 / $scale);
    
    // Сохраняем
    $result = imagejpeg($icon, $iconPath, 90);
    
    // Освобождаем память
    imagedestroy($image);
    imagedestroy($icon);
    
    return $result;
}

// Получает аттачменты для сообщения
function getMessageAttachments($messageId) {
    global $mysqli;
    
    $sql = $mysqli->prepare('SELECT id FROM tbl_attachments WHERE id_message = ? ORDER BY created ASC');
    $sql->bind_param("i", $messageId);
    $sql->execute();
    $result = $sql->get_result();
    
    $attachments = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $attachments[] = $row['id'];
    }
    
    return $attachments;
}

// Ищет существующий аттачмент в сообщении
function findExistingAttachment($messageId, $type, $videoId) {
    global $mysqli;
    
    if ($type !== 'youtube') {
        return null;
    }
    
    $sql = $mysqli->prepare('
        SELECT id FROM tbl_attachments 
        WHERE id_message = ? AND type = ? AND source LIKE ? 
        LIMIT 1
    ');
    $pattern = '%' . $videoId . '%';
    $sql->bind_param("iss", $messageId, $type, $pattern);
    $sql->execute();
    $result = $sql->get_result();
    
    if ($row = mysqli_fetch_assoc($result)) {
        return $row['id'];
    }
    
    return null;
}

// Генерирует GUID
function generateGuid() {
    if (function_exists('com_create_guid')) {
        return trim(com_create_guid(), '{}');
    }
    
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// Обрабатывает аттачменты для сообщения
function processMessageAttachments($messageId, $message) {
    $attachments = [];
    
    // Находим YouTube ссылки
    $youtubeUrls = extractYouTubeUrls($message);
    
    foreach ($youtubeUrls as $url) {
        $videoId = getYouTubeCode($url);
        if ($videoId) {
            // Проверяем, есть ли уже такой аттачмент в этом сообщении
            $existingId = findExistingAttachment($messageId, 'youtube', $videoId);
            
            if ($existingId) {
                $attachments[] = $existingId;
            } else {
                // Создаем новый аттачмент
                $newId = createAttachment($messageId, 'youtube', $url, $videoId);
                if ($newId) {
                    $attachments[] = $newId;
                }
            }
        }
    }
    
    return $attachments;
}

// Обновляет JSON поле сообщения
function updateMessageJson($messageId, $attachments) {
    global $mysqli;
    
    $jsonData = [];
    if (!empty($attachments)) {
        $jsonData['attachments'] = $attachments;
    }
    
    $jsonString = !empty($jsonData) ? json_encode($jsonData, JSON_UNESCAPED_UNICODE) : null;
    
    if ($jsonString === false) {
        error_log("JSON encode failed for message $messageId");
        return false;
    }
    
    $sql = $mysqli->prepare('UPDATE tbl_messages SET json = ? WHERE id_message = ?');
    $sql->bind_param("si", $jsonString, $messageId);
    
    return $sql->execute();
}

// Получает аттачмент по ID
function getAttachmentById($attachmentId) {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        SELECT id, id_message, type, created, icon, preview, file, source, status 
        FROM tbl_attachments 
        WHERE id = ?
    ');
    $sql->bind_param("s", $attachmentId);
    $sql->execute();
    $result = $sql->get_result();
    
    if ($row = mysqli_fetch_assoc($result)) {
        return $row;
    }
    
    return null;
}

// Обновляет статус аттачмента
function updateAttachmentStatus($attachmentId, $status) {
    global $mysqli;
    
    $sql = $mysqli->prepare('UPDATE tbl_attachments SET status = ? WHERE id = ?');
    $sql->bind_param("ss", $status, $attachmentId);
    
    return $sql->execute();
}

// Обновляет пути к файлам аттачмента
function updateAttachmentPaths($attachmentId, $icon = null, $preview = null, $file = null) {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        UPDATE tbl_attachments 
        SET icon = COALESCE(?, icon), 
            preview = COALESCE(?, preview), 
            file = COALESCE(?, file) 
        WHERE id = ?
    ');
    $sql->bind_param("ssss", $icon, $preview, $file, $attachmentId);
    
    return $sql->execute();
}

// Обновляет флаги наличия файлов аттачмента (для воркера)
function updateAttachmentFlags($attachmentId, $hasIcon = false, $hasPreview = false) {
    global $mysqli;
    
    $iconValue = $hasIcon ? 1 : 0;
    $previewValue = $hasPreview ? 1 : 0;
    
    $sql = $mysqli->prepare('
        UPDATE tbl_attachments 
        SET icon = ?, preview = ? 
        WHERE id = ?
    ');
    $sql->bind_param("iis", $iconValue, $previewValue, $attachmentId);
    
    return $sql->execute();
}

// Создает папку для аттачмента
function createAttachmentFolder($attachmentId) {
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    
    // Определяем корневую папку проекта (папка, содержащая api/)
    $rootPath = dirname(dirname(__DIR__)); // Поднимаемся на 2 уровня от api/include/ до корня проекта
    $folderPath = $rootPath . "/attachments-new/$firstTwo/$nextTwo/";
    
    if (!is_dir($folderPath)) {
        // Пробуем создать папку с разными правами
        $permissions = [0755, 0777, 0775];
        $created = false;
        
        foreach ($permissions as $perm) {
            if (mkdir($folderPath, $perm, true)) {
                $created = true;
                error_log("Directory created successfully: $folderPath with permissions " . decoct($perm));
                break;
            }
        }
        
        if (!$created) {
            $error = error_get_last();
            error_log("Failed to create directory: $folderPath. Error: " . ($error ? $error['message'] : 'Unknown error'));
            return false;
        }
    }
    
    return $folderPath;
}

// === ФУНКЦИИ ДЛЯ ВОРКЕРА ===

// Обрабатывает аттачменты для воркера (без создания новых)
function processMessageAttachmentsForWorker($messageId, $message) {
    $attachments = [];
    
    // Находим YouTube ссылки
    $youtubeUrls = extractYouTubeUrls($message);
    
    foreach ($youtubeUrls as $url) {
        $videoId = getYouTubeCode($url);
        if ($videoId) {
            // Проверяем, есть ли уже такой аттачмент в этом сообщении
            $existingId = findExistingAttachment($messageId, 'youtube', $videoId);
            
            if ($existingId) {
                $attachments[] = $existingId;
            } else {
                // Создаем новый аттачмент
                $newId = createAttachment($messageId, 'youtube', $url, $videoId);
                if ($newId) {
                    $attachments[] = $newId;
                }
            }
        }
    }
    
    return $attachments;
}

// Получает сообщения без аттачментов (для воркера)
function getMessagesWithoutAttachments($limit = 100, $offset = 0) {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        SELECT m.id_message, m.message, m.json 
        FROM tbl_messages m 
        LEFT JOIN tbl_attachments a ON m.id_message = a.id_message 
        WHERE a.id IS NULL 
        AND m.message LIKE "%youtube%" 
        ORDER BY m.time_created DESC 
        LIMIT ? OFFSET ?
    ');
    $sql->bind_param("ii", $limit, $offset);
    $sql->execute();
    $result = $sql->get_result();
    
    $messages = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $messages[] = $row;
    }
    
    return $messages;
}

// Получает количество сообщений без аттачментов
function getCountMessagesWithoutAttachments() {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        SELECT COUNT(*) as count 
        FROM tbl_messages m 
        LEFT JOIN tbl_attachments a ON m.id_message = a.id_message 
        WHERE a.id IS NULL 
        AND m.message LIKE "%youtube%"
    ');
    $sql->execute();
    $result = $sql->get_result();
    $row = mysqli_fetch_assoc($result);
    
    return $row['count'];
}

// Получает общее количество сообщений
function getCountAllMessages() {
    global $mysqli;
    
    $sql = $mysqli->prepare('SELECT COUNT(*) as count FROM tbl_messages');
    $sql->execute();
    $result = $sql->get_result();
    $row = mysqli_fetch_assoc($result);
    
    return $row['count'];
}

// Получает прогресс обработки для воркера
function getWorkerProgress() {
    $total = getCountAllMessages();
    $withoutAttachments = getCountMessagesWithoutAttachments();
    $processed = $total - $withoutAttachments;
    
    return [
        'total' => $total,
        'processed' => $processed,
        'remaining' => $withoutAttachments,
        'percentage' => $total > 0 ? round(($processed / $total) * 100, 2) : 0
    ];
}

// Безопасное декодирование JSON
function safeJsonDecode($jsonString) {
    if (empty($jsonString)) {
        return null;
    }
    
    $decoded = json_decode($jsonString, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log("JSON decode error: " . json_last_error_msg() . " for string: " . substr($jsonString, 0, 100));
        return null;
    }
    
    return $decoded;
}

// Валидация JSON в базе данных
function validateJsonInDatabase($limit = 1000) {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        SELECT id_message, json 
        FROM tbl_messages 
        WHERE json IS NOT NULL 
        LIMIT ?
    ');
    $sql->bind_param("i", $limit);
    $sql->execute();
    $result = $sql->get_result();
    
    $problems = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $decoded = safeJsonDecode($row['json']);
        if ($decoded === null) {
            $problems[] = [
                'id_message' => $row['id_message'],
                'json' => $row['json'],
                'error' => 'Invalid JSON'
            ];
        }
    }
    
    return $problems;
}

// Получает количество сообщений с JSON
function getCountMessagesWithJson() {
    global $mysqli;
    
    $sql = $mysqli->prepare('SELECT COUNT(*) as count FROM tbl_messages WHERE json IS NOT NULL');
    $sql->execute();
    $result = $sql->get_result();
    $row = mysqli_fetch_assoc($result);
    
    return $row['count'];
}

// Анализирует размеры JSON полей
function analyzeJsonSizes() {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        SELECT 
            AVG(LENGTH(json)) as avg_size,
            MAX(LENGTH(json)) as max_size,
            MIN(LENGTH(json)) as min_size
        FROM tbl_messages 
        WHERE json IS NOT NULL
    ');
    $sql->execute();
    $result = $sql->get_result();
    $row = mysqli_fetch_assoc($result);
    
    return [
        'average' => $row['avg_size'] ?: 0,
        'max' => $row['max_size'] ?: 0,
        'min' => $row['min_size'] ?: 0
    ];
}
?>
