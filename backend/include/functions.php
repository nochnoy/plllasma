<?

// Юзер авторизован?
function isAuthorized() {
    global $userId;
    return !empty($userId);
}

// Заполняет юзерские переменные данными откуда (и если) получится
function loadUser() {
	if (!loadUserFromSession()) {
		if (!loadUserFromCookies()) {
			die('{"error": "auth"}');
		}
	}
}

// Пробуем восстановить юзерские данные из сессии
function loadUserFromSession() {
	global $userId;

	$userId = @$_SESSION['plasma_user_id'];

	return !empty($userId);
}

// Пробуем восстановить сессию а затем юзерские данные через токен в cookies
function loadUserFromCookies() {
	global $mysqli;

	$key = getCookieKey();
	if (isset($key)) {
		// Да, в куках валяется ключ. Попытаемся восстановиться по нему.
		$result = mysqli_query($mysqli, 'SELECT * FROM tbl_users WHERE logkey="'.$key.'" LIMIT 1');

		if (mysqli_num_rows($result) > 0) {
			// Юзер найден
			$row = mysqli_fetch_assoc($result);
			initSession($row);
			return true;
		}
	}
	return false;
}

// В сессию записываем юзерские данные, а в куки - новый куки-ключ
function initSession($row) {
    global $userId;
    $userId = intVal($row['id_user']);
    $_SESSION['plasma_user_id'] = $userId;
    createCookieKey($userId);
}

// Добавляет команду в $outputBuffer
// В разультирующем json'е она будет лежать в поле под названием $command
function respond($command, $json) {
    global $outputBuffer;
    array_push($outputBuffer, '"'.$command.'":'.$json);
}

// Склеивает все json'ы в буфере $outputBuffer и возвращает клиенту
function sendResponce() {
    global $outputBuffer;
    global $logBuffer;

    // добавим логи
    if (count($logBuffer) > 0) {
        array_push($outputBuffer, '"log":'.'['.implode(",", $logBuffer).']');
    }

    echo('{'.implode(",", $outputBuffer).'}');
}

// Добавляет лог-сообщение в выдачу для клиента 
function lll($s) {
    global $logBuffer;
    array_push($logBuffer, '"'.jsonifyMessageText($s).'"');
}

// Возвращает долговременный ключ сессии, сохранённый в куках
function getCookieKey() {
    $key = @$_COOKIE[COOKIE_KEY_CODE];
    if (!empty($key)) {
        // Защитимся от кулхацкеров
        $key = str_replace('"', '', $key);
        $key = str_replace("'", '', $key);
        $key = str_replace("\\", '', $key);
    }
    return $key;
}

// Генерирует и сохраняет в куках долговременный ключ сессии. Возвращает его.
function createCookieKey($userId) {
	global $mysqli;

    $oneWeek = (3600 * (24 * 7));
    $key = guid();

    setcookie(COOKIE_KEY_CODE, $key, time() + $oneWeek, '', DOMAIN);

    mysqli_query($mysqli, 'UPDATE tbl_users SET logkey="'.$key.'", time_logged = NOW() WHERE id_user='.$userId.' LIMIT 1');
    return $key;
}

// Удаляет в куках долговременный ключ сессии
function clearCookieKey() {
    setcookie(COOKIE_KEY_CODE, "", time() - 3600, '', DOMAIN);
}

function guid(){
    //mt_srand(1);
    return sprintf('%04X%04X-%04X-%04X-%04X-%04X%04X%04X', mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(16384, 20479), mt_rand(32768, 49151), mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(0, 65535));
}

// Подготавливаем текст из бд для всовывания в json
function jsonifyMessageText($s) {

	// Сообщения в БД хранятся в специфичеки плазма-эскейпнутом виде. Раскукоживаем.
	$s = htmlspecialchars_decode($s);
	$s = html_entity_decode($s, ENT_QUOTES);

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

// Возвращает JSON с сообщениями канала - 50 верхних плюс звезданутые и те, на которых висят завезданутые
function getChannelJson($channelId, $lastViewed) {
	global $mysqli;

	$a = array();
	$rootIds = array();
	$childIds = array();

	// Получаем из БД страницу из 50 сообщений верхнего уровня

	$sql  = 'SELECT';
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children';
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
		$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, -1'; 
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
	$sql .= ' id_message, id_parent, id_first_parent, children, nick, CONCAT(subject, " ", message), time_created, children';
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

		if ($row[7] > 0) {
			$s .= ',"cm":"'.$row[7].'"';								    // Количество детей (только у верхнеуровневых)
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

// Отрезает путь, возвращает имя файла
function getFileName($path) {
	$s = '';
	for($i = 0; $i < strlen($path); $i++) {
		$c = substr($path, $i, 1);
		if($c == '\\') {
			$c = '/';
		}
		$s .= $c;
	}
	$path = $s;

	$a = explode('/', $path);
	return $a[count($a) - 1];
}

// Отрезает имя файла, возвращает расширение
function getFileExtension($path) {
	$name = getFileName($path);
	$a = explode('.', $name);
	return $a[1];
}

// Отрезает имя файла без расширения
function getFileNameNoExtension($path) {
	$name = getFileName($path);
	$a = explode('.', $name);
	return $a[0];
}

// Тип файла: image, file
function getFileType($path) {
	$ex = getFileExtension($path);
	switch($ex) {
		case 'jpg':
		case 'jpeg':
		case 'gif':
		case 'png':
			return 'image';

		default:
			return 'file';
	}
}

?>