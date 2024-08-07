<?
// REST для получения инфы о фотке

require("include/main.php");

loginBySessionOrToken();

$nick = $user['nick'];
$icon = $user['icon'];

// Находим файл
$fileList = glob('attachments/' . $input['channelId'] . '/' . $input['messageId'] . '_' . $input['attachmentId'] . '.*');
$path = $fileList[0];
$type = getFileType($path);

$file = (object)[
	'path' => $path,
	'type' => $type
];

// Инфа о фокусах
$stmt = $mysqli->prepare('
	SELECT id_focus as id, f.ghost, f.nick, f.icon, l, r, t, b, sps, nep, he, ogo
	FROM tbl_focus f
	LEFT JOIN tbl_users u ON u.id_user = f.id_user
	WHERE id_place=? AND id_message=? AND id_attachment=?
');
$stmt->bind_param("iii", $input['channelId'], $input['messageId'], $input['attachmentId']);
$stmt->execute();
$result = $stmt->get_result();
$focuses = $result->fetch_all(MYSQLI_ASSOC);

// Отправляем результат
exit(json_encode((object)[
	'file' => $file,
	'focuses' => $focuses,
	'user' => [
		'nick' => $nick,
		'icon' => '' . $icon
	]
]));

?>