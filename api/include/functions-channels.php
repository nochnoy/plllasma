<?
// Функции для работы с ветками и каналами

// Возвращает JSON с сообщениями канала - 50 верхних плюс звезданутые и те, на которых висят завезданутые
function getChannelJson($channelId, $lastViewed) {
	global $mysqli;

	$a = array();
	$rootIds = array();
	$childIds = array();

	// Получаем из БД страницу из 50 сообщений верхнего уровня

	$sql  = 'SELECT';
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children, icon, anonim, id_user';
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
	if ($row[0] > 0 && $row[0] < 20) { // Если звезданутых больше 20ти значит юзер не был здесь слишком долго и дайджестов не получит.

		$sql  = 'SELECT';
		$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, -1, icon, anonim, id_user'; 
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
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children, icon, anonim, id_user';
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

		$s .= '{';
		$s .= '"id":'				. $row[0];								// id 
		$s .= ',"pid":'				. $row[1];								// parent id
		$s .= ',"tid":'				. $tid;								    // thread id
		$s .= ',"n":"'				. $row[4].'"';						    // nick
		$s .= ',"t":"'				. jsonifyMessageText($row[5]).'"';	    // text
		$s .= ',"d":"'				. $row[6].'"';						    // time_created

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

		// Количество детей (только у верхнеуровневых)
		if ($row[7] > 0) {
			$s .= ',"cm":"'.$row[7].'"';
		}

		$s .= '}';
	}
	return $s;
}

// Возвращает json со списком каналов, доступных юзеру
function getChannelsJson() {
	global $mysqli;
    global $userId;

	$sql  = 'SELECT DISTINCT';
	$sql .= ' p.id_place, p.parent, p.name, p.description, p.time_changed, p.typ, l.time_viewed';
    $sql .= ' FROM tbl_places p';
    $sql .= ' LEFT JOIN tbl_access a ON a.id_place=p.id_place AND a.id_user='.$userId;
    $sql .= ' LEFT JOIN lnk_user_place l ON l.id_place=a.id_place AND l.id_user='.$userId; 
    $sql .= ' WHERE';
    $sql .= ' a.role >=0 AND a.role <= 5'; // уровень доступа: 0-зритель, 1-участник, 2-модератор, 3-админ, 4-хозяин, 5-бог, 9-никто
    $sql .= ' AND l.at_menu="t"'; // юзер хочет чтобы канал был у него в меню
    $sql .= ' ORDER BY id_place DESC';
	$result = mysqli_query($mysqli, $sql);

    $s = '';    
	while ($row = mysqli_fetch_array($result)) {

        if (!empty($s)) {
			$s .= ',';
        }
        
        $s .= '{';
        $s .= '"id":'				. $row[0];							// id 
        $s .= ',"pid":'				. $row[1];							// parent id
        $s .= ',"name":"'		    . jsonifyMessageText($row[2]).'"';	// name
        $s .= ',"desc":"'			. jsonifyMessageText($row[3]).'"';	// description
        $s .= ',"d":"'				. $row[4].'"';						// time_created
        $s .= ',"type":"'			. $row[5].'"';						// type
        $s .= ',"v":"'			    . $row[6].'"';						// time_viewed
        $s .= '}';

	}

	return '['.$s.']';
}

function getChannels2($placeId = NULL, $onlyAtMenu = true) {
	global $user;
	global $mysqli;

	$where = '';
	if ($placeId!==NULL) $where = ' AND p.id_place='.$placeId;
	if ($onlyAtMenu) $where = ' AND l.at_menu="t"';
	
	$sql =
		'SELECT DISTINCT p.id_place, p.parent, p.first_parent, p.name, p.description, p.time_changed, p.path, p.typ, l.weight, a.role, l.time_viewed, l.at_menu'.
		' FROM tbl_places p'.
		' LEFT JOIN tbl_access a ON a.id_place=p.id_place AND a.id_user='.$user['id_user'].
		' LEFT JOIN lnk_user_place l ON l.id_place=a.id_place AND l.id_user='.$user['id_user'].
		' WHERE 1=1 '.$where.
		' ORDER BY p.parent, p.weight'; // это нужно чтоб первыми создавались города а потом в них совались их дети
	$result = mysqli_query($mysqli, $sql);

	// Перегоняем результат в массив, чтобы записи можно было дополнять полем STAR
	$output = array();
	while($row = mysqli_fetch_assoc($result)) {
		$output[] = $row;
	}

	$softStars = false;

	// Если юзер кого-то игнорит то пробуем вычислить звёздочки по датам сообщений, учитывая игнорируемых юзеров и прочие факторы
	if (count($user['ignored']) > 0) {
		$softStars = true;

		$placeIds = array();
		for ($i = 0; $i < count($output); $i++) { 
			$row = &$output[$i];
			if ($row['time_changed'] > $row['time_viewed']) {
				$placeIds[] = $row['id_place'];
			}
		}

		// Получаем список каналов, в которых есть новые сообщения не от игноренных юзеров
		$sql =
			'SELECT l.id_place, m.id_user, m.message'
			.' FROM tbl_messages m'
			.' LEFT JOIN lnk_user_place l ON l.id_user='.$user['id_user'].' AND l.id_place = m.id_place'
			.' WHERE m.id_place IN ('.implode(',', $placeIds).') AND m.time_created > l.time_viewed'
			.' AND m.id_user NOT IN ('.implode(',', $user['ignored']).')'
			.' GROUP BY id_place'
			;
		$r = mysqli_query($mysqli, $sql);
		$updatedPlaces = array();
		while($r2 = mysqli_fetch_array($r)) {
			$updatedPlaces[] = $r2[0];
		}

		// Раздаём звёздочки
		for ($i = 0; $i < count($output); $i++) { 
			$row = &$output[$i];
			$row['_STAR_'] = in_array($row['id_place'], $updatedPlaces);
		}
	}

	// Сложный расчёт звёздочек не понадобился или не получился. Вычисляем по-старинке.
	if (!$softStars) {
		for ($i = 0; $i < count($output); $i++) { 
			$row = &$output[$i];
			$row['_STAR_'] = ($row['time_changed'] > $row['time_viewed']);
		}
	}

	return $output;
}

?>