<?php
require_once 'include/main.php';
require_once 'include/functions-logging.php';

header('Content-Type: application/json');

try {
    // Проверяем авторизацию
    loginBySessionOrToken();
    
    logAttachmentUpload("Начало загрузки аттачментов для пользователя {$user['id_user']}");
    
    // Получаем параметры
    $placeId = $_POST['placeId'] ?? null;
    $messageId = $_POST['messageId'] ?? null;
    
    if (!$placeId || !$messageId) {
        throw new Exception('Не указаны обязательные параметры');
    }
    
    // Проверяем права на запись в канал
    if (!canWrite($placeId)) {
        die('{"error": "access"}');
    }
    
    // Проверяем, что сообщение существует, принадлежит пользователю и находится на указанном канале
    $stmt = $mysqli->prepare("SELECT id_message FROM tbl_messages WHERE id_message = ? AND id_user = ? AND id_place = ?");
    $stmt->bind_param("iii", $messageId, $user['id_user'], $placeId);
    $stmt->execute();
    $result = $stmt->get_result();
    if (!$result->fetch_assoc()) {
        die('{"error": "access"}');
    }
    
    $uploadedAttachments = [];
    
    // Обрабатываем загруженные файлы
    foreach ($_FILES as $key => $file) {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            continue;
        }
        
        $originalName = $file['name'];
        $fileSize = $file['size'];
        $tmpName = $file['tmp_name'];
        $mimeType = $file['type'];
        
        // Проверяем размер файла
        if ($fileSize > ATTACHMENT_MAX_WEIGHT_MB * 1024 * 1024) {
            throw new Exception("Файл {$originalName} слишком большой");
        }
        
        // Определяем тип аттачмента
        $attachmentType = determineAttachmentType($mimeType, $originalName);
        
        // Генерируем уникальный ID
        $attachmentId = guid();
        
        // Создаем папки для аттачмента
        $xx = substr($attachmentId, 0, 2);
        $yy = substr($attachmentId, 2, 2);
        $attachmentDir = "../a/{$xx}/{$yy}/";
        
        if (!file_exists($attachmentDir)) {
            mkdir($attachmentDir, 0777, true);
        }
        
        // Определяем расширение файла
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!$extension) {
            $extension = 'bin';
        }
        
        $fileName = "{$attachmentId}-1.{$extension}"; // Версия 1 для нового файла
        $filePath = $attachmentDir . $fileName;
        
        // Перемещаем файл
        if (!move_uploaded_file($tmpName, $filePath)) {
            logAttachmentUpload("Ошибка сохранения файла {$originalName}", 'ERROR');
            throw new Exception("Ошибка сохранения файла {$originalName}");
        }
        
        logAttachmentUpload("Файл {$originalName} сохранен как {$attachmentId}");
        
        // Обрабатываем в зависимости от типа
        $iconGenerated = false;
        $previewGenerated = false;
        
        if ($attachmentType === 'image') {
            // Генерируем иконку 160x160 для изображений
            $iconPath = $attachmentDir . "{$attachmentId}-1-i.jpg";
            logAttachmentUpload("Попытка генерации иконки для {$attachmentId}: {$filePath} -> {$iconPath}");
            if (generateImageIcon($filePath, $iconPath, 160, 160)) {
                $iconGenerated = true;
                logAttachmentUpload("Иконка успешно сгенерирована для {$attachmentId}");
            } else {
                logAttachmentUpload("Ошибка генерации иконки для {$attachmentId}", 'ERROR');
            }
            
            // Для изображений превью не генерируем
            $previewGenerated = false;
        } else {
            // Для файлов и видео не создаем иконки при загрузке
            // Иконки будут созданы воркером для видео или использованы дефолтные
            $iconGenerated = false;
            logAttachmentUpload("Аттачмент {$attachmentId} типа '{$attachmentType}' - иконка не создается при загрузке");
        }
        
        // Получаем размер файла
        $fileSize = filesize($filePath);
        
        // Определяем статус на основе типа аттачмента
        $status = ($attachmentType === 'video') ? 'pending' : 'ready';
        
        // Сохраняем в базу данных
        $stmt = $mysqli->prepare("
            INSERT INTO tbl_attachments 
            (id, id_message, type, created, icon, preview, file, filename, source, status, views, downloads, size) 
            VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, NULL, ?, 0, 0, ?)
        ");
        
        // В новой схеме icon, preview, file - это версии (числа), а не пути
        $iconVersion = $iconGenerated ? 1 : 0;
        $previewVersion = $previewGenerated ? 1 : 0;
        $fileVersion = 1; // У нас есть файл
        
        // Обрабатываем имя файла безопасно
        $safeFilename = sanitizeFilename($originalName);
        
        logAttachmentUpload("Параметры для INSERT: attachmentId={$attachmentId}, messageId={$messageId}, type={$attachmentType}, icon={$iconVersion}, preview={$previewVersion}, file={$fileVersion}, filename={$safeFilename}, status={$status}, size={$fileSize}");
        
        $stmt->bind_param("sisiiissi", $attachmentId, $messageId, $attachmentType, $iconVersion, $previewVersion, $fileVersion, $safeFilename, $status, $fileSize);
        
        if (!$stmt->execute()) {
            logAttachmentUpload("ОШИБКА выполнения INSERT: " . $stmt->error, 'ERROR');
            throw new Exception("Ошибка сохранения аттачмента в БД: " . $stmt->error);
        }
        
        logAttachmentUpload("Аттачмент {$attachmentId} ({$attachmentType}) создан со статусом: {$status}");
        
        $uploadedAttachments[] = [
            'id' => $attachmentId,
            'type' => $attachmentType,
            'originalName' => $originalName,
            'filename' => $safeFilename,
            'icon' => $iconVersion,
            'preview' => $previewVersion,
            'file' => $fileVersion,
            'status' => $status
        ];
        
        logAttachmentUpload("Аттачмент {$attachmentId} ({$attachmentType}) успешно создан");
    }
    
    // Обновляем JSON в сообщении
    updateMessageAttachmentsJson($messageId);
    
    logAttachmentUpload("Загрузка завершена успешно. Загружено аттачментов: " . count($uploadedAttachments));
    echo json_encode([
        'success' => true,
        'attachments' => $uploadedAttachments
    ]);
    
} catch (Exception $e) {
    logAttachmentUpload("Ошибка загрузки аттачментов: " . $e->getMessage(), 'ERROR');
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

function determineAttachmentType($mimeType, $filename) {
    $mime = explode('/', $mimeType)[0];
    
    // Сначала пробуем определить по MIME типу
    switch ($mime) {
        case 'image':
            return 'image';
        case 'video':
            return 'video';
    }
    
    // Если MIME тип не помог, определяем по расширению файла
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    
    switch ($extension) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'webp':
        case 'bmp':
            return 'image';
            
        case 'mp4':
        case 'avi':
        case 'mov':
        case 'mkv':
        case 'wmv':
        case 'flv':
        case 'webm':
        case 'rm':
        case 'rmvb':
        case '3gp':
        case 'm4v':
        case 'mpg':
        case 'mpeg':
            return 'video';
            
        default:
            return 'file';
    }
}




