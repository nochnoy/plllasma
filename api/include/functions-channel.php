<?
// Функции для работы с каналом и его ветками

// Возвращает JSON с сообщениями канала - 50 верхних плюс звезданутые и те, на которых висят завезданутые
function getChannelJson($channelId, $lastViewed, $page = 0) {
	global $mysqli;

	$a = array();
	$rootIds = array();
	$childIds = array();

	// Получаем из БД страницу из 50 сообщений верхнего уровня

	$sql  = 'SELECT';
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children, icon, anonim, id_user, attachments, emote_sps, emote_heh, emote_wut, emote_ogo, json ';
	$sql .= ' FROM tbl_messages';
	$sql .= ' WHERE id_place='.$channelId.' AND id_parent=0';
	$sql .= ' ORDER BY time_created DESC';
	$sql .= ' LIMIT '.PAGE_SIZE.' OFFSET '.($page * PAGE_SIZE);
	$result = mysqli_query($mysqli, $sql);

	while ($row = mysqli_fetch_array($result)) {
		$a[$row[0]] = $row;
	}

	// Если есть звезданутые сообщения и их не слишком много, получаем полностью все ветки, в которых есть звезданутые

	$resultStarredCount = mysqli_query($mysqli, 'SELECT COUNT(id_message) FROM tbl_messages WHERE id_place='.$channelId.' AND time_created >= "'.$lastViewed.'"');
	$row = mysqli_fetch_array($resultStarredCount);
	if ($row[0] > 0 && $row[0] < MAX_STARRED_THREADS) { // Если звезданутых больше 20ти значит юзер не был здесь слишком долго и дайджестов не получит.

		$sql  = 'SELECT';
		$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, -1, icon, anonim, id_user, attachments, emote_sps, emote_heh, emote_wut, emote_ogo, json'; 
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

// Возвращает JSON с сообщениями канала, появившимися после $after
function getChannelUpdateJson($channelId, $lastViewed, $after) {
	global $mysqli;

	$a = array();
	$rootIds = array();
	$childIds = array();

	// Получаем из БД страницу из 50 сообщений верхнего уровня

	$sql  = 'SELECT';
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children, icon, anonim, id_user, attachments, emote_sps, emote_heh, emote_wut, emote_ogo, json';
	$sql .= ' FROM tbl_messages';
	$sql .= ' WHERE id_place='.$channelId.' AND time_created>'.$after;
	$sql .= ' ORDER BY time_created DESC';
	$sql .= ' LIMIT '.PAGE_SIZE;
	$result = mysqli_query($mysqli, $sql);

	while ($row = mysqli_fetch_array($result)) {
		$a[$row[0]] = $row;
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
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children, icon, anonim, id_user, attachments, emote_sps, emote_heh, emote_wut, emote_ogo, json';
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

// Получает плоский массив row'ов сообщений
// Возвращает json c плоским массивом сообщений
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
		$s .= ',"sps":'	. ($row[12] ? $row[12] : 0).'';		// sps
		$s .= ',"he":'	. ($row[13] ? $row[13] : 0).'';		// he
		$s .= ',"nep":'	. ($row[14] ? $row[14] : 0).'';		// nep
		$s .= ',"ogo":'	. ($row[15] ? $row[15] : 0).'';		// ogo
		
		// Новые аттачменты из JSON поля
		if (!empty($row[16])) {
			$jsonData = safeJsonDecode($row[16]);
			if ($jsonData && isset($jsonData['j']) && !empty($jsonData['j'])) {
				$s .= ',"j":' . json_encode($jsonData['j'], JSON_UNESCAPED_UNICODE);
			}
		}

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

function createUserChannelLink($placeId) {
	global $mysqli;
	global $user;

	$userId = $user['id_user'];

	$sql = $mysqli->prepare('SELECT id FROM lnk_user_place WHERE id_place = ? AND id_user = ?');
	$sql->bind_param("ii", $placeId, $userId);
	$sql->execute();
	$result = $sql->get_result();

	if (mysqli_num_rows($result) == 0) {
		$sql = $mysqli->prepare('
			INSERT INTO lnk_user_place (id_place, id_user, at_menu, time_viewed, weight)
			VALUES (?, ?, "f", NOW(), 100)
		');
		$sql->bind_param("ii", $placeId, $userId);
		$sql->execute();
	}
}

?>