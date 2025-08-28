<?php
// Тестовый скрипт для проверки иконок аттачментов
require_once 'api/include/main.php';

echo "=== Тестирование иконок аттачментов ===\n\n";

// Создаем тестовый аттачмент с иконкой
echo "1. Создание аттачмента с иконкой:\n";
$messageId = 999; // Тестовый ID
$attachmentId = createAttachment($messageId, 'youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ');

if ($attachmentId) {
    echo "  Создан аттачмент: $attachmentId\n";
    
    // Обновляем пути к файлам (симулируем работу воркера)
    $iconPath = "attachments/new/" . substr($attachmentId, 0, 2) . "/" . substr($attachmentId, 2, 2) . "/$attachmentId/icon.png";
    $previewPath = "attachments/new/" . substr($attachmentId, 0, 2) . "/" . substr($attachmentId, 2, 2) . "/$attachmentId/preview.jpg";
    
    $result = updateAttachmentPaths($attachmentId, $iconPath, $previewPath);
    if ($result) {
        echo "  Обновлены пути к файлам:\n";
        echo "    Иконка: $iconPath\n";
        echo "    Превью: $previewPath\n";
    }
    
    // Получаем информацию об аттачменте
    $attachment = getAttachmentById($attachmentId);
    if ($attachment) {
        echo "  Информация об аттачменте:\n";
        echo "    ID: " . $attachment['id'] . "\n";
        echo "    Тип: " . $attachment['type'] . "\n";
        echo "    Иконка: " . ($attachment['icon'] ?: 'не задана') . "\n";
        echo "    Превью: " . ($attachment['preview'] ?: 'не задано') . "\n";
        echo "    Статус: " . $attachment['status'] . "\n";
    }
} else {
    echo "  Ошибка создания аттачмента\n";
}

echo "\n2. Создание аттачмента без иконки:\n";
$attachmentId2 = createAttachment($messageId, 'youtube', 'https://www.youtube.com/watch?v=abc123', 'abc123');

if ($attachmentId2) {
    echo "  Создан аттачмент: $attachmentId2\n";
    
    // Получаем информацию об аттачменте
    $attachment2 = getAttachmentById($attachmentId2);
    if ($attachment2) {
        echo "  Информация об аттачменте:\n";
        echo "    ID: " . $attachment2['id'] . "\n";
        echo "    Тип: " . $attachment2['type'] . "\n";
        echo "    Иконка: " . ($attachment2['icon'] ?: 'не задана') . "\n";
        echo "    Статус: " . $attachment2['status'] . "\n";
    }
}

echo "\n3. Тестирование создания папок:\n";
if (isset($attachmentId)) {
    $folderPath = createAttachmentFolder($attachmentId);
    echo "  Создана папка: $folderPath\n";
    
    if (is_dir($folderPath)) {
        echo "  ✅ Папка существует\n";
    } else {
        echo "  ❌ Папка не создана\n";
    }
}

echo "\n4. Статистика по аттачментам:\n";
$sql = $mysqli->prepare('
    SELECT 
        COUNT(*) as total,
        COUNT(icon) as with_icon,
        COUNT(*) - COUNT(icon) as without_icon
    FROM tbl_attachments
');
$sql->execute();
$result = $sql->get_result();
$stats = mysqli_fetch_assoc($result);

echo "  Всего аттачментов: " . $stats['total'] . "\n";
echo "  С иконками: " . $stats['with_icon'] . "\n";
echo "  Без иконок: " . $stats['without_icon'] . "\n";

echo "\n=== Тестирование завершено ===\n";

// Очистка тестовых данных
echo "\n5. Очистка тестовых данных:\n";
$sql = $mysqli->prepare('DELETE FROM tbl_attachments WHERE id_message = ?');
$sql->bind_param("i", $messageId);
$sql->execute();
$deletedCount = $mysqli->affected_rows;
echo "  Удалено тестовых аттачментов: $deletedCount\n";
?>
