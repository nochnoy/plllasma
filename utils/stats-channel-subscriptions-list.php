<?php
// Страница для отображения списка каналов и их подписчиков (только те, кто добавил в меню)

// Устанавливаем правильную рабочую директорию для корректной работы include в main.php
chdir('../api');
include("include/main.php");
chdir('../utils');

// Переопределяем Content-Type для HTML страницы
header('Content-Type: text/html; charset=UTF-8');

// Проверяем авторизацию пользователя
if (!loadUserFromSession()) {
    if (!loadUserByToken()) {
        // Показываем HTML страницу с ошибкой авторизации
        ?>
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Ошибка авторизации</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .error { color: #e74c3c; font-size: 18px; }
                .login-link { margin-top: 20px; }
                .login-link a { color: #3498db; text-decoration: none; }
                .login-link a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="error">Ошибка авторизации. Необходимо войти в систему.</div>
            <div class="login-link">
                <a href="../api/login.php">Войти в систему</a>
            </div>
        </body>
        </html>
        <?php
        exit;
    }
}

// Проверяем права доступа - только пользователь "marat" может видеть эту страницу
if (strtolower($user['login']) !== 'marat') {
    // Если это AJAX запрос, возвращаем JSON ошибку
    if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest') {
        header('Content-Type: application/json');
        die('{"error": "access_denied", "message": "Доступ запрещен. Только пользователь marat может просматривать эту страницу."}');
    }
    // Иначе показываем HTML страницу с ошибкой
    ?>
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <title>Доступ запрещен</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #e74c3c; font-size: 18px; }
        </style>
    </head>
    <body>
        <div class="error">Доступ запрещен. Только пользователь marat может просматривать эту страницу.</div>
    </body>
    </html>
    <?php
    exit;
}

// Получаем список всех каналов с их подписчиками и игнорирующими
$sql = "
    SELECT 
        p.id_place,
        p.name as channel_name,
        p.description as channel_description,
        COUNT(CASE WHEN lup.at_menu = 't' THEN 1 END) as subscribers_count,
        COUNT(CASE WHEN lup.ignoring = 1 THEN 1 END) as ignoring_count
    FROM tbl_places p
    LEFT JOIN lnk_user_place lup ON p.id_place = lup.id_place
    GROUP BY p.id_place, p.name, p.description
    ORDER BY p.name
";

$result = mysqli_query($mysqli, $sql);

// Получаем список каналов
$channels = array();
while ($row = mysqli_fetch_assoc($result)) {
    $channels[] = array(
        'id' => $row['id_place'],
        'name' => $row['channel_name'],
        'description' => $row['channel_description'],
        'subscribers_count' => $row['subscribers_count'],
        'ignoring_count' => $row['ignoring_count']
    );
}

// Получаем детальную информацию о подписчиках для каждого канала (только те, кто добавил в меню)
$subscribers_data = array();
$ignoring_data = array();

foreach ($channels as $channel) {
    // Подписчики (в меню)
    $sql = "
        SELECT 
            u.id_user,
            u.nick,
            u.login,
            lup.time_viewed,
            lup.at_menu,
            lup.weight
        FROM lnk_user_place lup
        INNER JOIN tbl_users u ON u.id_user = lup.id_user
        WHERE lup.id_place = ? AND lup.at_menu = 't'
        ORDER BY u.nick
    ";
    
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("i", $channel['id']);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $subscribers_data[$channel['id']] = array();
    while ($row = mysqli_fetch_assoc($result)) {
        $subscribers_data[$channel['id']][] = array(
            'id_user' => $row['id_user'],
            'nick' => $row['nick'],
            'login' => $row['login'],
            'time_viewed' => $row['time_viewed'],
            'at_menu' => $row['at_menu'],
            'weight' => $row['weight']
        );
    }
    
    // Игнорирующие
    $sql = "
        SELECT 
            u.id_user,
            u.nick,
            u.login,
            lup.time_viewed,
            lup.ignoring
        FROM lnk_user_place lup
        INNER JOIN tbl_users u ON u.id_user = lup.id_user
        WHERE lup.id_place = ? AND lup.ignoring = 1
        ORDER BY u.nick
    ";
    
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("i", $channel['id']);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $ignoring_data[$channel['id']] = array();
    while ($row = mysqli_fetch_assoc($result)) {
        $ignoring_data[$channel['id']][] = array(
            'id_user' => $row['id_user'],
            'nick' => $row['nick'],
            'login' => $row['login'],
            'time_viewed' => $row['time_viewed'],
            'ignoring' => $row['ignoring']
        );
    }
}

?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Статистика каналов</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .channels-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .channel-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            background-color: #fafafa;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .channel-card:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateY(-2px);
        }
        .channel-card.active {
            background-color: #e8f5e8;
            border-color: #27ae60;
        }
        .channel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .channel-name {
            font-size: 18px;
            font-weight: bold;
            color: #2c3e50;
        }
        .channel-stats {
            display: flex;
            gap: 10px;
        }
        .stat-badge {
            background-color: #27ae60;
            color: white;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }
        .stat-badge.menu {
            background-color: #3498db;
        }
        .stat-badge.ignoring {
            background-color: #e74c3c;
        }
        .channel-description {
            color: #7f8c8d;
            font-size: 14px;
            margin-bottom: 8px;
            line-height: 1.4;
        }
        .channel-id {
            color: #95a5a6;
            font-size: 12px;
        }
        .users-section {
            display: none;
            margin-top: 30px;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 8px;
        }
        .users-section.active {
            display: block;
        }
        .users-tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 1px solid #dee2e6;
        }
        .tab-button {
            background: none;
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            font-size: 16px;
            color: #6c757d;
            border-bottom: 2px solid transparent;
            transition: all 0.3s;
        }
        .tab-button.active {
            color: #2c3e50;
            border-bottom-color: #3498db;
        }
        .tab-button:hover {
            color: #2c3e50;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .users-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #dee2e6;
        }
        .users-title {
            font-size: 20px;
            font-weight: bold;
            color: #2c3e50;
        }
        .close-btn {
            background-color: #6c757d;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .close-btn:hover {
            background-color: #5a6268;
        }
        .users-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
        }
        .user-item {
            background-color: white;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 12px;
            transition: box-shadow 0.2s;
        }
        .user-item:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .user-nick {
            font-weight: bold;
            color: #34495e;
            margin-bottom: 5px;
        }
        .user-login {
            color: #7f8c8d;
            font-size: 13px;
            margin-bottom: 8px;
        }
        .user-status {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
        }
        .status-badge {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
        }
        .status-menu {
            background-color: #3498db;
            color: white;
        }
        .status-hidden {
            background-color: #95a5a6;
            color: white;
        }
        .status-ignoring {
            background-color: #e74c3c;
            color: white;
        }
        .user-weight {
            color: #95a5a6;
        }
        .stats {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background-color: #ecf0f1;
            border-radius: 8px;
        }
        .stats-item {
            display: inline-block;
            margin: 0 20px;
            text-align: center;
        }
        .stats-number {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        }
        .stats-label {
            font-size: 14px;
            color: #7f8c8d;
            margin-top: 5px;
        }
        .no-data {
            text-align: center;
            color: #7f8c8d;
            font-style: italic;
            padding: 40px;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #3498db;
            text-decoration: none;
            font-size: 14px;
        }
        .back-link:hover {
            text-decoration: underline;
        }
        .filter-info {
            background-color: #e8f5e8;
            border: 1px solid #27ae60;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 20px;
            color: #27ae60;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="javascript:history.back()" class="back-link">← Назад</a>
        
        <h1>Статистика каналов</h1>
        
        <?php if (empty($channels)): ?>
            <div class="no-data">
                <p>Нет каналов.</p>
            </div>
        <?php else: ?>
            <div class="stats">
                <div class="stats-item">
                    <div class="stats-number"><?php echo count($channels); ?></div>
                    <div class="stats-label">Каналов</div>
                </div>
                <div class="stats-item">
                    <?php 
                    $totalSubscribers = 0;
                    $totalIgnoring = 0;
                    foreach ($channels as $channel) {
                        $totalSubscribers += $channel['subscribers_count'];
                        $totalIgnoring += $channel['ignoring_count'];
                    }
                    ?>
                    <div class="stats-number"><?php echo $totalSubscribers; ?></div>
                    <div class="stats-label">Подписчиков в меню</div>
                </div>
                <div class="stats-item">
                    <div class="stats-number"><?php echo $totalIgnoring; ?></div>
                    <div class="stats-label">Игнорирующих</div>
                </div>
            </div>
            
            <div class="channels-grid">
                <?php foreach ($channels as $channel): ?>
                    <div class="channel-card" onclick="showUsers(<?php echo $channel['id']; ?>)">
                        <div class="channel-header">
                            <div class="channel-name"><?php echo htmlspecialchars($channel['name']); ?></div>
                            <div class="channel-stats">
                                <span class="stat-badge"><?php echo $channel['subscribers_count']; ?> в меню</span>
                                <span class="stat-badge ignoring"><?php echo $channel['ignoring_count']; ?> игнорируют</span>
                            </div>
                        </div>
                        <?php if (!empty($channel['description'])): ?>
                            <div class="channel-description"><?php echo htmlspecialchars($channel['description']); ?></div>
                        <?php endif; ?>
                        <div class="channel-id">ID канала: <?php echo $channel['id']; ?></div>
                    </div>
                <?php endforeach; ?>
            </div>
            
            <div class="users-section" id="users-section">
                <div class="users-header">
                    <div class="users-title" id="users-title">Выберите канал</div>
                    <button class="close-btn" onclick="hideUsers()">Закрыть</button>
                </div>
                
                <div class="users-tabs">
                    <button class="tab-button active" onclick="switchTab('subscribers')">Подписчики в меню</button>
                    <button class="tab-button" onclick="switchTab('ignoring')">Игнорирующие</button>
                </div>
                
                <div class="tab-content active" id="subscribers-tab">
                    <div class="users-grid" id="subscribers-grid">
                        <!-- Подписчики будут загружены через JavaScript -->
                    </div>
                </div>
                
                <div class="tab-content" id="ignoring-tab">
                    <div class="users-grid" id="ignoring-grid">
                        <!-- Игнорирующие будут загружены через JavaScript -->
                    </div>
                </div>
            </div>
        <?php endif; ?>
    </div>

    <script>
        // Данные о подписчиках для каждого канала
        const subscribersData = <?php echo json_encode($subscribers_data, JSON_UNESCAPED_UNICODE); ?>;
        
        // Данные об игнорирующих для каждого канала
        const ignoringData = <?php echo json_encode($ignoring_data, JSON_UNESCAPED_UNICODE); ?>;
        
        // Данные о каналах
        const channelsData = <?php echo json_encode($channels, JSON_UNESCAPED_UNICODE); ?>;
        
        function showUsers(channelId) {
            // Убираем активный класс со всех карточек каналов
            document.querySelectorAll('.channel-card').forEach(card => {
                card.classList.remove('active');
            });
            
            // Добавляем активный класс к выбранной карточке
            event.currentTarget.classList.add('active');
            
            // Находим данные о канале
            const channel = channelsData.find(c => c.id == channelId);
            const subscribers = subscribersData[channelId] || [];
            const ignoring = ignoringData[channelId] || [];
            
            // Обновляем заголовок
            document.getElementById('users-title').textContent = 
                `Пользователи канала "${channel.name}"`;
            
            // Заполняем подписчиков
            const subscribersGrid = document.getElementById('subscribers-grid');
            subscribersGrid.innerHTML = '';
            
            if (subscribers.length === 0) {
                subscribersGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #7f8c8d; font-style: italic; padding: 20px;">Нет подписчиков в меню</div>';
            } else {
                subscribers.forEach(subscriber => {
                    const subscriberDiv = document.createElement('div');
                    subscriberDiv.className = 'user-item';
                    subscriberDiv.innerHTML = `
                        <div class="user-nick">${escapeHtml(subscriber.nick)}</div>
                        <div class="user-login">${escapeHtml(subscriber.login)} (ID: ${subscriber.id_user})</div>
                        <div class="user-status">
                            <span class="status-badge status-menu">В меню</span>
                            <span class="user-weight">Вес: ${subscriber.weight}</span>
                        </div>
                    `;
                    subscribersGrid.appendChild(subscriberDiv);
                });
            }
            
            // Заполняем игнорирующих
            const ignoringGrid = document.getElementById('ignoring-grid');
            ignoringGrid.innerHTML = '';
            
            if (ignoring.length === 0) {
                ignoringGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #7f8c8d; font-style: italic; padding: 20px;">Нет игнорирующих</div>';
            } else {
                ignoring.forEach(user => {
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user-item';
                    userDiv.innerHTML = `
                        <div class="user-nick">${escapeHtml(user.nick)}</div>
                        <div class="user-login">${escapeHtml(user.login)} (ID: ${user.id_user})</div>
                        <div class="user-status">
                            <span class="status-badge status-ignoring">Игнорирует</span>
                        </div>
                    `;
                    ignoringGrid.appendChild(userDiv);
                });
            }
            
            // Показываем секцию пользователей
            document.getElementById('users-section').classList.add('active');
            
            // Прокручиваем к секции пользователей
            document.getElementById('users-section').scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
        
        function hideUsers() {
            // Скрываем секцию пользователей
            document.getElementById('users-section').classList.remove('active');
            
            // Убираем активный класс со всех карточек каналов
            document.querySelectorAll('.channel-card').forEach(card => {
                card.classList.remove('active');
            });
        }
        
        function switchTab(tabName) {
            // Убираем активный класс со всех кнопок и контента
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Добавляем активный класс к выбранной кнопке и контенту
            document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>
