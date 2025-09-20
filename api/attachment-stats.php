<?php
// API для получения статистики аттачментов старой системы по каналам

// Простое логирование для отладки в самом начале
$debugLog = '../logs/attachment-stats-debug.log';
error_log("[" . date('Y-m-d H:i:s') . "] Script started, params: " . json_encode($_GET) . "\n", 3, $debugLog);

// Отключаем вывод ошибок в HTML формате
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Устанавливаем обработчик ошибок (только для критических ошибок)
set_error_handler(function($severity, $message, $file, $line) use ($debugLog) {
    // Логируем все ошибки, но не превращаем Notice/Warning в Exception
    error_log("[" . date('Y-m-d H:i:s') . "] PHP Error: $message in $file:$line (severity: $severity)\n", 3, $debugLog);
    
    // Превращаем в Exception только критические ошибки
    if ($severity & (E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR)) {
        throw new ErrorException($message, 0, $severity, $file, $line);
    }
    
    // Для Notice/Warning просто возвращаем false (стандартное поведение PHP)
    return false;
});

try {
    error_log("[" . date('Y-m-d H:i:s') . "] About to include main.php\n", 3, $debugLog);
    include("include/main.php");
    error_log("[" . date('Y-m-d H:i:s') . "] main.php included successfully\n", 3, $debugLog);

// Проверяем авторизацию
error_log("[" . date('Y-m-d H:i:s') . "] About to check authorization\n", 3, $debugLog);
loginBySessionOrToken();
error_log("[" . date('Y-m-d H:i:s') . "] Authorization checked, user: " . ($user['login'] ?? 'not set') . "\n", 3, $debugLog);

// Проверяем права доступа - только пользователь "marat" может видеть эту статистику
if (strtolower($user['login']) !== 'marat') {
    error_log("[" . date('Y-m-d H:i:s') . "] Access denied for user: " . ($user['login'] ?? 'empty') . "\n", 3, $debugLog);
    header('Content-Type: application/json');
    die('{"error": "access_denied", "message": "Доступ запрещен. Только пользователь marat может просматривать эту статистику."}');
}

// Получаем параметры
$channelId = isset($_GET['channel_id']) ? intval($_GET['channel_id']) : 0;
$action = isset($_GET['action']) ? $_GET['action'] : '';
error_log("[" . date('Y-m-d H:i:s') . "] Parameters: channelId=$channelId, action=$action\n", 3, $debugLog);

if (empty($channelId)) {
    error_log("[" . date('Y-m-d H:i:s') . "] Error: missing channel_id\n", 3, $debugLog);
    header('Content-Type: application/json');
    die('{"error": "missing_parameter", "message": "Не указан ID канала"}');
}

// Обработка действия удаления файла
if ($action === 'delete_file' && isset($_POST['file_path'])) {
    $filePath = $_POST['file_path'];
    
    // Проверяем, что файл находится в папке канала
    $attachmentsPath = '../attachments/' . $channelId . '/';
    if (strpos($filePath, $attachmentsPath) !== 0) {
        header('Content-Type: application/json');
        die('{"error": "invalid_path", "message": "Неверный путь к файлу"}');
    }
    
    // Проверяем существование файла
    if (!file_exists($filePath)) {
        header('Content-Type: application/json');
        die('{"error": "file_not_found", "message": "Файл не найден"}');
    }
    
    // Удаляем файл
    if (unlink($filePath)) {
        header('Content-Type: application/json');
        echo '{"success": true, "message": "Файл удален"}';
        exit;
    } else {
        header('Content-Type: application/json');
        die('{"error": "delete_failed", "message": "Не удалось удалить файл"}');
    }
}

// Проверяем существование канала
$result = mysqli_query($mysqli, "SELECT name FROM tbl_places WHERE id_place = $channelId");
if (!$result || mysqli_num_rows($result) == 0) {
    header('Content-Type: application/json');
    die('{"error": "channel_not_found", "message": "Канал не найден"}');
}

$channelData = mysqli_fetch_assoc($result);
$channelName = $channelData['name'];

// Функция для извлечения ID сообщения и аттачмента из имени файла
function extractMessageAndAttachmentIdFromFileName($fileName) {
    // Файлы именуются как: {messageId}_{attachmentIndex}.{extension}
    // Например: 12345_0.jpg, 12345_1.mp4, 12345_0t.jpg (thumbnail)
    
    // Пробуем разные паттерны
    $patterns = array(
        // Основной паттерн: messageId_attachmentId.extension
        '/^(\d+)_(\d+)\.([^.]+)$/',
        // Паттерн для thumbnail: messageId_attachmentIdt.extension  
        '/^(\d+)_(\d+)t\.([^.]+)$/',
        // Паттерн без расширения
        '/^(\d+)_(\d+)$/'
    );
    
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $fileName, $matches)) {
            return array(
                'message_id' => intval($matches[1]),
                'attachment_id' => intval($matches[2])
            );
        }
    }
    
    return null;
}

