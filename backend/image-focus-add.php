<? // REST для добавления нового фокуса фотки

require("include/main.php");

loadUser();

if (!is_numeric($input['l']) || !is_numeric($input['r']) || !is_numeric($input['t']) || !is_numeric($input['b'])) {
	die('{"error": "invalidParameter"}');
}

if ($input['ghost']) {
	$ghost = true;
	$nick = 'Привидение';
	$icon = null;
} else {

	// TODO: выкинуть эту хрень когда юзерскую инфу можно быдет достать из сессии
	$stmt = $mysqli->prepare('
		SELECT * FROM tbl_users
		WHERE id_user=?
	');
	$stmt->bind_param("i", $userId);
	$stmt->execute();
	$result = $stmt->get_result();
	$user = $result->fetch_all(MYSQLI_ASSOC)[0];
	$ghost = false;
	$nick = $user['nick'];
	if ($user['icon']) {
		$icon = '' . $userId;
	} else {
		$icon = '-';
	}

}

$stmt = $mysqli->prepare('
	INSERT INTO tbl_focus
	SET 
		ghost=?,
		id_user=?,
		nick=?,
		icon=?,		
		id_place=?, 
		id_message=?, 
		id_attachment=?, 
		l=?, 
		r=?, 
		t=?,
		b=?,
		sps=0,
		he=0,
		nep=0,
		ogo=0
');
$stmt->bind_param(
	"iisiiiiiiii",
	$ghost,
	$userId,
	$nick,
	$icon,
	$input['channelId'],
	$input['messageId'],
	$input['fileId'],
	$input['l'],
	$input['r'],
	$input['t'],
	$input['b'],
);
$stmt->execute();

exit(json_encode((object)[
	'id' => $mysqli->insert_id,
	'ghost' => $ghost,
	'nick' => $nick,
	'icon' => $icon,
	'l' => $input['l'],
	'r' => $input['r'],
	't' => $input['t'],
	'b' => $input['b'],	
	'sps' => 0,
	'he' => 0,
	'nep' => 0,
	'ogo' => 0,
]));

?>