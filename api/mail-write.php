<? // REST для получения сообщений инбокса

include("include/main.php");
loginBySessionOrToken();

$message = $input['message'];
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

// отправляем ему его копию
$sql = $mysqli->prepare('
	INSERT INTO tbl_mail (id_user, author, conversation_with, subject, message, time_created, unread)
	VALUES (?, ?, ?, "", ?, NOW(), "t")
');
$sql->bind_param("iiis", $recipientId, $user['id_user'], $user['id_user'], $message);
$sql->execute();

// отправляем мне мою копию
if($recipientId != $user['id_user']) { // если чувак пишет самому себе - зачем вторая копия?

	$sql = $mysqli->prepare('
		INSERT INTO tbl_mail (id_user, author, conversation_with, subject, message, time_created, unread)
		VALUES (?, ?, ?, "", ?, NOW(), "t")
	');
	$sql->bind_param("iiis", $user['id_user'], $user['id_user'], $recipientId, $message);
	$sql->execute();
}

// рассылаем уведомления на емейл
$result = mysqli_query($mysqli, "SELECT DISTINCT email FROM tbl_users WHERE id_user =".$recipientId." AND inbox_email = 1");

while ($row = mysqli_fetch_assoc($result)) {
	if (is_numeric(strpos($row["email"], "@"))) {
		sendEmail(
			'Plasma - '.$user['nick'], 
			$row["email"], 
			'Новое сообщение в инбоксе', 
			stripslashes($message)."\r\n\r\nНе делайте ответов (Reply) на это сообщение! Ответить можно, войдя в свой инбокс на Плазме. Отключить пересылку сообщений на ваш e-mail можно там-же."
		);
	}
}

exit(json_encode((object)[
	'ok' => '1'
]));

?>