// Функция для извлечения ID сообщения из имени файла (для обратной совместимости)
function extractMessageIdFromFileName($fileName) {
    $data = extractMessageAndAttachmentIdFromFileName($fileName);
    return $data ? $data['message_id'] : null;
}

// Функция для получения информации о сообщениях
function getMessageInfo($messageIds, $currentChannelId) {
    global $mysqli;
    
    if (empty($messageIds)) {
        return array();
    }
    
    // Создаем список ID для SQL запроса
    $messageIdsStr = implode(',', array_filter($messageIds, function($id) { return $id !== null; }));
    
    if (empty($messageIdsStr)) {
        return array();
    }
    
    // Ищем сообщения во всех каналах, не ограничиваясь текущим
    $sql = "
        SELECT 
            m.id_message,
            m.nick,
            m.anonim,
            m.message,
            m.time_created,
            m.id_place,
            p.name as channel_name
        FROM tbl_messages m
        LEFT JOIN tbl_places p ON m.id_place = p.id_place
        WHERE m.id_message IN ($messageIdsStr)
    ";
    
    $result = mysqli_query($mysqli, $sql);
    $messages = array();
    
    while ($row = mysqli_fetch_assoc($result)) {
        $isInCurrentChannel = ($row['id_place'] == $currentChannelId);
        
        $messages[$row['id_message']] = array(
            'id_message' => $row['id_message'],
            'nick' => $row['anonim'] == 1 ? 'Привидение' : $row['nick'],
            'message' => $row['message'],
            'time_created' => $row['time_created'],
            'is_anonymous' => $row['anonim'] == 1,
            'current_channel_id' => $currentChannelId,
            'message_channel_id' => $row['id_place'],
            'message_channel_name' => $row['channel_name'],
            'is_in_current_channel' => $isInCurrentChannel,
            'is_moved' => !$isInCurrentChannel
        );
    }
    
    return $messages;
}

