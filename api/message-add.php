<? // REST для добавления нового фокуса фотки

include("include/main.php");

loginBySessionOrToken();

$placeId = $input['placeId'];

if (!canWrite($placeId)) {
	die('{"error": "access"}');
}

$id_parent = 0;
$id_first_parent = 0;

// это коммент к другому cообщению
if (!empty($input["parent"])) {
	$result = mysqli_query($mysqli, 'SELECT * FROM tbl_messages WHERE id_message='.$input["parent"]);
	if ($row = mysqli_fetch_assoc($result)) {
		$id_parent = (int)$row['id_message'];

		if ($row['id_place'] != $placeId) {
			if (!canWrite($placeId)) {
				die('{"error": "placeMoved"}');
			}
		} 

		if ($row['id_parent']=='0') {
			$id_first_parent = $row['id_message'];
		} else {
			$id_first_parent = $row['id_first_parent'];
		}
		// увеличиваем число детей
		mysqli_query($mysqli, 'UPDATE tbl_messages SET children=children+1 WHERE id_message='.$id_first_parent);
	}
}

mysqli_query($mysqli, 
	'INSERT INTO tbl_messages SET'.
	' icon=1'. // привидение
	',anonim=1'. // привидение
	',nick="Привидение"'.
	',id_user='.$user['id_user'].
	',id_place='.$placeId.
	',id_first_parent='.$id_first_parent.
	',id_parent='.$id_parent.
	',message="'.txt2html(trim(@$input["message"])).'"'.
	',subject=""'.
	',time_created=NOW()'.
	',place_type=0'
);
$messageId = mysqli_insert_id($mysqli);

mysqli_query($mysqli, 'UPDATE tbl_places SET time_changed = NOW() WHERE id_place='.$placeId);

exit(json_encode((object)[
	'messageId' => $messageId 
]));

?>