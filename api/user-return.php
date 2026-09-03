<? // REST для отмены взаимного исчезновения с юзером (может только инициатор исчезновения)

include("include/main.php");
loginBySessionOrToken();

$userId   = $user['id_user'];
$targetId = intval($input['uid']); // id юзера, с которым возвращаемся

if ($targetId <= 0) {
	die('{"error": "invalid_user"}');
}

if ($targetId == $userId) {
	die('{"error": "cantReturnSelf"}');
}

// Смотрим vanish-запись пары в обоих направлениях
$sql = $mysqli->prepare('SELECT id_user FROM lnk_user_ignore WHERE mode = 2 AND ((id_user = ? AND id_ignored_user = ?) OR (id_user = ? AND id_ignored_user = ?)) LIMIT 1');
$sql->bind_param("iiii", $userId, $targetId, $targetId, $userId);
$sql->execute();
$result = $sql->get_result();
$row = mysqli_fetch_assoc($result);

if (!$row) {
	// Пара не исчезала - считаем успехом
	exit(json_encode((object)[
		'ok' => true
	]));
}

if ($row['id_user'] != $userId) {
	// Отменить исчезновение может только его инициатор
	die('{"error": "notInitiator"}');
}

$sql = $mysqli->prepare('DELETE FROM lnk_user_ignore WHERE id_user = ? AND id_ignored_user = ? AND mode = 2');
$sql->bind_param("ii", $userId, $targetId);
$sql->execute();

// Обновим закешированные в сессии списки юзера
if (!empty($user['vanished'])) {
	$user['vanished'] = array_values(array_diff($user['vanished'], array($targetId)));
}
if (!empty($user['vanished_by_me'])) {
	$user['vanished_by_me'] = array_values(array_diff($user['vanished_by_me'], array($targetId)));
}
saveUserToSession();

exit(json_encode((object)[
	'ok' => true
]));

?>