// Функция для поиска потерянных аттачментов
function findLostAttachments($channelId) {
    global $mysqli, $debugLog;
    
    error_log("[" . date('Y-m-d H:i:s') . "] findLostAttachments: Starting for channel $channelId\n", 3, $debugLog);
    
    $attachmentsPath = '../attachments/' . $channelId . '/';
    error_log("[" . date('Y-m-d H:i:s') . "] findLostAttachments: attachmentsPath = $attachmentsPath\n", 3, $debugLog);
    
    // Проверяем существование папки
    if (!is_dir($attachmentsPath)) {
        error_log("[" . date('Y-m-d H:i:s') . "] findLostAttachments: Directory does not exist: $attachmentsPath\n", 3, $debugLog);
        return array(
            'lost_files' => array(),
            'total_files' => 0,
            'error' => 'Папка канала не существует'
        );
    }
    
    error_log("[" . date('Y-m-d H:i:s') . "] findLostAttachments: Directory exists, starting file scan\n", 3, $debugLog);
    
    // Собираем все файлы в папке
    $allFiles = array();
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($attachmentsPath, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    
    foreach ($iterator as $file) {
        if ($file->isFile()) {
            $fileName = $file->getFilename();
            $filePath = $file->getPathname();
            $fileSize = $file->getSize();
            
            // Извлекаем ID сообщения из имени файла
            $messageData = extractMessageAndAttachmentIdFromFileName($fileName);
            $messageId = $messageData ? $messageData['message_id'] : null;
            
            if ($messageId !== null) {
                $allFiles[] = array(
                    'name' => $fileName,
                    'path' => $filePath,
                    'size' => $fileSize,
                    'size_mb' => round($fileSize / (1024 * 1024), 2),
                    'message_id' => $messageId,
                    'modified' => date('Y-m-d H:i:s', $file->getMTime())
                );
            }
        }
    }
    
    if (empty($allFiles)) {
        return array(
            'lost_files' => array(),
            'total_files' => 0,
            'error' => 'В папке канала нет файлов аттачментов'
        );
    }
    
    // Извлекаем уникальные ID сообщений
    $messageIds = array_unique(array_column($allFiles, 'message_id'));
    
    // Проверяем существование сообщений в базе данных пачками по 100
    $existingMessageIds = array();
    $batchSize = 100;
    
    for ($i = 0; $i < count($messageIds); $i += $batchSize) {
        $batch = array_slice($messageIds, $i, $batchSize);
        $messageIdsStr = implode(',', $batch);
        
        $sql = "SELECT id_message FROM tbl_messages WHERE id_message IN ($messageIdsStr)";
        $result = mysqli_query($mysqli, $sql);
        
        while ($row = mysqli_fetch_assoc($result)) {
            $existingMessageIds[] = $row['id_message'];
        }
    }
    
    // Находим файлы, для которых нет соответствующих сообщений
    $lostFiles = array();
    foreach ($allFiles as $file) {
        if (!in_array($file['message_id'], $existingMessageIds)) {
            $lostFiles[] = $file;
        }
    }
    
    // Сортируем по размеру (от большего к меньшему)
    usort($lostFiles, function($a, $b) {
        return $b['size'] - $a['size'];
    });
    
    return array(
        'lost_files' => $lostFiles,
        'total_files' => count($allFiles),
        'lost_count' => count($lostFiles),
        'error' => null
    );
}

// Функция для сканирования папки аттачментов канала
function scanChannelAttachments($channelId) {
    $attachmentsPath = '../attachments/' . $channelId . '/';
    
    // Проверяем существование папки
    if (!is_dir($attachmentsPath)) {
        return array(
            'total_files' => 0,
            'total_size' => 0,
            'total_size_mb' => 0,
            'large_files' => array(),
            'file_types' => array(),
            'error' => 'Папка канала не существует или пуста'
        );
    }
    
    // Проверяем права доступа к папке
    if (!is_readable($attachmentsPath)) {
        return array(
            'total_files' => 0,
            'total_size' => 0,
            'total_size_mb' => 0,
            'large_files' => array(),
            'file_types' => array(),
            'error' => 'Нет прав доступа к папке канала'
        );
    }
    
    $totalSize = 0;
    $fileCount = 0;
    $largeFiles = array(); // Файлы больше 20MB
    $fileTypes = array();
    
    // Сканируем все файлы в папке канала
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($attachmentsPath, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    
    foreach ($iterator as $file) {
        if ($file->isFile()) {
            $fileSize = $file->getSize();
            $fileName = $file->getFilename();
            $filePath = $file->getPathname();
            $extension = strtolower($file->getExtension());
            
            $totalSize += $fileSize;
            $fileCount++;
            
            // Собираем статистику по типам файлов
            if (!isset($fileTypes[$extension])) {
                $fileTypes[$extension] = array('count' => 0, 'size' => 0);
            }
            $fileTypes[$extension]['count']++;
            $fileTypes[$extension]['size'] += $fileSize;
            
            // Если файл больше 20MB, добавляем в список больших файлов
            if ($fileSize > 20 * 1024 * 1024) { // 20MB в байтах
                // Извлекаем ID сообщения и аттачмента из имени файла
                $messageData = extractMessageAndAttachmentIdFromFileName($fileName);
                $messageId = $messageData ? $messageData['message_id'] : null;
                $attachmentId = $messageData ? $messageData['attachment_id'] : null;
                
                $largeFiles[] = array(
                    'name' => $fileName,
                    'size' => $fileSize,
                    'size_mb' => round($fileSize / (1024 * 1024), 2),
                    'path' => $filePath,
                    'extension' => $extension,
                    'modified' => date('Y-m-d H:i:s', $file->getMTime()),
                    'message_id' => $messageId,
                    'attachment_id' => $attachmentId,
                    'debug_info' => array(
                        'parsed_data' => $messageData,
                        'original_filename' => $fileName
                    )
                );
            }
        }
    }
    
    // Сортируем большие файлы по размеру (от большего к меньшему)
    usort($largeFiles, function($a, $b) {
        return $b['size'] - $a['size'];
    });
    
    // Получаем информацию о сообщениях для больших файлов
    if (!empty($largeFiles)) {
        $messageIds = array();
        foreach ($largeFiles as $file) {
            if ($file['message_id'] !== null) {
                $messageIds[] = $file['message_id'];
            }
        }
        
        $messagesInfo = getMessageInfo($messageIds, $channelId);
        
        // Добавляем информацию о сообщениях к большим файлам
        foreach ($largeFiles as &$file) {
            if ($file['message_id'] !== null && isset($messagesInfo[$file['message_id']])) {
                $file['message_info'] = $messagesInfo[$file['message_id']];
            } else {
                // Если сообщение не найдено в базе данных, то действительно оно не существует
                $file['message_info'] = array(
                    'id_message' => $file['message_id'],
                    'nick' => null,
                    'message' => null,
                    'time_created' => null,
                    'is_anonymous' => false,
                    'current_channel_id' => $channelId,
                    'message_channel_id' => null,
                    'message_channel_name' => null,
                    'is_in_current_channel' => false,
                    'is_moved' => false,
                    'not_found' => true
                );
            }
        }
    }
    
    // Если файлов не найдено, возвращаем соответствующее сообщение
    if ($fileCount === 0) {
        return array(
            'total_files' => 0,
            'total_size' => 0,
            'total_size_mb' => 0,
            'large_files' => array(),
            'file_types' => array(),
            'error' => 'В папке канала нет файлов аттачментов'
        );
    }
    
    return array(
        'total_files' => $fileCount,
        'total_size' => $totalSize,
        'total_size_mb' => round($totalSize / (1024 * 1024), 2),
        'large_files' => $largeFiles,
        'file_types' => $fileTypes,
        'error' => null
    );
}

// Функция для получения размера в удобном формате
function formatFileSize($bytes) {
    if ($bytes >= 1024 * 1024 * 1024) {
        return round($bytes / (1024 * 1024 * 1024), 2) . ' GB';
    } elseif ($bytes >= 1024 * 1024) {
        return round($bytes / (1024 * 1024), 2) . ' MB';
    } elseif ($bytes >= 1024) {
        return round($bytes / 1024, 2) . ' KB';
    } else {
        return $bytes . ' B';
    }
}

// Логируем запрос для отладки
error_log("[" . date('Y-m-d H:i:s') . "] Attachment Stats API Request: channel_id=$channelId, action=$action\n", 3, $debugLog);

// Выполняем запрошенное действие
error_log("[" . date('Y-m-d H:i:s') . "] About to execute action: $action\n", 3, $debugLog);
if ($action === 'lost_attachments') {
    error_log("[" . date('Y-m-d H:i:s') . "] Calling findLostAttachments($channelId)\n", 3, $debugLog);
    $stats = findLostAttachments($channelId);
    error_log("[" . date('Y-m-d H:i:s') . "] findLostAttachments completed\n", 3, $debugLog);
} else {
    error_log("[" . date('Y-m-d H:i:s') . "] Calling scanChannelAttachments($channelId)\n", 3, $debugLog);
    // Выполняем обычное сканирование
    $stats = scanChannelAttachments($channelId);
    error_log("[" . date('Y-m-d H:i:s') . "] scanChannelAttachments completed\n", 3, $debugLog);
}

// Добавляем дополнительную информацию
$stats['channel_id'] = $channelId;
$stats['channel_name'] = $channelName;
$stats['scanned_at'] = date('Y-m-d H:i:s');

// Форматируем размеры в удобном виде
$stats['total_size_formatted'] = formatFileSize($stats['total_size']);

// Форматируем статистику по типам файлов
foreach ($stats['file_types'] as $ext => &$typeStats) {
    $typeStats['size_formatted'] = formatFileSize($typeStats['size']);
    $typeStats['size_mb'] = round($typeStats['size'] / (1024 * 1024), 2);
}

// Возвращаем результат
header('Content-Type: application/json; charset=utf-8');
echo json_encode($stats, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

} catch (Exception $e) {
    // Логируем ошибку в debug лог
    $errorMessage = "Attachment Stats API Error: " . $e->getMessage() . 
                   " in " . basename($e->getFile()) . ":" . $e->getLine() . 
                   " | Params: " . json_encode($_GET);
    
    error_log("[" . date('Y-m-d H:i:s') . "] EXCEPTION: $errorMessage\n", 3, $debugLog);
    error_log("[" . date('Y-m-d H:i:s') . "] STACK TRACE:\n" . $e->getTraceAsString() . "\n", 3, $debugLog);
    
    // Дополнительное логирование ошибки
    error_log("[" . date('Y-m-d H:i:s') . "] ERROR: $errorMessage\n", 3, $debugLog);
    
    // Обработка ошибок
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(500);
    echo json_encode(array(
        'error' => 'server_error',
        'message' => 'Внутренняя ошибка сервера. Проверьте логи для подробностей.',
        'error_id' => uniqid(),
        'timestamp' => date('Y-m-d H:i:s')
    ), JSON_UNESCAPED_UNICODE);
}

?>
