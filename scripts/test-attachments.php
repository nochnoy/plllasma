<?php
// Тестовый скрипт для проверки функций аттачментов
require_once 'api/include/main.php';

echo "=== Тестирование функций аттачментов ===\n\n";

// Тест 1: Извлечение YouTube кодов
echo "1. Тест извлечения YouTube кодов:\n";
$testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
    'https://example.com/not-youtube'
];

foreach ($testUrls as $url) {
    $code = getYouTubeCode($url);
    $isYouTube = isYouTubeUrl($url);
    echo "  URL: $url\n";
    echo "    Код: " . ($code ?: 'не найден') . "\n";
    echo "    YouTube: " . ($isYouTube ? 'да' : 'нет') . "\n\n";
}

// Тест 2: Извлечение YouTube ссылок из текста
echo "2. Тест извлечения YouTube ссылок из текста:\n";
$testText = "Посмотрите это видео: https://www.youtube.com/watch?v=dQw4w9WgXcQ и еще одно https://youtu.be/abc123. А это не YouTube: https://example.com";
$urls = extractYouTubeUrls($testText);
echo "  Текст: $testText\n";
echo "  Найденные YouTube ссылки: " . implode(', ', $urls) . "\n\n";

// Тест 3: Создание аттачмента
echo "3. Тест создания аттачмента:\n";
$messageId = 1; // Тестовый ID сообщения
$attachmentId = createAttachment($messageId, 'youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ');
if ($attachmentId) {
    echo "  Создан аттачмент с ID: $attachmentId\n";
    
    // Тест получения аттачмента
    $attachment = getAttachmentById($attachmentId);
    if ($attachment) {
        echo "  Получен аттачмент:\n";
        echo "    ID: " . $attachment['id'] . "\n";
        echo "    Тип: " . $attachment['type'] . "\n";
        echo "    Статус: " . $attachment['status'] . "\n";
        echo "    Источник: " . $attachment['source'] . "\n";
    }
} else {
    echo "  Ошибка создания аттачмента\n";
}
echo "\n";

// Тест 4: Поиск существующего аттачмента
echo "4. Тест поиска существующего аттачмента:\n";
$existingId = findExistingAttachment($messageId, 'youtube', 'dQw4w9WgXcQ');
if ($existingId) {
    echo "  Найден существующий аттачмент: $existingId\n";
} else {
    echo "  Существующий аттачмент не найден\n";
}
echo "\n";

// Тест 5: Обработка сообщения
echo "5. Тест обработки сообщения:\n";
$testMessage = "Посмотрите это видео: https://www.youtube.com/watch?v=dQw4w9WgXcQ";
$attachments = processMessageAttachments($messageId, $testMessage);
echo "  Сообщение: $testMessage\n";
echo "  Созданные/найденные аттачменты: " . implode(', ', $attachments) . "\n\n";

// Тест 6: Обновление JSON
echo "6. Тест обновления JSON:\n";
$result = updateMessageJson($messageId, $attachments);
if ($result) {
    echo "  JSON успешно обновлен\n";
} else {
    echo "  Ошибка обновления JSON\n";
}
echo "\n";

// Тест 7: Получение аттачментов сообщения
echo "7. Тест получения аттачментов сообщения:\n";
$messageAttachments = getMessageAttachments($messageId);
echo "  Аттачменты сообщения $messageId: " . implode(', ', $messageAttachments) . "\n\n";

// Тест 8: Функции для воркера
echo "8. Тест функций для воркера:\n";
$messagesWithoutAttachments = getMessagesWithoutAttachments(5, 0);
echo "  Сообщения без аттачментов (первые 5): " . count($messagesWithoutAttachments) . "\n";

$countWithoutAttachments = getCountMessagesWithoutAttachments();
echo "  Общее количество сообщений без аттачментов: $countWithoutAttachments\n";

$countAllMessages = getCountAllMessages();
echo "  Общее количество сообщений: $countAllMessages\n";

$progress = getWorkerProgress();
echo "  Прогресс обработки:\n";
echo "    Всего: " . $progress['total'] . "\n";
echo "    Обработано: " . $progress['processed'] . "\n";
echo "    Осталось: " . $progress['remaining'] . "\n";
echo "    Процент: " . $progress['percentage'] . "%\n\n";

// Тест 9: Валидация JSON
echo "9. Тест валидации JSON:\n";
$problems = validateJsonInDatabase(10);
if (empty($problems)) {
    echo "  Проблем с JSON не найдено\n";
} else {
    echo "  Найдены проблемы с JSON:\n";
    foreach ($problems as $problem) {
        echo "    Сообщение " . $problem['id_message'] . ": " . $problem['error'] . "\n";
    }
}
echo "\n";

// Тест 10: Статистика JSON
echo "10. Тест статистики JSON:\n";
$countWithJson = getCountMessagesWithJson();
echo "  Сообщений с JSON: $countWithJson\n";

$jsonSizes = analyzeJsonSizes();
echo "  Размеры JSON:\n";
echo "    Средний: " . round($jsonSizes['average'], 2) . " байт\n";
echo "    Максимальный: " . $jsonSizes['max'] . " байт\n";
echo "    Минимальный: " . $jsonSizes['min'] . " байт\n\n";

echo "=== Тестирование завершено ===\n";
?>
