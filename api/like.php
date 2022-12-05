<? // REST для лайкования

include("include/main.php");
loginBySessionOrToken();

// TODO: проверка на права и то что ещё не лайкал

$sql = '';
switch($input['like']) {
	case 'sps': $sql = 'UPDATE tbl_messages SET emote_sps = emote_sps + 1 WHERE id_message=?'; break;
	case 'heh': $sql = 'UPDATE tbl_messages SET emote_heh = emote_heh + 1 WHERE id_message=?'; break;
	case 'nep': $sql = 'UPDATE tbl_messages SET emote_wut = emote_wut + 1 WHERE id_message=?'; break;
	case 'ogo': $sql = 'UPDATE tbl_messages SET emote_ogo = emote_ogo + 1 WHERE id_message=?'; break;
}

$stmt = $mysqli->prepare($sql);
$stmt->bind_param(
	"i",
	$input['messageId']
);
$stmt->execute();

exit(json_encode((object)[
	'ok' => '1'
]));

?>