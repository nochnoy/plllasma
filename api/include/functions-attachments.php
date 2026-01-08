<?
// Функции для работы с новой системой аттачментов

require_once 'functions-logging.php';

// Извлекает код YouTube из URL
function getYouTubeCode($url) {
    $patterns = [
        '/youtube\.com\/watch.*[?&]v=([a-zA-Z0-9_-]+)/',  // watch?v=... или watch?feature=...&v=...
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

// Получает id_place канала, которому принадлежит аттачмент
function getAttachmentPlaceId($attachmentId) {
    global $mysqli;
    
    $sql = $mysqli->prepare('
        SELECT m.id_place 
        FROM tbl_attachments a
        JOIN tbl_messages m ON a.id_message = m.id_message
        WHERE a.id = ?
    ');
    $sql->bind_param("s", $attachmentId);
    $sql->execute();
    $result = $sql->get_result();
    
    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        return $row['id_place'];
    }
    
    return null;
}

// Извлекает все YouTube ссылки из текста
function extractYouTubeUrls($text) {
    // Декодируем HTML entities (например &amp; -> &)
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    
    $urls = [];
    $pattern = '/https?:\/\/[^\s<>"]+/';
    
    if (preg_match_all($pattern, $text, $matches)) {
        foreach ($matches[0] as $url) {
            // Декодируем HTML entities в URL на всякий случай
            $url = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            
            if (isYouTubeUrl($url)) {
                $urls[] = $url;
            }
        }
    }
    
    return array_unique($urls);
}

// Создает новый аттачмент
function createAttachment($messageId, $type, $source = null, $videoId = null, $filename = null, $created = null) {
    global $mysqli;
    
    $id = guid();
    // Если дата создания не передана, используем текущую
    if ($created === null) {
        $created = date('Y-m-d H:i:s');
    }
    
    // Обрабатываем имя файла безопасно
    $safeFilename = $filename ? sanitizeFilename($filename) : null;
    
    $sql = $mysqli->prepare('
        INSERT INTO tbl_attachments (id, id_message, type, created, source, filename, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    // Определяем статус: pending только для видео файлов, ready для остальных
    $status = ($type === 'video') ? 'pending' : 'ready';
    $sql->bind_param("sisssss", $id, $messageId, $type, $created, $source, $safeFilename, $status);
    
    if ($sql->execute()) {
        logInfo("Attachment created in DB: $id, type: $type, filename: $safeFilename, videoId: $videoId", 'attachments');
        // Если это YouTube аттачмент, сразу скачиваем превью и иконку
        if ($type === 'youtube' && $videoId) {
            logYouTube("Starting YouTube assets download for: $id, videoId: $videoId");
            $downloadSuccess = downloadYouTubeAssets($id, $videoId);
            
            // Если не удалось скачать иконку, удаляем аттачмент
            if (!$downloadSuccess) {
                logYouTube("YouTube attachment $id: Failed to download assets, deleting attachment", 'WARNING');
                $deleteSql = $mysqli->prepare('DELETE FROM tbl_attachments WHERE id = ?');
                $deleteSql->bind_param("s", $id);
                $deleteSql->execute();
                return null;
            }
        }
        return $id;
    } else {
        logError("Failed to create attachment in DB: " . $mysqli->error, 'attachments');
    }
    
    return null;
}

// Скачивает превью и иконку для YouTube видео
// Возвращает true только если удалось создать хотя бы иконку
function downloadYouTubeAssets($attachmentId, $videoId) {
    global $mysqli;
    
    // Получаем информацию о видео с YouTube API
    $infoUrl = "http://194.135.33.47:5000/api/info/" . $videoId;
    $infoResponse = @file_get_contents($infoUrl);
    
    if ($infoResponse) {
        $info = json_decode($infoResponse, true);
        if ($info && !isset($info['error'])) {
            $title = $info['title'] ?? null;
            $duration = isset($info['duration']) ? intval($info['duration']) * 1000 : null; // Конвертируем секунды в миллисекунды
            
            // Проверяем наличие столбца duration (для обратной совместимости)
            $checkResult = $mysqli->query("SHOW COLUMNS FROM tbl_attachments LIKE 'duration'");
            $hasDurationColumn = $checkResult && $checkResult->num_rows > 0;
            
            // Сохраняем title и duration в БД
            if ($title || ($duration !== null && $hasDurationColumn)) {
                if ($hasDurationColumn) {
                    $updateSql = $mysqli->prepare("UPDATE tbl_attachments SET title = ?, duration = ? WHERE id = ?");
                    $updateSql->bind_param("sis", $title, $duration, $attachmentId);
                } else {
                    // Если столбца duration нет - обновляем только title
                    $updateSql = $mysqli->prepare("UPDATE tbl_attachments SET title = ? WHERE id = ?");
                    $updateSql->bind_param("ss", $title, $attachmentId);
                }
                $updateSql->execute();
                
                if ($hasDurationColumn) {
                    logYouTube("YouTube attachment $attachmentId: Saved info - title: " . ($title ?? 'null') . ", duration: " . ($duration ?? 'null') . "ms");
                } else {
                    logYouTube("YouTube attachment $attachmentId: Saved title (duration column not exists yet): " . ($title ?? 'null'));
                }
            }
        } else {
            logYouTube("YouTube attachment $attachmentId: Failed to get video info, API returned error", 'WARNING');
        }
    } else {
        logYouTube("YouTube attachment $attachmentId: Failed to fetch video info from API", 'WARNING');
    }
    
    // Создаем папку для файлов
    $folderPath = createAttachmentFolder($attachmentId);
    if (!$folderPath) {
        logYouTube("YouTube attachment $attachmentId: Failed to create folder", 'ERROR');
        return false;
    }
    
    // Получаем текущие версии из БД
    $stmt = $mysqli->prepare("SELECT icon, preview FROM tbl_attachments WHERE id = ?");
    $stmt->bind_param("s", $attachmentId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    if (!$row) {
        logYouTube("YouTube attachment $attachmentId: Not found in DB", 'ERROR');
        return false;
    }
    
    // Вычисляем новые версии
    $previewVersion = max(1, $row['preview'] + 1);
    $iconVersion = max(1, $row['icon'] + 1);
    
    // Строим пути к файлам
    $previewPath = buildAttachmentPreviewPhysicalPath($attachmentId, $previewVersion);
    $iconPath = buildAttachmentIconPhysicalPath($attachmentId, $iconVersion);
    
    // Скачиваем storyboard preview (с раздвинутыми кадрами)
    $previewUrl = "http://194.135.33.47:5000/api/preview/" . $videoId;
    $previewSuccess = downloadFile($previewUrl, $previewPath);
    
    // Дополнительная проверка: файл действительно существует и не пустой
    if ($previewSuccess && (!file_exists($previewPath) || filesize($previewPath) < 1024)) {
        $previewSuccess = false;
        logYouTube("YouTube attachment $attachmentId: Preview file not created or too small", 'WARNING');
    }
    
    // Скачиваем обычное превью для создания иконки (БЕЗ раздвинутых кадров!)
    $iconSourceUrl = "http://194.135.33.47:5000/api/icon/" . $videoId;
    $iconSourcePath = $folderPath . $attachmentId . "-temp-icon-source.jpg";
    $iconSourceSuccess = downloadFile($iconSourceUrl, $iconSourcePath);
    
    // Создаем иконку 160x160 из обычного превью
    $iconSuccess = false;
    if ($iconSourceSuccess && file_exists($iconSourcePath)) {
        $iconSuccess = createIconFromPreview($iconSourcePath, $iconPath);
        
        // Удаляем временный файл
        @unlink($iconSourcePath);
        
        // Дополнительная проверка иконки
        if ($iconSuccess && (!file_exists($iconPath) || filesize($iconPath) < 1024)) {
            $iconSuccess = false;
            logYouTube("YouTube attachment $attachmentId: Icon file not created or too small", 'WARNING');
        }
    }
    
    // Если не удалось создать иконку, удаляем превью и возвращаем false
    if (!$iconSuccess) {
        logYouTube("YouTube attachment $attachmentId: Failed to create icon, deleting preview if exists", 'WARNING');
        if ($previewSuccess && file_exists($previewPath)) {
            unlink($previewPath);
        }
        updateAttachmentStatus($attachmentId, 'unavailable');
        return false;
    }
    
    // Обновляем версии файлов в БД
    updateAttachmentVersions($attachmentId, $iconSuccess, $previewSuccess);
    
    // Обновляем статус
    updateAttachmentStatus($attachmentId, 'ready');
    
    // Логируем результат
    logYouTube("YouTube attachment $attachmentId: preview=$previewSuccess (v$previewVersion), icon=$iconSuccess (v$iconVersion), status=ready");
    
    return true;
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
        logYouTube("Failed to download from URL: $url", 'ERROR');
        return false;
    }
    
    // Проверяем что контент не пустой и это изображение
    if (strlen($content) < 1024) {
        logYouTube("Downloaded content too small: " . strlen($content) . " bytes from $url", 'WARNING');
        return false;
    }
    
    // Проверяем что это JPEG (начинается с FF D8 FF)
    if (substr($content, 0, 3) !== "\xFF\xD8\xFF") {
        logYouTube("Downloaded content is not a valid JPEG from $url", 'WARNING');
        return false;
    }
    
    $result = file_put_contents($path, $content);
    if ($result === false) {
        logError("Failed to write file to: $path", 'attachments');
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
    logYouTube("URLs found: " . json_encode($youtubeUrls) . " for message $messageId");
    
    foreach ($youtubeUrls as $url) {
        $videoId = getYouTubeCode($url);
        logYouTube("Video ID extracted: $videoId from URL: $url");
        if ($videoId) {
            // Проверяем, есть ли уже такой аттачмент в этом сообщении
            $existingId = findExistingAttachment($messageId, 'youtube', $videoId);
            
            if ($existingId) {
                logYouTube("Existing YouTube attachment found: $existingId");
                $attachments[] = $existingId;
            } else {
                // Создаем новый аттачмент
                logYouTube("Creating new YouTube attachment for video ID: $videoId");
                $newId = createAttachment($messageId, 'youtube', $url, $videoId);
                if ($newId) {
                    logYouTube("YouTube attachment created successfully: $newId");
                    $attachments[] = $newId;
                } else {
                    logYouTube("Failed to create YouTube attachment for video ID: $videoId", 'WARNING');
                }
            }
        }
    }
    
    logYouTube("Total attachments processed: " . count($attachments));
    return $attachments;
}

// Обновляет JSON поле сообщения
function updateMessageJson($messageId, $attachments) {
    global $mysqli;
    
    if (empty($attachments)) {
        return true; // Нет аттачментов - ничего не делаем
    }

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
                'size' => (int)$attachment['size'],
                's3' => isset($attachment['s3']) ? (int)$attachment['s3'] : 0
            ];
        }
    }
    
    $jsonData = ['j' => $fullAttachments];
    $jsonString = json_encode($jsonData, JSON_UNESCAPED_UNICODE);
    
    if ($jsonString === false) {
        logError("JSON encode failed for message $messageId", 'attachments');
        return false;
    }
    
    logInfo("Updating message $messageId JSON: $jsonString", 'attachments');
    
    $sql = $mysqli->prepare('UPDATE tbl_messages SET json = ? WHERE id_message = ?');
    $sql->bind_param("si", $jsonString, $messageId);
    
    $result = $sql->execute();
    logInfo("JSON update result for message $messageId: " . ($result ? 'success' : 'failed'), 'attachments');
    
    return $result;
}

// Получает аттачмент по ID с построенными путями
function getAttachmentById($attachmentId) {
    global $mysqli;
    
    // Проверяем наличие столбца duration (для обратной совместимости)
    static $hasDurationColumn = null;
    if ($hasDurationColumn === null) {
        $checkResult = $mysqli->query("SHOW COLUMNS FROM tbl_attachments LIKE 'duration'");
        $hasDurationColumn = $checkResult && $checkResult->num_rows > 0;
    }
    
    $columns = 'id, id_message, type, created, icon, preview, file, filename, title, source, status, views, downloads, size, s3';
    if ($hasDurationColumn) {
        $columns .= ', duration';
    }
    
    $sql = $mysqli->prepare("
        SELECT $columns 
        FROM tbl_attachments 
        WHERE id = ?
    ");
    $sql->bind_param("s", $attachmentId);
    $sql->execute();
    $result = $sql->get_result();
    
    if ($row = mysqli_fetch_assoc($result)) {
        // Добавляем построенные пути к файлам
        $row['icon_path'] = buildAttachmentIconPath($attachmentId, $row['icon']);
        $row['preview_path'] = buildAttachmentPreviewPath($attachmentId, $row['preview']);
        $row['file_path'] = buildAttachmentFilePath($attachmentId, $row['file'], $row['filename']);
        
        // Если столбца duration нет - добавляем null для совместимости с фронтендом
        if (!$hasDurationColumn) {
            $row['duration'] = null;
        }
        
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
        $extension = isset($pathinfo['extension']) ? '.' . strtolower($pathinfo['extension']) : '';
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
    
    return getAttachmentPath($attachmentId, $version, 'i', 'jpg');
}

// Строит путь к превью аттачмента
function buildAttachmentPreviewPath($attachmentId, $version) {
    if ($version <= 0) return null;
    
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    
    return getAttachmentPath($attachmentId, $version, 'p', 'jpg');
}

// Строит путь к файлу аттачмента
function buildAttachmentFilePath($attachmentId, $version, $filename) {
    if ($version <= 0 || !$filename) return null;
    
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    
    return getAttachmentPath($attachmentId, $version, '', $extension);
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
    
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    return $folderPath . $attachmentId . "-$version.$extension";
}

// Создает папку для аттачмента
function createAttachmentFolder($attachmentId) {
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    
    // Определяем корневую папку проекта (папка, содержащая api/)
    $rootPath = dirname(dirname(__DIR__)); // Поднимаемся на 2 уровня от api/include/ до корня проекта
    $folderPath = $rootPath . "/a/$firstTwo/$nextTwo/";
    
    if (!is_dir($folderPath)) {
        // Пробуем создать папку с разными правами
        $permissions = [0755, 0777, 0775];
        $created = false;
        
        foreach ($permissions as $perm) {
            if (mkdir($folderPath, $perm, true)) {
                $created = true;
                logInfo("Directory created successfully: $folderPath with permissions " . decoct($perm), 'attachments');
                break;
            }
        }
        
        if (!$created) {
            $error = error_get_last();
            logError("Failed to create directory: $folderPath. Error: " . ($error ? $error['message'] : 'Unknown error'), 'attachments');
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
        logError("JSON decode error: " . json_last_error_msg() . " for string: " . substr($jsonString, 0, 100), 'attachments');
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

/**
 * Получает путь к файлу аттачмента по его ID
 * @param string $attachmentId ID аттачмента
 * @param int $version Версия файла (по умолчанию 1)
 * @param string $suffix Суффикс файла (по умолчанию пустой)
 * @param string $extension Расширение файла (по умолчанию определяется автоматически)
 * @return string Путь к файлу аттачмента
 */
function getAttachmentPath($attachmentId, $version = 1, $suffix = '', $extension = '') {
    $xx = substr($attachmentId, 0, 2);
    $yy = substr($attachmentId, 2, 2);
    
    $filename = $attachmentId . '-' . $version;
    if ($suffix) {
        $filename .= '-' . $suffix;
    }
    if ($extension) {
        $filename .= '.' . $extension;
    }
    
    return "/a/{$xx}/{$yy}/{$filename}";
}

/**
 * Получает полный URL к файлу аттачмента
 * @param string $attachmentId ID аттачмента
 * @param int $version Версия файла (по умолчанию 1)
 * @param string $suffix Суффикс файла (по умолчанию пустой)
 * @param string $extension Расширение файла (по умолчанию определяется автоматически)
 * @return string Полный URL к файлу аттачмента
 */
function getAttachmentUrl($attachmentId, $version = 1, $suffix = '', $extension = '') {
    return getAttachmentPath($attachmentId, $version, $suffix, $extension);
}

/**
 * Определяет тип файла
 * @param string $filePath Путь к файлу
 * @param string $mimeType MIME тип файла (опционально)
 * @return string Тип аттачмента (file, image, video)
 */
function detectAttachmentType($filePath, $mimeType = null) {
    // Определяем MIME тип если не передан
    if (!$mimeType && file_exists($filePath)) {
        $mimeType = mime_content_type($filePath);
    }
    
    // Проверяем, является ли файл видео (используем проработанную функцию)
    if (isVideoFile($filePath, $mimeType)) {
        return 'video';
    }
    
    // Проверяем, является ли файл изображением
    if ($mimeType && strpos($mimeType, 'image/') === 0) {
        return 'image';
    }
    
    // Дополнительная проверка изображений по расширению
    $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $imageExtensions = ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'bmp', 'webp'];
    
    if (in_array($extension, $imageExtensions)) {
        return 'image';
    }
    
    // Все остальное - файлы
    return 'file';
}

/**
 * Обрабатывает YouTube ссылки в сообщении: удаляет старые YouTube аттачменты и создает новые
 * @param int $messageId ID сообщения
 * @return array Результат обработки ['success' => bool, 'created' => int, 'deleted' => int, 'error' => string]
 */
function youtubizeMessage($messageId) {
    global $mysqli;
    
    logYouTube("Starting youtubize for message $messageId");
    
    // Получаем сообщение
    $sql = $mysqli->prepare('SELECT id_place, message, json FROM tbl_messages WHERE id_message = ?');
    $sql->bind_param("i", $messageId);
    $sql->execute();
    $result = $sql->get_result();
    
    if (!$result || $result->num_rows === 0) {
        logYouTube("Message $messageId not found", 'ERROR');
        return [
            'success' => false,
            'error' => 'Message not found',
            'created' => 0,
            'deleted' => 0
        ];
    }
    
    $row = $result->fetch_assoc();
    $messageText = $row['message'];
    
    // Извлекаем YouTube ссылки из текста
    $youtubeUrls = extractYouTubeUrls($messageText);
    
    if (empty($youtubeUrls)) {
        logYouTube("No YouTube links found in message $messageId", 'WARNING');
        return [
            'success' => false,
            'error' => 'No YouTube links found in message',
            'created' => 0,
            'deleted' => 0
        ];
    }
    
    logYouTube("Found " . count($youtubeUrls) . " YouTube links in message $messageId");
    
    // Удаляем существующие YouTube аттачменты для этого сообщения
    $deleteSql = $mysqli->prepare('SELECT id, icon, preview FROM tbl_attachments WHERE id_message = ? AND type = ?');
    $type = 'youtube';
    $deleteSql->bind_param("is", $messageId, $type);
    $deleteSql->execute();
    $deleteResult = $deleteSql->get_result();
    
    $deletedCount = 0;
    while ($attachmentRow = $deleteResult->fetch_assoc()) {
        $attachmentId = $attachmentRow['id'];
        
        // Удаляем файлы аттачмента
        if ($attachmentRow['icon'] > 0) {
            $iconPath = buildAttachmentIconPhysicalPath($attachmentId, $attachmentRow['icon']);
            if ($iconPath && file_exists($iconPath)) {
                unlink($iconPath);
                logYouTube("Deleted icon: $iconPath");
            }
        }
        
        if ($attachmentRow['preview'] > 0) {
            $previewPath = buildAttachmentPreviewPhysicalPath($attachmentId, $attachmentRow['preview']);
            if ($previewPath && file_exists($previewPath)) {
                unlink($previewPath);
                logYouTube("Deleted preview: $previewPath");
            }
        }
        
        $deletedCount++;
    }
    
    // Удаляем записи из БД
    $deleteRecordsSql = $mysqli->prepare('DELETE FROM tbl_attachments WHERE id_message = ? AND type = ?');
    $deleteRecordsSql->bind_param("is", $messageId, $type);
    $deleteRecordsSql->execute();
    
    logYouTube("Deleted $deletedCount existing YouTube attachments for message $messageId");
    
    // Обрабатываем YouTube ссылки и создаем новые аттачменты
    $attachments = processMessageAttachments($messageId, $messageText);
    
    if (empty($attachments)) {
        logYouTube("Failed to create YouTube attachments for message $messageId", 'WARNING');
        return [
            'success' => false,
            'error' => 'Failed to create YouTube attachments',
            'created' => 0,
            'deleted' => $deletedCount
        ];
    }
    
    // Обновляем JSON поле сообщения
    if (!updateMessageJson($messageId, $attachments)) {
        logYouTube("Failed to update message JSON for message $messageId", 'ERROR');
        return [
            'success' => false,
            'error' => 'Failed to update message JSON',
            'created' => count($attachments),
            'deleted' => $deletedCount
        ];
    }
    
    logYouTube("Successfully created " . count($attachments) . " YouTube attachments for message $messageId");
    
    return [
        'success' => true,
        'created' => count($attachments),
        'deleted' => $deletedCount
    ];
}

/**
 * Мигрирует старые аттачменты сообщения в новую систему
 * @param int $messageId ID сообщения
 * @return array Результат миграции
 */
function migrateMessageAttachments($messageId) {
    global $mysqli;
    
    logAttachmentMigration("=== Starting migration for message $messageId ===");
    
    // Получаем информацию о сообщении
    $sql = $mysqli->prepare('SELECT id_place, attachments, json, time_created FROM tbl_messages WHERE id_message = ?');
    $sql->bind_param("i", $messageId);
    $sql->execute();
    $result = $sql->get_result();
    
    if (!$result || $result->num_rows === 0) {
        logAttachmentMigration("Message $messageId not found", 'ERROR');
        return [
            'success' => false,
            'error' => 'Message not found'
        ];
    }
    
    $row = $result->fetch_assoc();
    $placeId = $row['id_place'];
    $oldAttachmentsCount = intval($row['attachments']);
    $messageCreated = $row['time_created']; // Дата создания сообщения
    
    logAttachmentMigration("Message found: placeId=$placeId, old attachments count=$oldAttachmentsCount, created=$messageCreated");
    
    // Проверяем наличие старых аттачментов
    if ($oldAttachmentsCount <= 0) {
        logAttachmentMigration("No old attachments found for message $messageId");
        return [
            'success' => false,
            'error' => 'No old attachments found'
        ];
    }
    
    $rootPath = dirname(dirname(__DIR__));
    $oldAttachmentsPath = $rootPath . '/attachments/' . $placeId . '/';
    
    if (!is_dir($oldAttachmentsPath)) {
        logAttachmentMigration("Old attachments directory not found: $oldAttachmentsPath", 'ERROR');
        return [
            'success' => false,
            'error' => 'Old attachments directory not found'
        ];
    }
    
    logAttachmentMigration("Old attachments directory: $oldAttachmentsPath");
    
    // Удаляем существующие новые аттачменты этого сообщения
    logAttachmentMigration("Deleting existing new attachments...");
    
    // Сначала получаем список существующих аттачментов для удаления их файлов
    $existingSql = $mysqli->prepare('SELECT id, icon, preview, file, filename FROM tbl_attachments WHERE id_message = ?');
    $existingSql->bind_param("i", $messageId);
    $existingSql->execute();
    $existingResult = $existingSql->get_result();
    
    $deletedFilesCount = 0;
    while ($existingRow = $existingResult->fetch_assoc()) {
        $existingId = $existingRow['id'];
        logAttachmentMigration("Deleting files for existing attachment: $existingId");
        
        // Удаляем иконку
        if ($existingRow['icon'] > 0) {
            $iconPath = buildAttachmentIconPhysicalPath($existingId, $existingRow['icon']);
            if ($iconPath && file_exists($iconPath)) {
                if (unlink($iconPath)) {
                    logAttachmentMigration("Deleted icon: $iconPath");
                    $deletedFilesCount++;
                } else {
                    logAttachmentMigration("Failed to delete icon: $iconPath", 'WARNING');
                }
            }
        }
        
        // Удаляем превью
        if ($existingRow['preview'] > 0) {
            $previewPath = buildAttachmentPreviewPhysicalPath($existingId, $existingRow['preview']);
            if ($previewPath && file_exists($previewPath)) {
                if (unlink($previewPath)) {
                    logAttachmentMigration("Deleted preview: $previewPath");
                    $deletedFilesCount++;
                } else {
                    logAttachmentMigration("Failed to delete preview: $previewPath", 'WARNING');
                }
            }
        }
        
        // Удаляем файл
        if ($existingRow['file'] > 0 && $existingRow['filename']) {
            $filePath = buildAttachmentFilePhysicalPath($existingId, $existingRow['file'], $existingRow['filename']);
            if ($filePath && file_exists($filePath)) {
                if (unlink($filePath)) {
                    logAttachmentMigration("Deleted file: $filePath");
                    $deletedFilesCount++;
                } else {
                    logAttachmentMigration("Failed to delete file: $filePath", 'WARNING');
                }
            }
        }
    }
    
    logAttachmentMigration("Deleted $deletedFilesCount files from existing attachments");
    
    // Теперь удаляем записи из БД
    $deleteSql = $mysqli->prepare('DELETE FROM tbl_attachments WHERE id_message = ?');
    $deleteSql->bind_param("i", $messageId);
    $deleteSql->execute();
    $deletedCount = $deleteSql->affected_rows;
    logAttachmentMigration("Deleted $deletedCount existing attachment records from DB");
    
    // Начинаем миграцию старых аттачментов
    $migratedCount = 0;
    $failedCount = 0;
    $newAttachmentIds = [];
    
    for ($i = 0; $i < $oldAttachmentsCount; $i++) {
        $baseName = $messageId . '_' . $i;
        logAttachmentMigration("Processing attachment $i: $baseName");
        
        // Ищем файл с любым расширением
        $files = glob($oldAttachmentsPath . $baseName . '.*');
        
        if (empty($files)) {
            logAttachmentMigration("File not found for attachment $i", 'WARNING');
            $failedCount++;
            continue;
        }
        
        $oldFilePath = $files[0];
        $oldIconPath = $oldAttachmentsPath . $baseName . 't.jpg';
        
        logAttachmentMigration("Found old file: $oldFilePath");
        
        if (!file_exists($oldFilePath)) {
            logAttachmentMigration("File does not exist: $oldFilePath", 'WARNING');
            $failedCount++;
            continue;
        }
        
        // Получаем информацию о файле
        $pathInfo = pathinfo($oldFilePath);
        $extension = strtolower($pathInfo['extension']);
        $filename = $pathInfo['basename'];
        $fileSize = filesize($oldFilePath);
        
        // Определяем MIME тип
        $mimeType = mime_content_type($oldFilePath);
        
        logAttachmentMigration("File info: extension=$extension, filename=$filename, size=$fileSize, mime=$mimeType");
        
        // Определяем тип аттачмента (используем проработанную функцию)
        $type = detectAttachmentType($oldFilePath, $mimeType);
        logAttachmentMigration("Detected type: $type");
        
        // Создаем новый аттачмент в БД с датой создания сообщения
        $newAttachmentId = createAttachment($messageId, $type, null, null, null, $messageCreated);
        
        if (!$newAttachmentId) {
            logAttachmentMigration("Failed to create attachment in DB", 'ERROR');
            $failedCount++;
            continue;
        }
        
        logAttachmentMigration("Created new attachment: $newAttachmentId with date: $messageCreated");
        
        // Создаем папку для нового аттачмента
        $newFolderPath = createAttachmentFolder($newAttachmentId);
        
        if (!$newFolderPath) {
            logAttachmentMigration("Failed to create folder for attachment $newAttachmentId", 'ERROR');
            $failedCount++;
            continue;
        }
        
        logAttachmentMigration("Created folder: $newFolderPath");
        
        // Копируем файл
        $newFilePath = buildAttachmentFilePhysicalPath($newAttachmentId, 1, $filename);
        
        if (!copy($oldFilePath, $newFilePath)) {
            logAttachmentMigration("Failed to copy file from $oldFilePath to $newFilePath", 'ERROR');
            $failedCount++;
            continue;
        }
        
        logAttachmentMigration("Copied file to: $newFilePath");
        
        // Обрабатываем в зависимости от типа
        $iconCreated = false;
        $previewCreated = false;
        $status = 'ready';
        
        if ($type === 'image') {
            // Для изображений создаем иконку сразу
            $newIconPath = buildAttachmentIconPhysicalPath($newAttachmentId, 1);
            $iconCreated = generateImageIcon($newFilePath, $newIconPath, 160, 160);
            
            if ($iconCreated) {
                logAttachmentMigration("Created icon: $newIconPath");
            } else {
                logAttachmentMigration("Failed to create icon", 'WARNING');
            }
            
            // Для изображений превью не создаем
            $previewCreated = false;
            $status = 'ready';
            
        } else if ($type === 'video') {
            // Для видео НЕ создаем иконку при миграции
            // Воркер создаст иконку позже
            $iconCreated = false;
            $previewCreated = false;
            $status = 'pending';
            logAttachmentMigration("Video attachment - icon will be created by worker, status set to pending");
            
        } else {
            // Для файлов НЕ создаем иконку
            $iconCreated = false;
            $previewCreated = false;
            $status = 'ready';
            logAttachmentMigration("File attachment - no icon created, status set to ready");
        }
        
        // Обновляем информацию о файле в БД
        updateAttachmentVersions($newAttachmentId, $iconCreated, $previewCreated, true);
        updateAttachmentFilename($newAttachmentId, $filename);
        updateAttachmentStatus($newAttachmentId, $status);
        
        // Обновляем размер файла
        $updateSizeSql = $mysqli->prepare('UPDATE tbl_attachments SET size = ? WHERE id = ?');
        $updateSizeSql->bind_param("is", $fileSize, $newAttachmentId);
        $updateSizeSql->execute();
        
        logAttachmentMigration("Updated attachment info in DB");
        
        $newAttachmentIds[] = $newAttachmentId;
        $migratedCount++;
        
        logAttachmentMigration("Successfully migrated attachment $i");
    }
    
    logAttachmentMigration("Migration summary: migrated=$migratedCount, failed=$failedCount");
    
    // ПРИМЕЧАНИЕ: YouTube аттачменты НЕ обрабатываются при миграции
    // Причины:
    // 1. Загрузка иконок с внешнего сервера может занять до 10 сек на каждую ссылку
    // 2. YouTube ссылки остаются в тексте сообщения
    // 3. Они будут автоматически созданы при первом открытии/редактировании сообщения
    // 4. Это ускоряет массовую миграцию
    
    logAttachmentMigration("YouTube links NOT processed during migration (will be created on first view/edit)");
    
    // Обновляем JSON поле сообщения с мигрированными файлами
    if (!empty($newAttachmentIds)) {
        logAttachmentMigration("Updating message JSON with " . count($newAttachmentIds) . " attachments...");
        if (updateMessageJson($messageId, $newAttachmentIds)) {
            logAttachmentMigration("Message JSON updated successfully");
        } else {
            logAttachmentMigration("Failed to update message JSON", 'ERROR');
        }
    }
    
    // Удаляем старые файлы (если они есть)
    if ($migratedCount > 0) {
        logAttachmentMigration("Deleting old attachment files...");
        
        for ($i = 0; $i < $oldAttachmentsCount; $i++) {
            $baseName = $messageId . '_' . $i;
            $files = glob($oldAttachmentsPath . $baseName . '.*');
            
            foreach ($files as $file) {
                if (unlink($file)) {
                    logAttachmentMigration("Deleted: $file");
                } else {
                    logAttachmentMigration("Failed to delete: $file", 'WARNING');
                }
            }
            
            // Удаляем иконку
            $iconFile = $oldAttachmentsPath . $baseName . 't.jpg';
            if (file_exists($iconFile)) {
                if (unlink($iconFile)) {
                    logAttachmentMigration("Deleted icon: $iconFile");
                } else {
                    logAttachmentMigration("Failed to delete icon: $iconFile", 'WARNING');
                }
            }
        }
    } else {
        logAttachmentMigration("No files were migrated, skipping file deletion");
    }
    
    // ВСЕГДА обнуляем счетчик старых аттачментов, даже если миграция не удалась
    // Это предотвращает бесконечную попытку мигрировать несуществующие файлы
    logAttachmentMigration("Clearing old attachments counter...");
    $updateSql = $mysqli->prepare('UPDATE tbl_messages SET attachments = 0 WHERE id_message = ?');
    $updateSql->bind_param("i", $messageId);
    $updateSql->execute();
    logAttachmentMigration("Old attachments counter cleared");
    
    logAttachmentMigration("=== Migration completed for message $messageId ===");
    
    return [
        'success' => true,
        'migrated' => $migratedCount,
        'failed' => $failedCount,
        'total' => $oldAttachmentsCount
    ];
}

/**
 * Мигрирует один аттачмент в S3 хранилище
 * @param string $attachmentId ID аттачмента
 * @return array Результат миграции
 */
function migrateAttachmentToS3($attachmentId) {
    global $mysqli, $S3_key_id, $S3_key;
    
    require_once __DIR__ . '/s3.php';
    
    logInfo("Starting S3 migration for attachment $attachmentId", 's3-migration');
    
    // Получаем информацию об аттачменте
    $sql = $mysqli->prepare('
        SELECT id, id_message, filename, file, type, s3 
        FROM tbl_attachments 
        WHERE id = ? AND file > 0 AND filename IS NOT NULL
    ');
    $sql->bind_param("s", $attachmentId);
    $sql->execute();
    $result = $sql->get_result();
    
    if (!$result || $result->num_rows === 0) {
        logError("Attachment $attachmentId not found or has no file", 's3-migration');
        return [
            'success' => false,
            'error' => 'Attachment not found or has no file'
        ];
    }
    
    $attachment = $result->fetch_assoc();
    
    // Проверяем наличие S3 ключей
    if (empty($S3_key_id) || empty($S3_key) || $S3_key_id === 'Идентификатор секретного ключа') {
        logError("S3 keys not configured", 's3-migration');
        return [
            'success' => false,
            'error' => 'S3 keys not configured'
        ];
    }
    
    // Проверяем флаг s3
    if (intval($attachment['s3']) === 1) {
        logInfo("Attachment $attachmentId already migrated to S3", 's3-migration');
        return [
            'success' => false,
            'error' => 'Attachment already in S3'
        ];
    }
    
    $filename = $attachment['filename'];
    $fileVersion = $attachment['file'];
    $type = $attachment['type'];
    $messageId = $attachment['id_message'];
    
    logInfo("Processing attachment $attachmentId (type: $type, file: $filename)", 's3-migration');
    
    // Строим путь к локальному файлу
    $localFilePath = buildAttachmentFilePhysicalPath($attachmentId, $fileVersion, $filename);
    
    if (!$localFilePath || !file_exists($localFilePath)) {
        logError("Local file not found for attachment $attachmentId: $localFilePath", 's3-migration');
        return [
            'success' => false,
            'error' => 'Local file not found'
        ];
    }
    
    // Проверяем размер файла
    $fileSize = filesize($localFilePath);
    $maxFileSize = 1024 * 1024 * 1024; // 1 ГБ - лимит для синхронной загрузки
    
    if ($fileSize > $maxFileSize) {
        logError("File too large for synchronous upload: $fileSize bytes (max: $maxFileSize)", 's3-migration');
        return [
            'success' => false,
            'error' => 'File too large for direct upload. Please use background worker for files > 1GB'
        ];
    }
    
    // Увеличиваем таймауты для больших файлов
    $timeout = max(1800, ceil($fileSize / (1024 * 1024)) * 3); // Минимум 30 минут, +3 сек на каждый МБ
    set_time_limit($timeout);
    
    // Определяем MIME тип
    $mimeType = mime_content_type($localFilePath);
    if (!$mimeType) {
        $mimeType = 'application/octet-stream';
    }
    
    // Настраиваем S3 клиент
    S3::setAuth($S3_key_id, $S3_key);
    S3::setSSL(true);
    
    // Создаем экземпляр S3 с правильным endpoint для Yandex Cloud
    $s3 = new S3($S3_key_id, $S3_key, true, 'storage.yandexcloud.net');
    
    $bucketName = 'plllasma';
    
    // Ключ объекта в S3 = ID аттачмента
    $objectKey = $attachmentId;
    
    try {
        // Устанавливаем таймауты для cURL (через статические свойства S3, если доступны)
        // Для больших файлов увеличиваем таймаут загрузки
        $originalTimeout = ini_get('max_execution_time');
        @ini_set('max_execution_time', $timeout);
        
        logInfo("Uploading file to S3: size=" . number_format($fileSize) . " bytes, timeout=$timeout seconds", 's3-migration');
        
        // Загружаем файл в S3
        $uploadResult = S3::putObjectFile(
            $localFilePath,
            $bucketName,
            $objectKey,
            S3::ACL_PRIVATE,
            array(),
            array('Content-Type' => $mimeType)
        );
        
        // Восстанавливаем оригинальный таймаут
        if ($originalTimeout !== false) {
            @ini_set('max_execution_time', $originalTimeout);
        }
        
        if ($uploadResult) {
            // Проверяем наличие файла в S3 через HEAD запрос
            $exists = S3::getObjectInfo($bucketName, $objectKey);
            
            if ($exists) {
                // Файл успешно загружен и существует в S3
                // Обновляем поле s3 = 1 в БД
                $updateSql = $mysqli->prepare('UPDATE tbl_attachments SET s3 = 1 WHERE id = ?');
                $updateSql->bind_param("s", $attachmentId);
                
                if ($updateSql->execute()) {
                    // Удаляем локальный файл (только сам файл, не иконку и не превью)
                    if (unlink($localFilePath)) {
                        logInfo("Successfully migrated attachment $attachmentId to S3 and deleted local file", 's3-migration');
                    } else {
                        logError("Failed to delete local file for attachment $attachmentId: $localFilePath", 's3-migration');
                        // Не считаем это критической ошибкой, файл уже в S3
                    }
                    
                    // Обновляем JSON сообщения
                    $allAttachments = getMessageAttachments($messageId);
                    if (!empty($allAttachments)) {
                        updateMessageJson($messageId, $allAttachments);
                    }
                    
                    return [
                        'success' => true,
                        'message' => 'Attachment migrated to S3 successfully'
                    ];
                } else {
                    logError("Failed to update s3 flag for attachment $attachmentId: " . $mysqli->error, 's3-migration');
                    return [
                        'success' => false,
                        'error' => 'Failed to update database'
                    ];
                }
            } else {
                logError("File uploaded to S3 but verification failed for attachment $attachmentId", 's3-migration');
                return [
                    'success' => false,
                    'error' => 'File verification failed'
                ];
            }
        } else {
            logError("Failed to upload attachment $attachmentId to S3", 's3-migration');
            return [
                'success' => false,
                'error' => 'Failed to upload to S3'
            ];
        }
        
    } catch (Exception $e) {
        // Восстанавливаем оригинальный таймаут в случае ошибки
        if (isset($originalTimeout) && $originalTimeout !== false) {
            @ini_set('max_execution_time', $originalTimeout);
        }
        
        logError("Exception during S3 upload for attachment $attachmentId: " . $e->getMessage(), 's3-migration');
        return [
            'success' => false,
            'error' => 'Exception: ' . $e->getMessage()
        ];
    }
}

?>
