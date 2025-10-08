<?php
/**
 * Проверка "призраков" - сообщений с attachments > 0, но без файлов
 * Такие могли появиться из-за багов в миграции
 */

// Меняем рабочую директорию на api для корректной загрузки
chdir(__DIR__ . '/../api');
require_once('include/main.php');

echo "=== Поиск призрачных счетчиков старых аттачментов ===\n\n";

// Получаем все сообщения с attachments > 0
$stmt = $mysqli->prepare("
    SELECT id_message, id_place, attachments, time_created
    FROM tbl_messages
    WHERE attachments > 0
    ORDER BY time_created DESC
");
$stmt->execute();
$result = $stmt->get_result();

$totalGhosts = 0;
$totalReal = 0;
$ghostMessages = [];

echo "Проверяем сообщения...\n";
echo str_repeat("-", 70) . "\n";

while ($row = $result->fetch_assoc()) {
    $messageId = $row['id_message'];
    $placeId = $row['id_place'];
    $attachmentsCount = $row['attachments'];
    
    // Используем относительный путь от текущей директории (api)
    $oldAttachmentsPath = '../attachments/' . $placeId . '/';
    
    // Проверяем, существуют ли файлы
    $foundFiles = 0;
    for ($i = 0; $i < $attachmentsCount; $i++) {
        $baseName = $messageId . '_' . $i;
        $files = glob($oldAttachmentsPath . $baseName . '.*');
        if (!empty($files)) {
            $foundFiles++;
        }
    }
    
    if ($foundFiles === 0) {
        // Это призрак - счетчик > 0, но файлов нет
        $totalGhosts++;
        $ghostMessages[] = $row;
        echo "👻 ПРИЗРАК: ID={$messageId}, place={$placeId}, attachments={$attachmentsCount}, date={$row['time_created']}\n";
    } else {
        $totalReal++;
        if ($foundFiles < $attachmentsCount) {
            echo "⚠️  ЧАСТИЧНО: ID={$messageId}, счетчик={$attachmentsCount}, найдено файлов={$foundFiles}\n";
        }
    }
}

echo str_repeat("-", 70) . "\n\n";

echo "ИТОГИ:\n";
echo "  Всего сообщений с attachments > 0: " . ($totalGhosts + $totalReal) . "\n";
echo "  Призраков (нет файлов): {$totalGhosts}\n";
echo "  Реальных (есть файлы): {$totalReal}\n\n";

if ($totalGhosts > 0) {
    echo "⚠️  Найдено {$totalGhosts} призрачных счетчиков!\n\n";
    
    echo "Хотите обнулить призрачные счетчики? (yes/no): ";
    $handle = fopen("php://stdin", "r");
    $line = fgets($handle);
    $answer = trim(strtolower($line));
    fclose($handle);
    
    if ($answer === 'yes' || $answer === 'y') {
        echo "\nОбнуляем призрачные счетчики...\n";
        
        $cleared = 0;
        foreach ($ghostMessages as $ghost) {
            $stmt = $mysqli->prepare('UPDATE tbl_messages SET attachments = 0 WHERE id_message = ?');
            $stmt->bind_param("i", $ghost['id_message']);
            $stmt->execute();
            if ($mysqli->affected_rows > 0) {
                $cleared++;
                echo "  ✅ Очищен: ID={$ghost['id_message']}\n";
            }
        }
        
        echo "\n✅ Обнулено призрачных счетчиков: {$cleared}\n";
        
        // Проверяем результат
        $stmt = $mysqli->prepare("SELECT COUNT(*) as count FROM tbl_messages WHERE attachments > 0");
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        echo "✅ Осталось сообщений со старыми аттачментами: {$row['count']}\n";
        
    } else {
        echo "\nОтменено.\n";
    }
} else {
    echo "✅ Призраков не найдено! Все счетчики корректны.\n";
}

echo "\nГотово!\n";
?>

