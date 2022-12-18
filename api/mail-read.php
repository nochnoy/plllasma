<? // REST для получения сообщений инбокса

include("include/main.php");
loginBySessionOrToken();

$recipientNick = $input['nick'];
$recipientId = 0;

$sql = $mysqli->prepare('SELECT id_user FROM tbl_users WHERE nick = ?');
$sql->bind_param("s", $recipientNick);
$sql->execute();
$result = $sql->get_result();
if ($result->num_rows > 0) {
	$recipientId = $result->fetch_object()->id_user;
} else {
	exit(json_encode((object)[
		'error' => 'notfound'
	]));
}

$sql = $mysqli->prepare('
	SELECT m.id_mail, u.id_user, u.nick, u.icon, m.unread, m.message, m.time_created
	FROM tbl_mail m
	LEFT JOIN tbl_users u ON u.id_user = m.author
	WHERE
	m.id_user = ?
	AND m.conversation_with = ?
	ORDER BY time_created DESC
');
$sql->bind_param("ii", $user['id_user'], $recipientId);
$sql->execute();
$result = $sql->get_result();
$messages = $result->fetch_all(MYSQLI_ASSOC);

// Пометим сообщения как прочитанные
mysqli_query($mysqli, 'UPDATE tbl_mail SET unread="t" WHERE id_user='.$user['id_user'].' AND conversation_with='.$recipientId);

exit(json_encode((object)[
	'messages' => $messages
]));

?>