<?php
/**
 * Скрипт для заполнения очереди ютубизации
 * Находит все сообщения с YouTube ссылками без YouTube аттачментов
 * Оптимизирован для работы с сотнями тысяч сообщений
 */

// Меняем рабочую директорию на api/ для корректной работы main.php
chdir(__DIR__ . '/../api');

require_once 'include/main.php';
require_once 'include/functions-logging.php';

echo "=== Скрипт заполнения очереди ютубизации ===\n\n";

// Конфигурация
$batchSize = 1000; // Обрабатываем по 1000 сообщений за раз
$offset = 0;
$totalAdded = 0;
$totalProcessed = 0;

// Создаем таблицу если её нет
echo "Проверка/создание таблицы tbl_youtubize...\n";
$createTableSql = "
CREATE TABLE IF NOT EXISTS tbl_youtubize (
    id_message INT NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    attempts TINYINT NOT NULL DEFAULT 0,
    time_added DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    time_processed DATETIME NULL,
    error_message TEXT NULL,
    PRIMARY KEY (id_message),
    INDEX idx_status (status),
    INDEX idx_time_added (time_added)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
";
mysqli_query($mysqli, $createTableSql);
echo "Таблица готова\n\n";

// Очищаем таблицу перед заполнением (опционально)
$clearTable = readline("Очистить таблицу tbl_youtubize перед заполнением? (y/n): ");
if (strtolower(trim($clearTable)) === 'y') {
    mysqli_query($mysqli, "TRUNCATE TABLE tbl_youtubize");
    echo "Таблица очищена\n\n";
}

// Получаем общее количество сообщений для обработки
echo "Подсчёт сообщений...\n";
$countSql = "
SELECT COUNT(DISTINCT m.id_message) as total
FROM tbl_messages m
LEFT JOIN tbl_youtubize y ON m.id_message = y.id_message
WHERE (
    m.message LIKE '%youtube.com%' 
    OR m.message LIKE '%youtu.be%'
)
AND y.id_message IS NULL
";

$countResult = mysqli_query($mysqli, $countSql);
$countRow = mysqli_fetch_assoc($countResult);
$totalMessages = $countRow['total'];

echo "Найдено сообщений для обработки: {$totalMessages}\n\n";

if ($totalMessages == 0) {
    echo "Нет сообщений для добавления в очередь\n";
    exit(0);
}

// Начинаем обработку батчами
echo "Начинаем обработку батчами по {$batchSize} сообщений...\n";
$startTime = time();
$batchNumber = 0;

while ($totalProcessed < $totalMessages) {
    $batchStart = microtime(true);
    $batchNumber++;
    
    // Получаем батч сообщений
    // ВАЖНО: Не используем OFFSET, так как записи исключаются из выборки после вставки в tbl_youtubize
    $sql = "
    SELECT DISTINCT m.id_message
    FROM tbl_messages m
    LEFT JOIN tbl_youtubize y ON m.id_message = y.id_message
    WHERE (
        m.message LIKE '%youtube.com%' 
        OR m.message LIKE '%youtu.be%'
    )
    AND y.id_message IS NULL
    ORDER BY m.id_message ASC
    LIMIT {$batchSize}
    ";
    
    $result = mysqli_query($mysqli, $sql);
    
    if (!$result) {
        echo "Ошибка запроса: " . mysqli_error($mysqli) . "\n";
        break;
    }
    
    $messageIds = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $messageIds[] = $row['id_message'];
    }
    
    $batchCount = count($messageIds);
    
    if ($batchCount == 0) {
        break;
    }
    
    // Вставляем батч в таблицу очереди
    if (!empty($messageIds)) {
        $values = [];
        foreach ($messageIds as $messageId) {
            $values[] = "({$messageId}, 'pending', 0, NOW(), NULL, NULL)";
        }
        
        $insertSql = "
        INSERT IGNORE INTO tbl_youtubize 
        (id_message, status, attempts, time_added, time_processed, error_message)
        VALUES " . implode(', ', $values);
        
        if (mysqli_query($mysqli, $insertSql)) {
            $inserted = mysqli_affected_rows($mysqli);
            $totalAdded += $inserted;
        } else {
            echo "Ошибка вставки: " . mysqli_error($mysqli) . "\n";
        }
    }
    
    $totalProcessed += $batchCount;
    
    $batchTime = round(microtime(true) - $batchStart, 2);
    $progress = round(($totalProcessed / $totalMessages) * 100, 2);
    $elapsed = time() - $startTime;
    $rate = $totalProcessed / max($elapsed, 1);
    $eta = $totalMessages > $totalProcessed ? round(($totalMessages - $totalProcessed) / max($rate, 1)) : 0;
    
    echo sprintf(
        "Батч %d: обработано %d/%d (%.2f%%), добавлено: %d, время: %.2fs, скорость: %.1f msg/s, ETA: %s\n",
        $batchNumber,
        $totalProcessed,
        $totalMessages,
        $progress,
        $inserted ?? 0,
        $batchTime,
        $rate,
        gmdate("H:i:s", $eta)
    );
    
    // Небольшая пауза чтобы не перегружать БД
    usleep(10000); // 10ms
}

$totalTime = time() - $startTime;

echo "\n=== Завершено ===\n";
echo "Обработано сообщений: {$totalProcessed}\n";
echo "Добавлено в очередь: {$totalAdded}\n";
echo "Время выполнения: " . gmdate("H:i:s", $totalTime) . "\n";
echo "Средняя скорость: " . round($totalProcessed / max($totalTime, 1), 2) . " msg/s\n";

// Показываем статистику по очереди
echo "\n=== Статистика очереди ===\n";
$statsSql = "
SELECT 
    status,
    COUNT(*) as count
FROM tbl_youtubize
GROUP BY status
ORDER BY status
";
$statsResult = mysqli_query($mysqli, $statsSql);
while ($row = mysqli_fetch_assoc($statsResult)) {
    echo "{$row['status']}: {$row['count']}\n";
}

logInfo("Populate youtubize queue completed: processed={$totalProcessed}, added={$totalAdded}, time={$totalTime}s", 'youtubize-queue');

?>

