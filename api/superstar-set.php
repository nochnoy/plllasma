<? // REST для установки значения "суперзвёдочки" на ссылке "Каналы"

include("include/main.php");
loginBySessionOrToken();

$userId = $user['id_user'];
$value = intval(@trim(@$input['value']));

$stmt = $mysqli->prepare('UPDATE tbl_users SET unread_unsubscribed_channels = ? WHERE id_user = ?');
$stmt->bind_param("ii", $value, $userId);
$stmt->execute();

// А ещё в сессию запихаем! А то клиент же из неё получает а не прямо из базы.
$user['unread_unsubscribed_channels'] = $value;
saveUserToSession();

exit(json_encode((object)[
	'ok' => '1'
]));

?>