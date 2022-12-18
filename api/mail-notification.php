<? // REST для получения нотификации о почте

include("include/main.php");
loginBySessionOrToken();

$result = mysqli_query($mysqli, 'SELECT conversation_with, subject, message FROM tbl_mail WHERE id_user='.$user['id_user'].' AND unread="t" AND author<>'.$user['id_user'].' ORDER BY time_created  DESC LIMIT 1');
if ($row = mysqli_fetch_assoc($result)) {

	$msg = mb_substr($row["subject"].' '.$row["message"], 0, 100);
	if (strlen($row["message"]) > 100) {
		$msg .= '...';
	}
	$msg = strip_tags($msg);

	// Достанем ник мазафаки
	$nickresult = mysqli_query($mysqli, 'SELECT nick FROM tbl_users WHERE id_user='.$row['conversation_with'].' LIMIT 1');
	if ($nickrow = mysqli_fetch_assoc($nickresult)) {
		$nick = $nickrow['nick'];
	} else {
		$nick = 'Кто-то';
	}

	exit(
		json_encode((object)[
			'message' => $msg,
			'nick' => $nick
		])
	);

} else {
	exit(json_encode((object)[ ]));
}
?>