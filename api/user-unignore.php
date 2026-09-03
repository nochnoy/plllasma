<? // REST для снятия мягкого игнорирования юзера

include("include/main.php");
loginBySessionOrToken();

$userId   = $user['id_user'];
$targetId = intval($input['uid']); // id игнорируемого юзера

if ($targetId <= 0) {
	die('{"error": "invalid_user"}');
}

if ($targetId == $userId) {
	die('{"error": "cantUnignoreSelf"}');
}

$sql = $mysqli->prepare('DELETE FROM lnk_user_ignore WHERE id_user = ? AND id_ignored_user = ? AND mode = 1');
$sql->bind_param("ii", $userId, $targetId);
$sql->execute();

// Обновим закешированные в сессии списки юзера
if (!empty($user['ignored_soft'])) {
	$user['ignored_soft'] = array_values(array_diff($user['ignored_soft'], array($targetId)));
	saveUserToSession();
}

exit(json_encode((object)[
	'ok' => true
]));

?>
