<?
// Функции для работы с каналом и его ветками

// Возвращает JSON с сообщениями канала - 50 верхних плюс звезданутые и те, на которых висят завезданутые
function getChannelJson($channelId, $lastViewed) {
	global $mysqli;

	$a = array();
	$rootIds = array();
	$childIds = array();

	// Получаем из БД страницу из 50 сообщений верхнего уровня

	$sql  = 'SELECT';
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children, icon, anonim, id_user, attachments';
	$sql .= ' FROM tbl_messages';
	$sql .= ' WHERE id_place='.$channelId.' AND id_parent=0';
	$sql .= ' ORDER BY time_created DESC';
	$sql .= ' LIMIT 50';
	$result = mysqli_query($mysqli, $sql);

	while ($row = mysqli_fetch_array($result)) {
		$a[$row[0]] = $row;
	}

	// Если есть звезданутые сообщения и их не слишком много, получаем полностью все ветки, в которых есть звезданутые

	$resultStarredCount = mysqli_query($mysqli, 'SELECT COUNT(id_message) FROM tbl_messages WHERE id_place='.$channelId.' AND time_created >= "'.$lastViewed.'"');
	$row = mysqli_fetch_array($resultStarredCount);
	if ($row[0] > 0 && $row[0] < MAX_STARRED_THREADS) { // Если звезданутых больше 20ти значит юзер не был здесь слишком долго и дайджестов не получит.

		$sql  = 'SELECT';
		$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, -1, icon, anonim, id_user, attachments'; 
		$sql .= ' FROM tbl_messages';
		$sql .= ' WHERE';
		$sql .= ' (id_first_parent<>0 && id_first_parent IN (SELECT id_first_parent FROM tbl_messages WHERE id_place='.$channelId.' AND time_created >= "'.$lastViewed.'"))';
		$result = mysqli_query($mysqli, $sql);

		while ($row = mysqli_fetch_array($result)) {
			$a[$row[0]] = $row;
		}
	}

	// Выводим всё полученное в JSON

	return '['.buildMessagesJson($a, $lastViewed).']';
}

// Возвращает JSON с сообщениями ветки. Внимание, рутовое сообщение не присылается!
function getThreadJson($threadId, $lastViewed) {
	global $mysqli;

	$a = array();

	// Получаем из БД страницу из 50 сообщений верхнего уровня

	$sql  = 'SELECT';
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children, icon, anonim, id_user, attachments';
	$sql .= ' FROM tbl_messages';
	$sql .= ' WHERE id_first_parent='.$threadId;
	$sql .= ' ORDER BY time_created DESC';
	$result = mysqli_query($mysqli, $sql);

	while ($row = mysqli_fetch_array($result)) {
		$a[$row[0]] = $row;
	}

	// Выводим всё полученное в JSON

	return '['.buildMessagesJson($a, $lastViewed).']';
}

// Получает массив row'ов сообщений
// Возвращает json c этими сообщениями
function buildMessagesJson($a, $lastViewed) {
	$s = '';
	foreach ($a as $key => $row) {

		if (!empty($s)) {
			$s .= ',';
		}

		$tid = (empty($row[2]) ? $row[0] : $row[2]);

		if ($row[9] == 1) {
			$row[4] = 'Привидение';
		}

		$s .= '{';
		$s .= '"id":'	. $row[0];							// id
		$s .= ',"pid":'	. $row[1];							// parent id
		$s .= ',"tid":'	. $tid;								// thread id
		$s .= ',"n":"'	. $row[4].'"'; 						// nick
		$s .= ',"t":"'	. jsonifyMessageText($row[5]).'"';	// text
		$s .= ',"d":"'	. $row[6].'"';						// time_created
		$s .= ',"a":'	. ($row[11] ? $row[11] : 0).'';		// attachments

		// иконка
		if ($row[9] == 1) { 
			// anonim
			$s .= ',"i":"ghost"';
		} else {
			if ($row[8]) {
				// У юзера есть иконка
				$s .= ',"i":"'. $row[10].'"'; // TODO: id иконки это id юзера. Не секурно. Сделай иконкам свои айдишники.
			} else {
				$s .= ',"i":"-"'; // У юзера нет иконки. Покажем серый квадрат.
			}
		}

		// Есть ли звёздочка
		if ($row[6] > $lastViewed) {
			$s .= ',"star":' . 1;
		}		

		// Количество детей (только у верхнеуровневых)
		if ($row[7] > 0) {
			$s .= ',"cm":"'.$row[7].'"';
		}

		$s .= '}';
	}
	return $s;
}

?>