<?php
require_once 'api/include/main.php';

echo "=== Проверка корректности JSON в базе данных ===\n\n";

// Проверяем JSON записи
$problems = validateJsonInDatabase(1000);
if (empty($problems)) {
    echo "✅ Все проверенные JSON записи корректны\n";
} else {
    echo "❌ Найдены проблемы с JSON:\n";
    foreach ($problems as $problem) {
        echo "  Сообщение {$problem['id_message']}: {$problem['error']}\n";
        echo "    JSON: " . substr($problem['json'], 0, 100) . "...\n";
    }
}

echo "\n=== Статистика ===\n";
$totalMessages = getCountAllMessages();
$messagesWithJson = getCountMessagesWithJson();
$messagesWithoutJson = getCountMessagesWithoutAttachments();

echo "Всего сообщений: $totalMessages\n";
echo "С JSON: $messagesWithJson\n";
echo "Без JSON: $messagesWithoutJson\n";

echo "\n=== Анализ размера JSON ===\n";
$jsonSizes = analyzeJsonSizes();
echo "Средний размер JSON: " . round($jsonSizes['average'], 2) . " байт\n";
echo "Максимальный размер: " . $jsonSizes['max'] . " байт\n";
echo "Минимальный размер: " . $jsonSizes['min'] . " байт\n";

echo "\n=== Проверка завершена ===\n";

// Дополнительные функции для локального использования
function getCountMessagesWithJson() {
    global $mysqli;
    
    $sql = $mysqli->prepare('SELECT COUNT(*) as count FROM tbl_messages WHERE json IS NOT NULL');
    $sql->execute();
    $result = $sql->get_result();
    $row = mysqli_fetch_assoc($result);
    
    return $row['count'];
}

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

function getCountAllMessages() {
    global $mysqli;
    
    $sql = $mysqli->prepare('SELECT COUNT(*) as count FROM tbl_messages');
    $sql->execute();
    $result = $sql->get_result();
    $row = mysqli_fetch_assoc($result);
    
    return $row['count'];
}
?>
