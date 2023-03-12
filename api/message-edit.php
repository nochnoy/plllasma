<? // REST для исправления текста сообщения

include("include/main.php");

$messageId 			= @trim($_POST['messageId']);
$message 			= @trim($_POST['message']);
$htmlMessage 		= txt2html($message);
$oldMessage 		= '';

loginBySessionOrToken();

// Узнаем есть ли такое сообщение и что за канал
$sql = $mysqli->prepare('
	SELECT id_user, id_place, message
	FROM tbl_messages
	WHERE
	id_message = ?
');
$sql->bind_param("i", $messageId);
$sql->execute();
$result = $sql->get_result();
if ($row = mysqli_fetch_assoc($result)) {

	$oldMessage = $row['message'];

	// есть права сюда писать?
	if (!canWrite($row['id_place'])) {
		die('{"error": "access"}');
	}

	// это вообще твоё сообщение?
	if ($row['id_user'].'' != $user['id_user'].'') {
		die('{"error": "access"}');
	}

	// а ответов на сообщение ещё не писали?
	$sql = $mysqli->prepare('
		SELECT id_message
		FROM tbl_messages
		WHERE
		id_parent = ?
	');
	$sql->bind_param("i", $messageId);
	$sql->execute();
	$result = $sql->get_result();
	if (mysqli_num_rows($result) > 0) {
		exit(json_encode((object)[
			'success' => false,
			'message' => $oldMessage
		]));
	}

	// Всё ок, пишем
	$sql = $mysqli->prepare('
		UPDATE tbl_messages SET message = ?
		WHERE id_message = ?
		LIMIT 1
	');
	$sql->bind_param("si", $htmlMessage, $messageId);
	$sql->execute();

	exit(json_encode((object)[
		'success' => true,
		'message' => $message
	]));
}

exit(json_encode((object)[
	'success' => false,
	'message' => $oldMessage
]));

?>