<?
// Функции для работы с сообщениями

// Подготавливаем текст из бд для всовывания в json
function jsonifyMessageText($s) {

	// Сообщения в БД хранятся в специфичеки плазма-эскейпнутом виде. Раскукоживаем.
	$s = htmlspecialchars_decode($s);

	// убиваем тэги <a..> и </a>, оставляем только их содержимое
	$s = preg_replace('/<a([^>]*)>/i', "", $s);
	$s = preg_replace('/<\/a>/i', "", $s);

	// обратные слеши
	$s = str_replace('\\', '\\\\', $s);

	// двойные кавычки надо снабжать двумя слешами - первый сожрёт JS, второй сожрёт парсер JSON
	// (одинарные кавычки оставляем как есть - JSON их игнорирует)
	$s = str_replace('"', '\\"', $s);

	// <br> превращаем в \n
	$s = preg_replace('/<br\s?\/?>/i', "\\n", str_replace("\n", "", str_replace("\r", "", $s)));

	// табы превращаем в пробелы
	$s = preg_replace('/\t+/', ' ', $s);

	// возврат каретки убиваем
	$s = preg_replace('/\r+/', '', $s);

	// тримаем
	$s = trim($s);

	return $s;
}

function txt2html($s){
	$s = htmlspecialchars($s, ENT_QUOTES);
	$s = nl2br($s);
	return $s;
}

// Сообщение в главный канал от id_user = 0 после регистрации нового участника
function registration_post_welcome_message($mysqli, $newcomerNick) {
	$channelId = defined('MAIN_CHANNEL_ID') ? (int)MAIN_CHANNEL_ID : 1;
	$authorNick = 'Плазма';
	$q = $mysqli->prepare('SELECT nick FROM tbl_users WHERE id_user = 0 LIMIT 1');
	if ($q) {
		$q->execute();
		$res = $q->get_result();
		if ($res && ($row = $res->fetch_assoc()) && $row['nick'] !== '' && $row['nick'] !== null) {
			$authorNick = $row['nick'];
		}
	}
	$text = 'К нам присоединился '.$newcomerNick.'. Добро пожаловать!';
	$html = txt2html($text);
	$ins = $mysqli->prepare(
		'INSERT INTO tbl_messages (id_user, anonim, id_place, icon, nick, subject, message, time_created, id_first_parent, id_parent, children, place_type) '.
		'VALUES (0, 0, ?, 0, ?, "", ?, NOW(), 0, 0, 0, 0)'
	);
	if (!$ins) {
		return;
	}
	$ins->bind_param('iss', $channelId, $authorNick, $html);
	$ins->execute();
	if ($ins->affected_rows > 0) {
		$upd = $mysqli->prepare('UPDATE tbl_places SET time_changed = NOW() WHERE id_place = ? LIMIT 1');
		$upd->bind_param('i', $channelId);
		$upd->execute();
	}
}

?>
