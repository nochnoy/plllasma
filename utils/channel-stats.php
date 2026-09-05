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

// Список игноров и исчезновений между юзерами - нужен только на начальном экране
$ignorePairs = array();
if (!$selectedChannel) {
    $sql = "
        SELECT
            i.mode,
            i.date_created,
            u1.nick AS from_nick,
            u1.login AS from_login,
            u2.nick AS to_nick,
            u2.login AS to_login
        FROM lnk_user_ignore i
        LEFT JOIN tbl_users u1 ON u1.id_user = i.id_user
        LEFT JOIN tbl_users u2 ON u2.id_user = i.id_ignored_user
        ORDER BY i.date_created DESC
    ";
    $result = mysqli_query($mysqli, $sql);
    while ($row = mysqli_fetch_assoc($result)) {
        $ignorePairs[] = $row;
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

// Функция для форматирования размера
function formatBytes($bytes, $precision = 2) {
    $units = array('B', 'KB', 'MB', 'GB', 'TB');
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
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
        
        .sidebar h2 a {
            text-decoration: none;
            color: inherit;
            transition: color 0.2s ease;
        }
        
        .sidebar h2 a:hover {
            color: #1976d2;
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
        
        .stats-btn {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-bottom: 20px;
        }
        
        .stats-btn:hover {
            background-color: #0056b3;
            transform: translateY(-1px);
        }
        
        .stats-btn:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
            transform: none;
        }
        
        .stats-buttons {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .stats-btn-secondary {
            background-color: #dc3545;
        }
        
        .stats-btn-secondary:hover {
            background-color: #c82333;
        }
        
        .lost-attachment-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #f1f3f4;
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
        }
        
        .lost-attachment-item:last-child {
            border-bottom: none;
        }
        
        .lost-attachment-info {
            flex: 1;
            margin-right: 16px;
        }
        
        .lost-attachment-name {
            font-weight: 500;
            color: #856404;
            margin-bottom: 4px;
        }
        
        .lost-attachment-details {
            font-size: 12px;
            color: #856404;
        }
        
        .lost-attachment-actions {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        
        .delete-btn {
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }
        
        .delete-btn:hover {
            background-color: #c82333;
        }
        
        .delete-btn:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
        }
        
        .delete-all-btn {
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s ease;
            min-width: 100px;
        }
        
        .delete-all-btn:hover {
            background-color: #c82333;
        }
        
        .delete-all-btn:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
        }
        
        .attachment-stats-content {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            border: 1px solid #e9ecef;
        }
        
        .attachment-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 20px;
        }
        
        .attachment-stat-item {
            background-color: white;
            border-radius: 6px;
            padding: 16px;
            border: 1px solid #dee2e6;
        }
        
        .attachment-stat-label {
            font-size: 14px;
            color: #6c757d;
            margin-bottom: 4px;
        }
        
        .attachment-stat-value {
            font-size: 20px;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .large-files-section {
            margin-top: 20px;
        }
        
        .large-files-title {
            font-size: 16px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 12px;
        }
        
        .large-files-list {
            background-color: white;
            border-radius: 6px;
            border: 1px solid #dee2e6;
            overflow: hidden;
        }
        
        .large-file-item {
            padding: 16px;
            border-bottom: 1px solid #f1f3f4;
        }
        
        .large-file-item:last-child {
            border-bottom: none;
        }
        
        .large-file-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .large-file-name {
            font-weight: 500;
            color: #2c3e50;
            flex: 1;
            margin-right: 16px;
        }
        
        .large-file-name a {
            color: #007bff;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s ease;
        }
        
        .large-file-name a:hover {
            color: #0056b3;
            text-decoration: underline;
        }
        
        .large-file-size {
            color: #e74c3c;
            font-weight: 600;
            font-size: 14px;
        }
        
        .large-file-message-info {
            background-color: #f8f9fa;
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 13px;
        }
        
        .message-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        
        .message-author {
            font-weight: 600;
            color: #495057;
        }
        
        .message-date {
            color: #6c757d;
            font-size: 12px;
        }
        
        .message-text {
            color: #495057;
            line-height: 1.4;
            max-height: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
        }
        
        .message-id {
            color: #6c757d;
            font-size: 11px;
            margin-top: 4px;
        }
        
        .message-moved-warning {
            color: #e74c3c;
            font-size: 12px;
            font-weight: 600;
            margin-top: 4px;
            padding: 4px 8px;
            background-color: #fdf2f2;
            border-radius: 3px;
            border: 1px solid #fecaca;
        }
        
        .message-not-found {
            color: #e74c3c;
            font-size: 12px;
            font-weight: 600;
            margin-top: 4px;
            padding: 4px 8px;
            background-color: #fdf2f2;
            border-radius: 3px;
            border: 1px solid #fecaca;
        }
        
        .file-types-section {
            margin-top: 20px;
        }
        
        .file-types-title {
            font-size: 16px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 12px;
        }
        
        .file-types-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 8px;
        }
        
        .file-type-item {
            background-color: white;
            border-radius: 4px;
            padding: 8px 12px;
            border: 1px solid #dee2e6;
            text-align: center;
        }
        
        .file-type-extension {
            font-weight: 600;
            color: #2c3e50;
            font-size: 12px;
        }
        
        .file-type-count {
            color: #6c757d;
            font-size: 11px;
            margin-top: 2px;
        }
        
        .file-type-size {
            color: #6c757d;
            font-size: 10px;
        }

        .ignore-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }

        .ignore-table th {
            text-align: left;
            padding: 8px 12px;
            border-bottom: 2px solid #dee2e6;
            color: #6c757d;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
        }

        .ignore-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #f1f3f4;
        }

        .ignore-table tr:last-child td {
            border-bottom: none;
        }

        .ignore-type {
            white-space: nowrap;
            font-weight: 600;
        }

        .ignore-date {
            color: #6c757d;
            font-size: 13px;
            white-space: nowrap;
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
            <ul class="channel-list">
                <li class="channel-item">
                    <a href="?" 
                       class="channel-link <?php echo !$selectedChannel ? 'active' : ''; ?>">
                        Начало
                    </a>
                </li>
            </ul>
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
                
                <!-- Статистика аттачментов старой системы -->
                <div class="stats-section">
                    <h2 class="stats-title">Статистика аттачментов (старая система)</h2>
                    <div class="stats-buttons">
                        <button id="getAttachmentStatsBtn" class="stats-btn" onclick="getAttachmentStats()">
                            Получить статистику аттачментов
                        </button>
                        <button id="getLostAttachmentsBtn" class="stats-btn stats-btn-secondary" onclick="getLostAttachments()">
                            Потерянные аттачменты
                        </button>
                    </div>
                    <div id="attachmentStatsContent" class="attachment-stats-content" style="display: none;">
                        <!-- Здесь будет отображаться статистика аттачментов -->
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
                <!-- Информация о свободном месте на диске -->
                <div class="stats-section">
                    <h2 class="stats-title">Свободное место на диске</h2>
                    <?php
                    // Получаем информацию о диске
                    $diskPath = getcwd() . '/../'; // Корневая директория проекта
                    $totalSpace = disk_total_space($diskPath);
                    $freeSpace = disk_free_space($diskPath);
                    $usedSpace = $totalSpace - $freeSpace;
                    
                    $totalFormatted = formatBytes($totalSpace);
                    $freeFormatted = formatBytes($freeSpace);
                    $usedFormatted = formatBytes($usedSpace);
                    $usedPercent = $totalSpace > 0 ? round(($usedSpace / $totalSpace) * 100, 2) : 0;
                    $freePercent = 100 - $usedPercent;
                    ?>
                    <div class="attachment-stats-grid">
                        <div class="attachment-stat-item">
                            <div class="attachment-stat-label">Всего места</div>
                            <div class="attachment-stat-value"><?php echo $totalFormatted; ?></div>
                        </div>
                        <div class="attachment-stat-item">
                            <div class="attachment-stat-label">Использовано</div>
                            <div class="attachment-stat-value" style="color: <?php echo $usedPercent > 90 ? '#e74c3c' : ($usedPercent > 75 ? '#f39c12' : '#28a745'); ?>">
                                <?php echo $usedFormatted; ?> (<?php echo $usedPercent; ?>%)
                            </div>
                        </div>
                        <div class="attachment-stat-item">
                            <div class="attachment-stat-label">Свободно</div>
                            <div class="attachment-stat-value" style="color: <?php echo $freePercent < 10 ? '#e74c3c' : ($freePercent < 25 ? '#f39c12' : '#28a745'); ?>">
                                <?php echo $freeFormatted; ?> (<?php echo $freePercent; ?>%)
                            </div>
                        </div>
                    </div>
                    <div style="margin-top: 16px;">
                        <div style="background-color: #e9ecef; border-radius: 4px; height: 24px; position: relative; overflow: hidden;">
                            <div style="background-color: <?php echo $usedPercent > 90 ? '#e74c3c' : ($usedPercent > 75 ? '#f39c12' : '#28a745'); ?>; height: 100%; width: <?php echo $usedPercent; ?>%; transition: width 0.3s ease;"></div>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 12px; font-weight: 600; color: #2c3e50; text-shadow: 0 0 2px white;">
                                <?php echo $usedPercent; ?>% использовано
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Лог работы видео воркера -->
                <?php
                // Используем LOG_DIR из системы логирования (уже подключено через main.php)
                if (defined('LOG_DIR')) {
                    $logFile = LOG_DIR . 'video-summary.log';
                } else {
                    // Fallback на прямой путь
                    $logFile = __DIR__ . '/../logs/video-summary.log';
                }
                if (file_exists($logFile)) {
                    $logLines = file($logFile);
                    if ($logLines !== false && !empty($logLines)) {
                        // Берём последние 50 строк
                        $recentLines = array_slice($logLines, -50);
                        ?>
                        <div class="stats-section" style="margin-top: 20px;">
                            <h2 class="stats-title">Лог работы видео воркера</h2>
                            <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 12px; max-height: 400px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5;">
                                <?php
                                foreach ($recentLines as $line) {
                                    echo htmlspecialchars($line) . '<br>';
                                }
                                ?>
                            </div>
                        </div>
                        <?php
                    }
                }
                ?>
                
                <!-- Игноры и исчезновения между юзерами -->
                <div class="stats-section" style="margin-top: 20px;">
                    <h2 class="stats-title">Игноры и исчезновения</h2>
                    <?php if (empty($ignorePairs)): ?>
                        <div class="no-data">Пока никто никого не игнорирует</div>
                    <?php else: ?>
                        <table class="ignore-table">
                            <thead>
                                <tr>
                                    <th>Тип</th>
                                    <th>Кто</th>
                                    <th>Кого</th>
                                    <th>Когда</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($ignorePairs as $pair): ?>
                                    <tr>
                                        <?php if ($pair['mode'] == 2): ?>
                                            <td class="ignore-type" style="color: #2c3e50;">💀 Исчезновение</td>
                                            <td><?php echo htmlspecialchars($pair['from_nick'] ?? '?'); ?> <span style="color: #6c757d;">(инициатор, может отменить)</span></td>
                                            <td><?php echo htmlspecialchars($pair['to_nick'] ?? '?'); ?></td>
                                        <?php else: ?>
                                            <td class="ignore-type" style="color: #f39c12;">😶 Игнор</td>
                                            <td><?php echo htmlspecialchars($pair['from_nick'] ?? '?'); ?></td>
                                            <td><?php echo htmlspecialchars($pair['to_nick'] ?? '?'); ?></td>
                                        <?php endif; ?>
                                        <td class="ignore-date"><?php echo htmlspecialchars($pair['date_created']); ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>

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
        
        function stripHtmlTags(html) {
            const div = document.createElement('div');
            div.innerHTML = html;
            return div.textContent || div.innerText || '';
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
        
        // Функция для получения статистики аттачментов
        function getAttachmentStats() {
            const btn = document.getElementById('getAttachmentStatsBtn');
            const content = document.getElementById('attachmentStatsContent');
            
            // Показываем индикатор загрузки
            btn.disabled = true;
            btn.textContent = 'Загрузка...';
            content.style.display = 'block';
            content.innerHTML = '<div class="loading">Сканирование файлов аттачментов...</div>';
            
            // Получаем ID канала из URL
            const urlParams = new URLSearchParams(window.location.search);
            const channelId = urlParams.get('channel_id');
            
            if (!channelId) {
                content.innerHTML = '<div class="no-data">Ошибка: не указан ID канала</div>';
                btn.disabled = false;
                btn.textContent = 'Получить статистику аттачментов';
                return;
            }
            
            // Отправляем запрос к API
            fetch(`../api/attachment-stats.php?channel_id=${channelId}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.text().then(text => {
                        try {
                            return JSON.parse(text);
                        } catch (e) {
                            console.error('Ошибка парсинга JSON:', text);
                            throw new Error('Сервер вернул некорректный JSON. Проверьте консоль для подробностей.');
                        }
                    });
                })
                .then(data => {
                    if (data.error) {
                        content.innerHTML = `<div class="no-data">Ошибка: ${data.message || data.error}</div>`;
                    } else {
                        displayAttachmentStats(data);
                    }
                })
                .catch(error => {
                    console.error('Ошибка при получении статистики аттачментов:', error);
                    content.innerHTML = `<div class="no-data">Ошибка при получении статистики аттачментов: ${error.message}</div>`;
                })
                .finally(() => {
                    btn.disabled = false;
                    btn.textContent = 'Получить статистику аттачментов';
                });
        }
        
        // Функция для отображения статистики аттачментов
        function displayAttachmentStats(data) {
            const content = document.getElementById('attachmentStatsContent');
            
            // Если есть ошибка, показываем её
            if (data.error) {
                content.innerHTML = `<div class="no-data">${data.error}</div>`;
                return;
            }
            
            let html = `
                <div class="attachment-stats-grid">
                    <div class="attachment-stat-item">
                        <div class="attachment-stat-label">Всего файлов</div>
                        <div class="attachment-stat-value">${data.total_files}</div>
                    </div>
                    <div class="attachment-stat-item">
                        <div class="attachment-stat-label">Общий размер</div>
                        <div class="attachment-stat-value">${data.total_size_formatted}</div>
                    </div>
                    <div class="attachment-stat-item">
                        <div class="attachment-stat-label">Больших файлов (>20MB)</div>
                        <div class="attachment-stat-value" style="color: ${data.large_files.length > 0 ? '#e74c3c' : '#28a745'}">${data.large_files.length}</div>
                    </div>
                    <div class="attachment-stat-item">
                        <div class="attachment-stat-label">Типов файлов</div>
                        <div class="attachment-stat-value">${Object.keys(data.file_types).length}</div>
                    </div>
                </div>
            `;
            
            // Добавляем информацию о больших файлах
            if (data.large_files.length > 0) {
                html += `
                    <div class="large-files-section">
                        <div class="large-files-title">Файлы больше 20MB (${data.large_files.length})</div>
                        <div class="large-files-list">
                `;
                
                data.large_files.forEach(file => {
                    const messageInfo = file.message_info || {};
                    
                    // Формируем дополнительные уведомления
                    let additionalInfo = '';
                    let showMessageInfo = true;
                    
                    if (messageInfo.not_found) {
                        additionalInfo = '<div class="message-not-found">⚠️ Сообщение не найдено в базе данных</div>';
                        showMessageInfo = false; // Не показываем информацию о сообщении
                    } else if (messageInfo.is_moved) {
                        additionalInfo = `<div class="message-moved-warning">⚠️ Сообщение перенесено в канал "${escapeHtml(messageInfo.message_channel_name || 'ID: ' + messageInfo.message_channel_id)}"</div>`;
                        showMessageInfo = false; // Не показываем информацию о сообщении для перенесенных
                    }
                    
                    // Создаем ссылку для скачивания
                    let fileNameHtml = escapeHtml(file.name);
                    if (file.message_id && file.attachment_id !== null && file.attachment_id !== undefined) {
                        const downloadUrl = `../api/file.php?p=${data.channel_id}&m=${file.message_id}&a=${file.attachment_id}`;
                        fileNameHtml = `<a href="${downloadUrl}" target="_blank" title="Скачать файл">${escapeHtml(file.name)}</a>`;
                    } else {
                        // Для отладки - показываем информацию о том, почему ссылка не создана
                        console.log('Не удалось создать ссылку для файла:', file.name, {
                            message_id: file.message_id,
                            attachment_id: file.attachment_id,
                            channel_id: data.channel_id,
                            debug_info: file.debug_info
                        });
                        
                        // Добавляем визуальную подсказку в интерфейс
                        fileNameHtml += ' <span style="color: #6c757d; font-size: 11px;" title="Ссылка для скачивания недоступна">🔒</span>';
                    }
                    
                    // Формируем информацию о сообщении только если оно найдено
                    let messageInfoHtml = '';
                    if (showMessageInfo && !messageInfo.not_found && messageInfo.nick !== null) {
                        const messageDate = messageInfo.time_created ? 
                            new Date(messageInfo.time_created).toLocaleDateString('ru-RU') + ' ' + 
                            new Date(messageInfo.time_created).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) : 
                            'Неизвестно';
                            
                        messageInfoHtml = `
                            <div class="large-file-message-info">
                                <div class="message-meta">
                                    <div class="message-author">${escapeHtml(messageInfo.nick || 'Неизвестно')}</div>
                                    <div class="message-date">${messageDate}</div>
                                </div>
                                <div class="message-text">${escapeHtml(stripHtmlTags(messageInfo.message || 'Сообщение содержит только аттачмент'))}</div>
                                <div class="message-id">ID сообщения: ${messageInfo.id_message || 'Неизвестно'}</div>
                                ${additionalInfo}
                            </div>
                        `;
                    } else {
                        // Показываем только предупреждение без информации о сообщении
                        messageInfoHtml = `
                            <div class="large-file-message-info">
                                ${additionalInfo}
                            </div>
                        `;
                    }
                    
                    html += `
                        <div class="large-file-item">
                            <div class="large-file-header">
                                <div class="large-file-name">${fileNameHtml}</div>
                                <div class="large-file-size">${file.size_mb} MB</div>
                            </div>
                            ${messageInfoHtml}
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            // Добавляем статистику по типам файлов
            if (Object.keys(data.file_types).length > 0) {
                html += `
                    <div class="file-types-section">
                        <div class="file-types-title">Статистика по типам файлов</div>
                        <div class="file-types-list">
                `;
                
                // Сортируем типы файлов по количеству
                const sortedTypes = Object.entries(data.file_types)
                    .sort(([,a], [,b]) => b.count - a.count);
                
                sortedTypes.forEach(([extension, stats]) => {
                    html += `
                        <div class="file-type-item">
                            <div class="file-type-extension">.${extension || 'без расширения'}</div>
                            <div class="file-type-count">${stats.count} файлов</div>
                            <div class="file-type-size">${stats.size_formatted}</div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            // Добавляем информацию о времени сканирования
            html += `
                <div style="margin-top: 20px; text-align: center; color: #6c757d; font-size: 12px;">
                    Сканирование выполнено: ${data.scanned_at}
                </div>
            `;
            
            content.innerHTML = html;
        }
        
        // Функция для поиска потерянных аттачментов
        function getLostAttachments() {
            const btn = document.getElementById('getLostAttachmentsBtn');
            const content = document.getElementById('attachmentStatsContent');
            
            // Показываем индикатор загрузки
            btn.disabled = true;
            btn.textContent = 'Поиск...';
            content.style.display = 'block';
            content.innerHTML = '<div class="loading">Поиск потерянных аттачментов...</div>';
            
            // Получаем ID канала из URL
            const urlParams = new URLSearchParams(window.location.search);
            const channelId = urlParams.get('channel_id');
            
            if (!channelId) {
                content.innerHTML = '<div class="no-data">Ошибка: не указан ID канала</div>';
                btn.disabled = false;
                btn.textContent = 'Потерянные аттачменты';
                return;
            }
            
            // Отправляем запрос к API
            fetch(`../api/attachment-stats.php?channel_id=${channelId}&action=lost_attachments`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.text().then(text => {
                        try {
                            return JSON.parse(text);
                        } catch (e) {
                            console.error('Ошибка парсинга JSON:', text);
                            throw new Error('Сервер вернул некорректный JSON. Проверьте консоль для подробностей.');
                        }
                    });
                })
                .then(data => {
                    if (data.error) {
                        content.innerHTML = `<div class="no-data">Ошибка: ${data.message || data.error}</div>`;
                    } else {
                        displayLostAttachments(data);
                    }
                })
                .catch(error => {
                    console.error('Ошибка при поиске потерянных аттачментов:', error);
                    content.innerHTML = `<div class="no-data">Ошибка при поиске потерянных аттачментов: ${error.message}</div>`;
                })
                .finally(() => {
                    btn.disabled = false;
                    btn.textContent = 'Потерянные аттачменты';
                });
        }
        
        // Функция для отображения потерянных аттачментов
        function displayLostAttachments(data) {
            const content = document.getElementById('attachmentStatsContent');
            
            let html = `
                <div class="attachment-stats-grid">
                    <div class="attachment-stat-item">
                        <div class="attachment-stat-label">Всего файлов</div>
                        <div class="attachment-stat-value">${data.total_files}</div>
                    </div>
                    <div class="attachment-stat-item">
                        <div class="attachment-stat-label">Потерянных файлов</div>
                        <div class="attachment-stat-value" style="color: ${data.lost_count > 0 ? '#dc3545' : '#28a745'}">${data.lost_count}</div>
                    </div>
                    ${data.lost_count > 0 ? `
                    <div class="attachment-stat-item">
                        <div class="attachment-stat-label">Действия</div>
                        <div class="attachment-stat-value">
                            <button class="delete-all-btn" onclick="deleteAllLostAttachments()" title="Удалить все потерянные файлы">
                                Удалить все
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
            
            if (data.lost_files.length > 0) {
                html += `
                    <div class="large-files-section">
                        <div class="large-files-title">Потерянные аттачменты (${data.lost_count})</div>
                        <div class="large-files-list">
                `;
                
                data.lost_files.forEach(file => {
                    // Создаем ссылку для скачивания
                    let fileNameHtml = escapeHtml(file.name);
                    const downloadUrl = `../api/file.php?p=${data.channel_id}&m=${file.message_id}&a=0`;
                    fileNameHtml = `<a href="${downloadUrl}" target="_blank" title="Скачать файл">${escapeHtml(file.name)}</a>`;
                    
                    html += `
                        <div class="lost-attachment-item">
                            <div class="lost-attachment-info">
                                <div class="lost-attachment-name">${fileNameHtml}</div>
                                <div class="lost-attachment-details">
                                    Размер: ${file.size_mb} MB | ID сообщения: ${file.message_id} | Изменен: ${file.modified}
                                </div>
                            </div>
                            <div class="lost-attachment-actions">
                                <button class="delete-btn" onclick="deleteLostAttachment('${escapeHtml(file.path)}', this)">
                                    Удалить
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="margin-top: 20px; text-align: center; color: #28a745; font-weight: 600;">
                        🎉 Потерянных аттачментов не найдено!
                    </div>
                `;
            }
            
            // Добавляем информацию о времени сканирования
            html += `
                <div style="margin-top: 20px; text-align: center; color: #6c757d; font-size: 12px;">
                    Поиск выполнен: ${data.scanned_at}
                </div>
            `;
            
            content.innerHTML = html;
        }
        
        // Функция для удаления потерянного аттачмента
        function deleteLostAttachment(filePath, button) {
            if (!confirm('Вы уверены, что хотите удалить этот файл? Это действие нельзя отменить.')) {
                return;
            }
            
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Удаление...';
            
            const formData = new FormData();
            formData.append('file_path', filePath);
            
            const urlParams = new URLSearchParams(window.location.search);
            const channelId = urlParams.get('channel_id');
            
            fetch(`../api/attachment-stats.php?channel_id=${channelId}&action=delete_file`, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Удаляем элемент из списка
                    button.closest('.lost-attachment-item').remove();
                    
                    // Обновляем счетчик
                    const countElement = document.querySelector('.attachment-stat-value[style*="color: #dc3545"]');
                    if (countElement) {
                        const currentCount = parseInt(countElement.textContent);
                        countElement.textContent = currentCount - 1;
                        
                        // Если больше нет потерянных файлов, меняем цвет на зеленый
                        if (currentCount - 1 === 0) {
                            countElement.style.color = '#28a745';
                        }
                    }
                } else {
                    alert('Ошибка при удалении файла: ' + (data.message || 'Неизвестная ошибка'));
                    button.disabled = false;
                    button.textContent = originalText;
                }
            })
            .catch(error => {
                console.error('Ошибка при удалении файла:', error);
                alert('Ошибка при удалении файла. Проверьте консоль браузера для подробностей.');
                button.disabled = false;
                button.textContent = originalText;
            });
        }
        
        // Функция для удаления всех потерянных аттачментов
        function deleteAllLostAttachments() {
            const deleteButtons = document.querySelectorAll('.lost-attachment-item .delete-btn');
            const count = deleteButtons.length;
            
            if (count === 0) {
                alert('Нет потерянных файлов для удаления.');
                return;
            }
            
            if (!confirm(`Вы уверены, что хотите удалить все ${count} потерянных файлов? Это действие нельзя отменить.`)) {
                return;
            }
            
            const button = document.querySelector('.delete-all-btn');
            const originalText = button.textContent;
            button.disabled = true;
            
            let deletedCount = 0;
            let failedCount = 0;
            let processedCount = 0;
            
            // Функция для обновления текста кнопки
            function updateButtonText() {
                button.textContent = `Удаление... (${processedCount}/${count})`;
            }
            
            // Функция для обработки одного файла
            function deleteNextFile(index) {
                if (index >= deleteButtons.length) {
                    // Все файлы обработаны
                    button.disabled = false;
                    button.textContent = originalText;
                    
                    alert(`Операция завершена!\nУдалено файлов: ${deletedCount}\nОшибок: ${failedCount}`);
                    
                    // Скрываем кнопку "Удалить все" если все файлы удалены
                    if (failedCount === 0) {
                        button.closest('.attachment-stat-item').style.display = 'none';
                    }
                    
                    return;
                }
                
                const deleteBtn = deleteButtons[index];
                if (!deleteBtn || !deleteBtn.closest('.lost-attachment-item')) {
                    // Кнопка уже удалена, переходим к следующей
                    processedCount++;
                    updateButtonText();
                    setTimeout(() => deleteNextFile(index + 1), 100);
                    return;
                }
                
                // Получаем путь к файлу из onclick атрибута
                const onclickAttr = deleteBtn.getAttribute('onclick');
                const match = onclickAttr.match(/deleteLostAttachment\('([^']+)'/);
                if (!match) {
                    failedCount++;
                    processedCount++;
                    updateButtonText();
                    setTimeout(() => deleteNextFile(index + 1), 100);
                    return;
                }
                
                const filePath = match[1];
                const formData = new FormData();
                formData.append('file_path', filePath);
                
                const urlParams = new URLSearchParams(window.location.search);
                const channelId = urlParams.get('channel_id');
                
                fetch(`../api/attachment-stats.php?channel_id=${channelId}&action=delete_file`, {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        deletedCount++;
                        // Удаляем элемент из списка
                        deleteBtn.closest('.lost-attachment-item').remove();
                    } else {
                        failedCount++;
                        console.error(`Ошибка удаления файла ${filePath}:`, data.message);
                    }
                })
                .catch(error => {
                    failedCount++;
                    console.error(`Ошибка удаления файла ${filePath}:`, error);
                })
                .finally(() => {
                    processedCount++;
                    updateButtonText();
                    
                    // Обновляем счетчик потерянных файлов
                    const countElement = document.querySelector('.attachment-stat-value[style*="color: #dc3545"], .attachment-stat-value[style*="color: #28a745"]');
                    if (countElement) {
                        const remainingCount = count - processedCount;
                        countElement.textContent = remainingCount;
                        countElement.style.color = remainingCount > 0 ? '#dc3545' : '#28a745';
                    }
                    
                    // Переходим к следующему файлу через небольшую задержку
                    setTimeout(() => deleteNextFile(index + 1), 200);
                });
            }
            
            // Начинаем удаление с первого файла
            updateButtonText();
            deleteNextFile(0);
        }
    </script>
</body>
</html>