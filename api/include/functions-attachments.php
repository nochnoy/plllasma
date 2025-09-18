<?
// Функции для работы с новой системой аттачментов

require_once 'functions-logging.php';

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
function createAttachment($messageId, $type, $source = null, $videoId = null, $filename = null) {
    global $mysqli;
    
    $id = guid();
    $created = date('Y-m-d H:i:s');
    
    // Обрабатываем имя файла безопасно
    $safeFilename = $filename ? sanitizeFilename($filename) : null;
    
    $sql = $mysqli->prepare('
        INSERT INTO tbl_attachments (id, id_message, type, created, source, filename, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $status = 'pending';
    $sql->bind_param("sisssss", $id, $messageId, $type, $created, $source, $safeFilename, $status);
    
    if ($sql->execute()) {
        error_log("Attachment created in DB: $id, type: $type, filename: $safeFilename, videoId: $videoId");
        // Если это YouTube аттачмент, сразу скачиваем превью и иконку
        if ($type === 'youtube' && $videoId) {
            error_log("Starting YouTube assets download for: $id, videoId: $videoId");
            downloadYouTubeAssets($id, $videoId);
        }
        return $id;
    } else {
        error_log("Failed to create attachment in DB: " . $mysqli->error);
    }
    
    return null;
}

// Скачивает превью и иконку для YouTube видео
function downloadYouTubeAssets($attachmentId, $videoId) {
    // Создаем папку для файлов
    $folderPath = createAttachmentFolder($attachmentId);
    if (!$folderPath) {
        error_log("YouTube attachment $attachmentId: Failed to create folder");
        return false;
    }
    
    // Получаем текущие версии из БД
    global $mysqli;
    $stmt = $mysqli->prepare("SELECT icon, preview FROM tbl_attachments WHERE id = ?");
    $stmt->bind_param("s", $attachmentId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    if (!$row) {
        error_log("YouTube attachment $attachmentId: Not found in DB");
        return false;
    }
    
    // Вычисляем новые версии
    $previewVersion = max(1, $row['preview'] + 1);
    $iconVersion = max(1, $row['icon'] + 1);
    
    // Строим пути к файлам
    $previewPath = buildAttachmentPreviewPhysicalPath($attachmentId, $previewVersion);
    $iconPath = buildAttachmentIconPhysicalPath($attachmentId, $iconVersion);
    
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
    
    // Обновляем версии файлов в БД
    updateAttachmentVersions($attachmentId, $iconSuccess, $previewSuccess);
    
    // Обновляем статус
    $status = ($previewSuccess || $iconSuccess) ? 'ready' : 'unavailable';
    updateAttachmentStatus($attachmentId, $status);
    
    // Логируем результат
    error_log("YouTube attachment $attachmentId: preview=$previewSuccess (v$previewVersion), icon=$iconSuccess (v$iconVersion), status=$status");
    
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


// Обрабатывает аттачменты для сообщения
function processMessageAttachments($messageId, $message) {
    $attachments = [];
    
    // Находим YouTube ссылки
    $youtubeUrls = extractYouTubeUrls($message);
    error_log("[YOUTUBE] URLs found: " . json_encode($youtubeUrls) . " for message $messageId");
    
    foreach ($youtubeUrls as $url) {
        $videoId = getYouTubeCode($url);
        error_log("[YOUTUBE] Video ID extracted: $videoId from URL: $url");
        if ($videoId) {
            // Проверяем, есть ли уже такой аттачмент в этом сообщении
            $existingId = findExistingAttachment($messageId, 'youtube', $videoId);
            
            if ($existingId) {
                error_log("[YOUTUBE] Existing YouTube attachment found: $existingId");
                $attachments[] = $existingId;
            } else {
                // Создаем новый аттачмент
                error_log("[YOUTUBE] Creating new YouTube attachment for video ID: $videoId");
                $newId = createAttachment($messageId, 'youtube', $url, $videoId);
                if ($newId) {
                    error_log("[YOUTUBE] YouTube attachment created successfully: $newId");
                    $attachments[] = $newId;
                } else {
                    error_log("[YOUTUBE] Failed to create YouTube attachment for video ID: $videoId");
                }
            }
        }
    }
    
    error_log("[YOUTUBE] Total attachments processed: " . count($attachments));
    return $attachments;
}

// Обновляет JSON поле сообщения
function updateMessageJson($messageId, $attachments) {
    global $mysqli;
    
    if (empty($attachments)) {
        return true; // Нет аттачментов - ничего не делаем
    }
    
    // Получаем полные данные об аттачментах
    $fullAttachments = [];
    foreach ($attachments as $attachmentId) {
        $attachment = getAttachmentById($attachmentId);
        if ($attachment) {
            $fullAttachments[] = [
                'id' => $attachment['id'],
                'type' => $attachment['type'],
                'created' => $attachment['created'],
                'icon' => (int)$attachment['icon'],
                'preview' => (int)$attachment['preview'],
                'file' => (int)$attachment['file'],
                'filename' => $attachment['filename'],
                'source' => $attachment['source'],
                'status' => $attachment['status'],
                'views' => (int)$attachment['views'],
                'downloads' => (int)$attachment['downloads'],
                'size' => (int)$attachment['size']
            ];
        }
    }
    
    $jsonData = ['newAttachments' => $fullAttachments];
    $jsonString = json_encode($jsonData, JSON_UNESCAPED_UNICODE);
    
    if ($jsonString === false) {
        error_log("[YOUTUBE] JSON encode failed for message $messageId");
        return false;
    }
    
    error_log("[YOUTUBE] Updating message $messageId JSON: $jsonString");
    
    $sql = $mysqli->prepare('UPDATE tbl_messages SET json = ? WHERE id_message = ?');
    $sql->bind_param("si", $jsonString, $messageId);
    
    $result = $sql->execute();
    error_log("[YOUTUBE] JSON update result for message $messageId: " . ($result ? 'success' : 'failed'));
    
    return $result;
}

// Получает аттачмент по ID с построенными путями
function getAttachmentById($attachmentId) {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        SELECT id, id_message, type, created, icon, preview, file, filename, source, status, views, downloads, size 
        FROM tbl_attachments 
        WHERE id = ?
    ');
    $sql->bind_param("s", $attachmentId);
    $sql->execute();
    $result = $sql->get_result();
    
    if ($row = mysqli_fetch_assoc($result)) {
        // Добавляем построенные пути к файлам
        $row['icon_path'] = buildAttachmentIconPath($attachmentId, $row['icon']);
        $row['preview_path'] = buildAttachmentPreviewPath($attachmentId, $row['preview']);
        $row['file_path'] = buildAttachmentFilePath($attachmentId, $row['file'], $row['filename']);
        
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

// Обновляет имя файла аттачмента
function updateAttachmentFilename($attachmentId, $filename) {
    global $mysqli;
    
    // Обрабатываем длинное имя файла
    $safeFilename = sanitizeFilename($filename);
    
    $sql = $mysqli->prepare('
        UPDATE tbl_attachments 
        SET filename = ?
        WHERE id = ?
    ');
    $sql->bind_param("ss", $safeFilename, $attachmentId);
    
    return $sql->execute();
}

// Безопасно обрабатывает имя файла
function sanitizeFilename($filename) {
    if (!$filename) return null;
    
    // Удаляем опасные символы
    $filename = preg_replace('/[<>:"\\/\\\\|?*]/', '_', $filename);
    
    // Если имя слишком длинное, обрезаем, сохраняя расширение
    if (mb_strlen($filename) > 200) { // Оставляем запас для расширения
        $pathinfo = pathinfo($filename);
        $extension = isset($pathinfo['extension']) ? '.' . $pathinfo['extension'] : '';
        $basename = $pathinfo['filename'];
        
        // Обрезаем базовое имя, оставляя место для расширения
        $maxBasenameLength = 200 - mb_strlen($extension);
        $basename = mb_substr($basename, 0, $maxBasenameLength);
        
        $filename = $basename . $extension;
    }
    
    return $filename;
}

// Обновляет версии файлов аттачмента (инкрементирует для борьбы с кешированием)
function updateAttachmentVersions($attachmentId, $hasIcon = false, $hasPreview = false, $hasFile = false) {
    global $mysqli;
    
    // Получаем текущие версии
    $checkStmt = $mysqli->prepare("SELECT icon, preview, file FROM tbl_attachments WHERE id = ?");
    $checkStmt->bind_param("s", $attachmentId);
    $checkStmt->execute();
    $result = $checkStmt->get_result();
    $row = $result->fetch_assoc();
    
    if (!$row) {
        return false;
    }
    
    // Инкрементируем версии для файлов, которые были созданы/обновлены
    $iconVersion = $hasIcon ? max(1, $row['icon'] + 1) : $row['icon'];
    $previewVersion = $hasPreview ? max(1, $row['preview'] + 1) : $row['preview'];
    $fileVersion = $hasFile ? max(1, $row['file'] + 1) : $row['file'];
    
    $sql = $mysqli->prepare('
        UPDATE tbl_attachments 
        SET icon = ?, preview = ?, file = ?
        WHERE id = ?
    ');
    $sql->bind_param("iiis", $iconVersion, $previewVersion, $fileVersion, $attachmentId);
    
    return $sql->execute();
}

// Строит путь к иконке аттачмента
function buildAttachmentIconPath($attachmentId, $version) {
    if ($version <= 0) return null;
    
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    
    return "/attachments-new/$firstTwo/$nextTwo/$attachmentId-$version-i.jpg";
}

// Строит путь к превью аттачмента
function buildAttachmentPreviewPath($attachmentId, $version) {
    if ($version <= 0) return null;
    
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    
    return "/attachments-new/$firstTwo/$nextTwo/$attachmentId-$version-p.jpg";
}

// Строит путь к файлу аттачмента
function buildAttachmentFilePath($attachmentId, $version, $filename) {
    if ($version <= 0 || !$filename) return null;
    
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    $extension = pathinfo($filename, PATHINFO_EXTENSION);
    
    return "/attachments-new/$firstTwo/$nextTwo/$attachmentId-$version.$extension";
}

// Строит физический путь к иконке аттачмента
function buildAttachmentIconPhysicalPath($attachmentId, $version) {
    if ($version <= 0) return null;
    
    $folderPath = createAttachmentFolder($attachmentId);
    if (!$folderPath) return null;
    
    return $folderPath . $attachmentId . "-$version-i.jpg";
}

// Строит физический путь к превью аттачмента
function buildAttachmentPreviewPhysicalPath($attachmentId, $version) {
    if ($version <= 0) return null;
    
    $folderPath = createAttachmentFolder($attachmentId);
    if (!$folderPath) return null;
    
    return $folderPath . $attachmentId . "-$version-p.jpg";
}

// Строит физический путь к файлу аттачмента
function buildAttachmentFilePhysicalPath($attachmentId, $version, $filename) {
    if ($version <= 0 || !$filename) return null;
    
    $folderPath = createAttachmentFolder($attachmentId);
    if (!$folderPath) return null;
    
    $extension = pathinfo($filename, PATHINFO_EXTENSION);
    return $folderPath . $attachmentId . "-$version.$extension";
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
