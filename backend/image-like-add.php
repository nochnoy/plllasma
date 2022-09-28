<? // REST для добавления нового фокуса фотки

include("include/main.php");

loginBySessionOrToken();

// TODO: проверка на права и то что ещё не лайкал

$sql = '';
switch($input['like']) {
	case 'sps': $sql = 'UPDATE tbl_focus SET sps = sps + 1 WHERE id_focus=?'; break;
	case 'he':  $sql = 'UPDATE tbl_focus SET he =  he  + 1 WHERE id_focus=?'; break;
	case 'nep': $sql = 'UPDATE tbl_focus SET nep = nep + 1 WHERE id_focus=?'; break;
	case 'ogo': $sql = 'UPDATE tbl_focus SET ogo = ogo + 1 WHERE id_focus=?'; break;
}

$stmt = $mysqli->prepare($sql);
$stmt->bind_param(
	"i",
	$input['focusId']
);
$stmt->execute();

exit(json_encode((object)[
	'ok' => '1'
]));

?>