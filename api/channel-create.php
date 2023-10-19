<? // REST для создания канала

include("include/main.php");
loginBySessionOrToken();

$userId 		= $user['id_user'];
$name 			= $input['name'];
$disclaimer     = $input['disclaimer'];
$roleWriter 	= ROLE_WRITER;
$roleOwner 		= ROLE_OWNER;

$sql = $mysqli->prepare('INSERT INTO tbl_places SET name = ?, disclaimer = ?, time_changed = NOW(), id_user = ?, anonim = 1');
$sql->bind_param("ssi", $name, $disclaimer, $userId);
$sql->execute();
$placeId = mysqli_insert_id($mysqli);

// Раздадим всем право "писатель"
$sql = $mysqli->prepare('
	INSERT INTO tbl_access (id_user, id_place, role, addedbyscript) 
	SELECT id_user, ?, ?, 1
	FROM tbl_users
');
$sql->bind_param("ii", $placeId, $roleWriter);
$sql->execute();

// Создателю дадим право "хозяин"
$sql = $mysqli->prepare('
	UPDATE tbl_access SET role = ?
	WHERE id_user = ? AND id_place = ?
	LIMIT 1
');
$sql->bind_param("iii", $roleOwner, $userId, $placeId);
$sql->execute();

// Убиваем сессии всем юзерам (!) чтобы они заново начитали список прав.
killAllSessions();

exit(json_encode((object)[
	'id' => $placeId,
	'ok' => true
]));

?>