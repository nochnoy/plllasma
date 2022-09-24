<? 
// REST для автризации
// Параметры:
// 		login
// 		password
// Если в параметрах пусто - попытается авторизоваться данными из сессии или cookies

include("include/main.php");

if (empty($input['login']) || empty($input['password'])) {
	loadUser();

	// TODO: выкинуть эту хрень когда юзерскую инфу можно будет достать из сессии
	$stmt = $mysqli->prepare('
		SELECT * FROM tbl_users
		WHERE id_user=?
	');
	$stmt->bind_param("i", $userId);
	$stmt->execute();
	$result = $stmt->get_result();
	$user = $result->fetch_all(MYSQLI_ASSOC)[0];
	$nick = $user['nick'];
	if ($user['icon']) {
		$icon = $userId;
	} else {
		$icon = '-';
	}

	exit(json_encode((object)[
		'userId' => $user['id_user'],
		'nick' => $user['nick'],
	]));
}

$stmt = $mysqli->prepare('SELECT * FROM tbl_users WHERE login=? AND password=? LIMIT 1');
$stmt->bind_param("ss", $input['login'], $input['password']);
$stmt->execute();
$result = $stmt->get_result();
if ($result->num_rows > 0) {
	$user = $result->fetch_assoc();
	initSession($user);
	exit(json_encode((object)[
		'userId' => $user['id_user'],
		'nick' => $user['nick'],
	]));
} else {
	exit('{"error": "auth"}');
}

?>