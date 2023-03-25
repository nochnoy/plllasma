<? // REST для сохранения изменений в матрице канала

include("include/main.php");
loginBySessionOrToken();

$placeId 			= @$input['placeId'];
$matrix 			= @$input['matrix'];
$matrixStringified	= json_encode($matrix);

if (empty($placeId) || empty($matrix)) {
	die(json_encode((object)[
		'error' => 'nodata'
	]));
}

if (!canWrite($placeId)) {
	die('{"error": "access"}');
}

$sql = $mysqli->prepare('UPDATE tbl_places SET matrix=? WHERE id_place=?');
$sql->bind_param("si", $matrixStringified, $placeId);
$sql->execute();

exit(json_encode((object)[
	'ok' => '1'
]));

?>