function updateMessageAttachmentsJson($messageId) {
    global $mysqli;
    
    // Получаем все аттачменты сообщения
    $stmt = $mysqli->prepare("SELECT * FROM tbl_attachments WHERE id_message = ? ORDER BY created");
    $stmt->bind_param("i", $messageId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $attachments = [];
    while ($row = $result->fetch_assoc()) {
        $attachments[] = $row;
    }
    
    // Преобразуем в нужный формат
    $newAttachments = array_map(function($attachment) {
        logAttachmentUpload("Обрабатываем аттачмент {$attachment['id']}: type={$attachment['type']}, status={$attachment['status']}");
        
        return [
            'id' => $attachment['id'],
            'type' => $attachment['type'],
            'created' => $attachment['created'],
            'icon' => (int)$attachment['icon'], // Версия иконки (число)
            'preview' => (int)$attachment['preview'], // Версия превью (число)
            'file' => (int)$attachment['file'], // Версия файла (число)
            'filename' => $attachment['filename'], // Оригинальное имя файла
            'source' => $attachment['source'],
            'status' => $attachment['status'],
            'views' => (int)$attachment['views'],
            'downloads' => (int)$attachment['downloads'],
            'size' => (int)$attachment['size']
        ];
    }, $attachments);
    
    // Обновляем JSON в сообщении
    $jsonData = json_encode(['j' => $newAttachments]);
    logAttachmentUpload("Обновляем JSON для сообщения {$messageId}: " . $jsonData);
    
    $stmt = $mysqli->prepare("UPDATE tbl_messages SET json = ? WHERE id_message = ?");
    $stmt->bind_param("si", $jsonData, $messageId);
    $result = $stmt->execute();
    
    if (!$result) {
        logAttachmentUpload("Ошибка обновления JSON для сообщения {$messageId}", 'ERROR');
    } else {
        logAttachmentUpload("JSON успешно обновлен для сообщения {$messageId}");
    }
}
?>
