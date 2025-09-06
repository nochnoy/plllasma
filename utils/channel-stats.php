<?php
// Страница для отображения списка каналов и их подписчиков с правами доступа

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

// Получаем список всех каналов с базовой статистикой
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
    ORDER BY p.id_place
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

// Если выбран канал, получаем детальную информацию
$selectedChannel = null;
$channelStats = null;
$usersByRole = null;
$subscribersData = null;
$ignoringData = null;

if (isset($_GET['channel_id']) && is_numeric($_GET['channel_id'])) {
    $channelId = intval($_GET['channel_id']);
    
    // Находим выбранный канал
    foreach ($channels as $channel) {
        if ($channel['id'] == $channelId) {
            $selectedChannel = $channel;
            break;
        }
    }
    
    if ($selectedChannel) {
        // Получаем статистику по ролям
        $sql = "
            SELECT 
                a.role,
                COUNT(*) as count
            FROM tbl_access a
            WHERE a.id_place = ?
            GROUP BY a.role
            ORDER BY a.role
        ";
        
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param("i", $channelId);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $channelStats = array();
        while ($row = mysqli_fetch_assoc($result)) {
            $channelStats[$row['role']] = $row['count'];
        }
        
        // Получаем пользователей по ролям
        $sql = "
            SELECT 
                a.role,
                u.id_user,
                u.nick,
                u.login
            FROM tbl_access a
            INNER JOIN tbl_users u ON u.id_user = a.id_user
            WHERE a.id_place = ?
            ORDER BY a.role, u.nick
        ";
        
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param("i", $channelId);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $usersByRole = array();
        while ($row = mysqli_fetch_assoc($result)) {
            if (!isset($usersByRole[$row['role']])) {
                $usersByRole[$row['role']] = array();
            }
            $usersByRole[$row['role']][] = array(
                'id_user' => $row['id_user'],
                'nick' => $row['nick'],
                'login' => $row['login']
            );
        }
        
        // Получаем детальную информацию о подписчиках (в меню)
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
        $stmt->bind_param("i", $channelId);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $subscribersData = array();
        while ($row = mysqli_fetch_assoc($result)) {
            $subscribersData[] = array(
                'id_user' => $row['id_user'],
                'nick' => $row['nick'],
                'login' => $row['login'],
                'time_viewed' => $row['time_viewed'],
                'at_menu' => $row['at_menu'],
                'weight' => $row['weight']
            );
        }
        
        // Получаем детальную информацию об игнорирующих
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
        $stmt->bind_param("i", $channelId);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $ignoringData = array();
        while ($row = mysqli_fetch_assoc($result)) {
            $ignoringData[] = array(
                'id_user' => $row['id_user'],
                'nick' => $row['nick'],
                'login' => $row['login'],
                'time_viewed' => $row['time_viewed'],
                'ignoring' => $row['ignoring']
            );
        }
    }
}

// Функция для получения названия роли
function getRoleName($role) {
    switch ($role) {
        case ROLE_READER: return 'Читатель';
        case ROLE_WRITER: return 'Писатель';
        case ROLE_MODERATOR: return 'Модератор';
        case ROLE_ADMIN: return 'Администратор';
        case ROLE_OWNER: return 'Владелец';
        case ROLE_GOD: return 'Бог';
        case ROLE_NOBODY: return 'Заблокирован';
        default: return 'Неизвестная роль (' . $role . ')';
    }
}

