<? // REST для мягкого игнорирования юзера (его сообщения читаются, но не подсвечиваются)

include("include/main.php");
loginBySessionOrToken();

$userId   = $user['id_user'];
$targetId = intval($input['uid']); // id игнорируемого юзера

if ($targetId <= 0) {
	die('{"error": "invalid_user"}');
}

if ($targetId == $userId) {
	die('{"error": "cantIgnoreSelf"}');
}

// Проверим, что такой юзер существует
$sql = $mysqli->prepare('SELECT id_user FROM tbl_users WHERE id_user = ? LIMIT 1');
$sql->bind_param("i", $targetId);
$sql->execute();
$result = $sql->get_result();
if (mysqli_num_rows($result) == 0) {
	die('{"error": "invalid_user"}');
}

// Смотрим существующие записи пары в обоих направлениях
$sql = $mysqli->prepare('SELECT id_user, mode FROM lnk_user_ignore WHERE (id_user = ? AND id_ignored_user = ?) OR (id_user = ? AND id_ignored_user = ?)');
$sql->bind_param("iiii", $userId, $targetId, $targetId, $userId);
$sql->execute();
$result = $sql->get_result();
while ($row = mysqli_fetch_assoc($result)) {
	if ($row['mode'] == 2) {
		// Пара уже взаимно исчезла - мягкий игнор не нужен
		die('{"error": "vanished"}');
	}
	if ($row['id_user'] == $userId && $row['mode'] == 1) {
		// Уже игнорируем - считаем успехом
		exit(json_encode((object)[
			'ok' => true
		]));
	}
}

$sql = $mysqli->prepare('INSERT INTO lnk_user_ignore (id_user, id_ignored_user, mode) VALUES (?, ?, 1)');
$sql->bind_param("ii", $userId, $targetId);
$sql->execute();

// Обновим закешированные в сессии списки юзера
$user['ignored_soft'][] = $targetId;
saveUserToSession();

exit(json_encode((object)[
	'ok' => true
]));

?>
