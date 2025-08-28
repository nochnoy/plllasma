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
        return $id;
    }
    
    return null;
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

// Создает папку для аттачмента
function createAttachmentFolder($attachmentId) {
    $firstTwo = substr($attachmentId, 0, 2);
    $nextTwo = substr($attachmentId, 2, 2);
    $folderPath = PATH_TO_STORAGE . "new/$firstTwo/$nextTwo/$attachmentId/";
    
    if (!is_dir($folderPath)) {
        mkdir($folderPath, 0777, true);
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