// Функция для получения цвета роли
function getRoleColor($role) {
    switch ($role) {
        case ROLE_READER: return '#95a5a6';
        case ROLE_WRITER: return '#3498db';
        case ROLE_MODERATOR: return '#f39c12';
        case ROLE_ADMIN: return '#e74c3c';
        case ROLE_OWNER: return '#9b59b6';
        case ROLE_GOD: return '#e67e22';
        case ROLE_NOBODY: return '#2c3e50';
        default: return '#7f8c8d';
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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f8f9fa;
            color: #333;
        }
        
        .container {
            display: flex;
            min-height: 100vh;
        }
        
        .sidebar {
            width: 300px;
            background-color: #fff;
            border-right: 1px solid #e9ecef;
            padding: 20px;
            overflow-y: auto;
        }
        
        .sidebar h2 {
            margin-bottom: 20px;
            color: #2c3e50;
            font-size: 18px;
            font-weight: 600;
        }
        
        .channel-list {
            list-style: none;
        }
        
        .channel-item {
            margin-bottom: 0;
        }
        
        .channel-link {
            display: flex;
            align-items: center;
            padding: 0 1rem;
            text-decoration: none;
            color: #495057;
            border-radius: 6px;
            transition: all 0.2s ease;
            border: 1px solid transparent;
            position: relative;
            height: 1.5rem;
            font-size: 14px;
        }
        
        
        .channel-link:hover {
            background-color: #f8f9fa;
            color: #2c3e50;
        }
        
        .channel-link.active {
            background-color: #e3f2fd;
            color: #1976d2;
            border-color: #bbdefb;
            font-weight: 500;
        }
        
        .main-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        
        .channel-header {
            margin-bottom: 30px;
        }
        
        .channel-title {
            font-size: 28px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        
        .channel-description {
            color: #6c757d;
            font-size: 16px;
            line-height: 1.5;
        }
        
        .stats-section {
            background-color: #fff;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        
        .stats-title {
            font-size: 20px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 20px;
        }
        
        .role-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }
        
        .role-stat {
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 16px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 2px solid transparent;
        }
        
        .role-stat:hover {
            background-color: #e9ecef;
            transform: translateY(-1px);
        }
        
        .role-stat.clickable {
            cursor: pointer;
        }
        
        .role-stat.clickable:hover {
            border-color: #dee2e6;
        }
        
        .role-name {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 4px;
        }
        
        .role-count {
            font-size: 24px;
            font-weight: 700;
        }
        
        .users-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            z-index: 1000;
        }
        
        .users-modal.active {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .modal-content {
            background-color: #fff;
            border-radius: 8px;
            padding: 24px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .modal-title {
            font-size: 20px;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            color: #6c757d;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
        }
        
        .close-btn:hover {
            background-color: #f8f9fa;
            color: #2c3e50;
        }
        
        .users-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 12px;
        }
        
        .user-item {
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 12px;
            border: 1px solid #e9ecef;
        }
        
        .user-nick {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 4px;
        }
        
        .user-login {
            color: #6c757d;
            font-size: 14px;
        }
        
        .no-data {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            padding: 40px;
        }
        
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #1976d2;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
        }
        
        .back-link:hover {
            text-decoration: underline;
        }
        
        .loading {
            text-align: center;
            color: #6c757d;
            padding: 40px;
        }
        
        @media (max-width: 768px) {
            .container {
                flex-direction: column;
            }
            
            .sidebar {
                width: 100%;
                border-right: none;
                border-bottom: 1px solid #e9ecef;
            }
            
            .role-stats {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <h2>Каналы</h2>
            <ul class="channel-list">
                <?php foreach ($channels as $channel): ?>
                    <li class="channel-item">
                        <a href="?channel_id=<?php echo $channel['id']; ?>" 
                           class="channel-link <?php echo ($selectedChannel && $selectedChannel['id'] == $channel['id']) ? 'active' : ''; ?>">
                            <?php echo htmlspecialchars($channel['name']); ?>
                        </a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
        
        <div class="main-content">
            <a href="javascript:history.back()" class="back-link">← Назад</a>
            
            <?php if ($selectedChannel): ?>
                <div class="channel-header">
                    <h1 class="channel-title"><?php echo htmlspecialchars($selectedChannel['name']); ?></h1>
                    <?php if (!empty($selectedChannel['description'])): ?>
                        <p class="channel-description"><?php echo htmlspecialchars($selectedChannel['description']); ?></p>
                    <?php endif; ?>
                </div>
                
                <!-- Статистика подписчиков и игнорирующих -->
                <div class="stats-section">
                    <h2 class="stats-title">Подписчики и игнорирующие</h2>
                    <div class="role-stats">
                        <div class="role-stat clickable" onclick="showSubscribers()">
                            <div class="role-name" style="color: #3498db">
                                В меню
                            </div>
                            <div class="role-count" style="color: #3498db">
                                <?php echo $selectedChannel['subscribers_count']; ?>
                            </div>
                        </div>
                        <div class="role-stat clickable" onclick="showIgnoring()">
                            <div class="role-name" style="color: #e74c3c">
                                Игнорируют
                            </div>
                            <div class="role-count" style="color: #e74c3c">
                                <?php echo $selectedChannel['ignoring_count']; ?>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Статистика по правам доступа -->
                <div class="stats-section">
                    <h2 class="stats-title">Права доступа</h2>
                    <div class="role-stats">
                        <?php 
                        $allRoles = [ROLE_READER, ROLE_WRITER, ROLE_MODERATOR, ROLE_ADMIN, ROLE_OWNER, ROLE_GOD, ROLE_NOBODY];
                        foreach ($allRoles as $role): 
                            $count = isset($channelStats[$role]) ? $channelStats[$role] : 0;
                            $hasUsers = isset($usersByRole[$role]) && count($usersByRole[$role]) > 0;
                        ?>
                            <div class="role-stat <?php echo $hasUsers ? 'clickable' : ''; ?>" 
                                 <?php if ($hasUsers): ?>onclick="showUsers(<?php echo $role; ?>)"<?php endif; ?>>
                                <div class="role-name" style="color: <?php echo getRoleColor($role); ?>">
                                    <?php echo getRoleName($role); ?>
                                </div>
                                <div class="role-count" style="color: <?php echo getRoleColor($role); ?>">
                                    <?php echo $count; ?>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            <?php else: ?>
                <div class="no-data">
                    <h2>Выберите канал</h2>
                    <p>Выберите канал из списка слева, чтобы просмотреть статистику прав доступа.</p>
                </div>
            <?php endif; ?>
        </div>
    </div>
    
    <!-- Модальное окно для показа пользователей -->
    <div class="users-modal" id="usersModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="modalTitle">Пользователи</h3>
                <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <div class="users-list" id="usersList">
                <!-- Список пользователей будет загружен через JavaScript -->
            </div>
        </div>
    </div>

    <script>
        // Данные о пользователях по ролям
        const usersByRole = <?php echo json_encode($usersByRole, JSON_UNESCAPED_UNICODE); ?>;
        
        // Данные о подписчиках и игнорирующих
        const subscribersData = <?php echo json_encode($subscribersData, JSON_UNESCAPED_UNICODE); ?>;
        const ignoringData = <?php echo json_encode($ignoringData, JSON_UNESCAPED_UNICODE); ?>;
        
        // Названия ролей
        const roleNames = {
            <?php echo ROLE_READER; ?>: 'Читатель',
            <?php echo ROLE_WRITER; ?>: 'Писатель',
            <?php echo ROLE_MODERATOR; ?>: 'Модератор',
            <?php echo ROLE_ADMIN; ?>: 'Администратор',
            <?php echo ROLE_OWNER; ?>: 'Владелец',
            <?php echo ROLE_GOD; ?>: 'Бог',
            <?php echo ROLE_NOBODY; ?>: 'Заблокирован'
        };
        
        function showUsers(role) {
            const users = usersByRole[role] || [];
            const modal = document.getElementById('usersModal');
            const modalTitle = document.getElementById('modalTitle');
            const usersList = document.getElementById('usersList');
            
            modalTitle.textContent = roleNames[role] + ' (' + users.length + ')';
            
            usersList.innerHTML = '';
            
            if (users.length === 0) {
                usersList.innerHTML = '<div class="no-data">Нет пользователей с этой ролью</div>';
            } else {
                users.forEach(user => {
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user-item';
                    userDiv.innerHTML = `
                        <div class="user-nick">${escapeHtml(user.nick)}</div>
                        <div class="user-login">${escapeHtml(user.login)} (ID: ${user.id_user})</div>
                    `;
                    usersList.appendChild(userDiv);
                });
            }
            
            modal.classList.add('active');
        }
        
        function showSubscribers() {
            const modal = document.getElementById('usersModal');
            const modalTitle = document.getElementById('modalTitle');
            const usersList = document.getElementById('usersList');
            
            modalTitle.textContent = 'Подписчики в меню (' + subscribersData.length + ')';
            
            usersList.innerHTML = '';
            
            if (subscribersData.length === 0) {
                usersList.innerHTML = '<div class="no-data">Нет подписчиков в меню</div>';
            } else {
                subscribersData.forEach(user => {
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user-item';
                    userDiv.innerHTML = `
                        <div class="user-nick">${escapeHtml(user.nick)}</div>
                        <div class="user-login">${escapeHtml(user.login)} (ID: ${user.id_user})</div>
                        <div class="user-login">Вес: ${user.weight}</div>
                    `;
                    usersList.appendChild(userDiv);
                });
            }
            
            modal.classList.add('active');
        }
        
        function showIgnoring() {
            const modal = document.getElementById('usersModal');
            const modalTitle = document.getElementById('modalTitle');
            const usersList = document.getElementById('usersList');
            
            modalTitle.textContent = 'Игнорирующие (' + ignoringData.length + ')';
            
            usersList.innerHTML = '';
            
            if (ignoringData.length === 0) {
                usersList.innerHTML = '<div class="no-data">Нет игнорирующих</div>';
            } else {
                ignoringData.forEach(user => {
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user-item';
                    userDiv.innerHTML = `
                        <div class="user-nick">${escapeHtml(user.nick)}</div>
                        <div class="user-login">${escapeHtml(user.login)} (ID: ${user.id_user})</div>
                    `;
                    usersList.appendChild(userDiv);
                });
            }
            
            modal.classList.add('active');
        }
        
        function closeModal() {
            document.getElementById('usersModal').classList.remove('active');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Закрытие модального окна по клику вне его
        document.getElementById('usersModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
        
        // Закрытие модального окна по Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        });
    </script>
</body>
</html>