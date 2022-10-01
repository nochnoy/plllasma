<?

// Юзер авторизован?
function isAuthorized() {
    global $user;
    return !empty($user);
}

// Авторизует юзера из сессии или по токену
function loginBySessionOrToken() {
	if (!loadUserFromSession()) {
		if (!loadUserByToken()) {
			die('{"error": "auth"}');
		}
	}
}

// Пробуем восстановить юзерские данные из сессии
function loadUserFromSession() {
	global $mysqli;
	global $userId;
	global $user;

	$userId = @$_SESSION['plasma_user_id'];
	$user = @$_SESSION['plasma_user'];

	if (empty($user)) {
		// В сессии лежит userId но нет самого user
		// Значит сессия была сформирована в старой плазме
		// Подтянем user из БД и положим в сессию
		$q = $mysqli->prepare('SELECT * FROM tbl_users WHERE id_user=? LIMIT 1');
		$q->bind_param("i", $userId);
		$q->execute();
		$result = $q->get_result();
		if (mysqli_num_rows($result) > 0) {
			$row = mysqli_fetch_assoc($result);
			updateUserFromDb($row);
			saveUserToSession();
		}
	}

	return !empty($user);
}

// Пробуем восстановить сессию а затем юзерские данные через токен в cookies
function loadUserByToken() {
	global $mysqli;

	$token = getToken();
	if (isset($token)) {
		//$result = mysqli_query($mysqli, 'SELECT * FROM tbl_users WHERE logkey="'.$token.'" LIMIT 1');
		$stmt = $mysqli->prepare('SELECT * tbl_users WHERE logkey=? LIMIT 1');
		$stmt->bind_param("s", $token);
		$stmt->execute();
		$result = $stmt->get_result();
		if (mysqli_num_rows($result) > 0) {
			$row = mysqli_fetch_assoc($result);
			updateUserFromDb($row);
			saveUserToSession();
			createToken();
			return true;
		}
	}
	return false;
}

function loginByPassword($login, $password) {
	$stmt = $mysqli->prepare('SELECT * FROM tbl_users WHERE login=? AND password=? LIMIT 1');
	$stmt->bind_param("ss", $input['login'], $input['password']);
	$stmt->execute();
	$result = $stmt->get_result();
	if ($result->num_rows > 0) {
		updateUserFromDb($result->fetch_assoc());
		saveUserToSession();
		createToken();
		exit(json_encode(getUserInfoForClient()));
	} else {
		exit('{"error": "auth"}');
	}
}

// В сессию записываем юзерские данные
function saveUserToSession() {
	global $user;
    global $userId;

	if (!empty($userId)) {
    	$_SESSION['plasma_user_id'] = $userId;
	}
	if (!empty($user)) {
		$_SESSION['plasma_user'] = $user;
	}
}

// Создаёт и сохраняет в куках токен авторизации
function createToken() {
	global $user;

	$userId = $user['id_user'];
    $oneWeek = (3600 * (24 * 7));
    $key = guid();
    setcookie(COOKIE_KEY_CODE, $key, time() + $oneWeek, '', DOMAIN);

    //mysqli_query($mysqli, 'UPDATE tbl_users SET logkey="'.$key.'", time_logged = NOW() WHERE id_user='.$userId.' LIMIT 1');
	$stmt = $mysqli->prepare('UPDATE tbl_users SET logkey=?, time_logged=NOW() WHERE id_user=? LIMIT 1');
	$stmt->bind_param("si", $key, $userId);
	$stmt->execute();	
}

// Достаёт из кук токен авторизации
function getToken() {
    $key = @$_COOKIE[COOKIE_KEY_CODE];
    if (!empty($key)) {
        // Защитимся от кулхацкеров
        $key = str_replace('"', '', $key);
        $key = str_replace("'", '', $key);
        $key = str_replace("\\", '', $key);
    }
    return $key;
}

// Удаляет из кук токен авторизации
function clearToken() {
    setcookie(COOKIE_KEY_CODE, "", time() - 3600, '', DOMAIN);
}

// Вливает запись из таблицы в БД в глобальную переменную $user
// По ходу делает все нужные трансформации
function updateUserFromDb($rec) {
	global $user;

	if (empty($user)) {
		$user = $rec;
	} else {
		$user = (object)array_merge((array) $user, (array) $rec);
	}

	// В БД в поле icon лежит 1 или 0. 
	// Если 1 значит иконка есть. Положим туда id юзера т.к. файл иконки назван по id.
	// Иначе положим туда признак отсутствия иконки - минус.
	if (!$user['icon']) {
		$user['icon'] = $user['id_user'];
	} else {
		$user['icon'] = '-';
	}
}

// Возвращает объект с юзерскими данными в формате, ожидаемом клиентом
function getUserInfoForClient() {
	global $user;

	return (object)[
		'userId' => $user['id_user'],
		'nick' => $user['nick'],
	];
}

?>