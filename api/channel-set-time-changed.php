<? // REST меняет дату обновления канала

include("include/main.php");
loginBySessionOrToken();

$userId 	= $user['id_user'];
$placeId    = $input['placeId']; // id канала

if (!canWrite($placeId)) {
	die('{"error": "access"}');
}

$sql = $mysqli->prepare('
	UPDATE tbl_places SET time_changed = NOW()
	WHERE id_place = ?
	LIMIT 1
');
$sql->bind_param("i", $placeId);
$sql->execute();

exit(json_encode((object)[
	'id' => $placeId,
	'ok' => true
]));

?>