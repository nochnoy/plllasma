<?

// Юзер авторизован?
function isAuthorized() {
    global $user;
    return !empty($user);
}

// Авторизует юзера из сессии или по токену
function loginBySessionOrToken() {
	global $user;
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
	$oldPlasmaUser = @$_SESSION['user'];

	// В сессии юзера нет, но есть сессия старой плазмы
	// в oldPlasmaUser находится "incomplete" объект юзера из старой плазмы
	// переведём его в строку и выцепим id юзера	
	if (empty($user) && !empty($oldPlasmaUser)) {
		try {
			$s = var_export($oldPlasmaUser, true);
			$a = explode("'id' => '", $s);
			$a = explode("'", $a[1]);
			$userId = intval($a[0]);

		} catch (Exception $e) {
			return false; // Не судьба
		}

		$q = $mysqli->prepare('SELECT * FROM tbl_users WHERE id_user=? LIMIT 1');
		$q->bind_param("i", $userId);
		$q->execute();
		$result = $q->get_result();
		if (mysqli_num_rows($result) > 0) {
			$row = mysqli_fetch_assoc($result);
			buildUser($row);
			saveUserToSession();
		}
	}

	return !empty($user);
}

// Пробуем восстановить сессию а затем юзерские данные через токен в cookies
function loadUserByToken() {
	global $mysqli;

	sleep(2); // Защита от брутфорса

	$token = getToken();
	if (isset($token)) {
		$q = $mysqli->prepare('SELECT * FROM tbl_users WHERE logkey=? LIMIT 1');
		$q->bind_param("s", $token);
		$q->execute();
		$result = $q->get_result();
		if (mysqli_num_rows($result) > 0) {
			$row = mysqli_fetch_assoc($result);
			buildUser($row);
			saveUserToSession();
			createToken();
			return true;
		}
	}
	return false;
}

function loginByPassword($login, $password) {
	global $mysqli;

	sleep(2); // Защита от брутфорса

	$login = mb_strtolower(trim((string)$login));

	$q = $mysqli->prepare('SELECT * FROM tbl_users WHERE LOWER(login) = ? AND password = ? LIMIT 1');
	$q->bind_param("ss", $login, $password);
	$q->execute();
	$result = $q->get_result();
	if ($result->num_rows > 0) {
		buildUser($result->fetch_assoc());
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
	global $mysqli;
	global $user;

	$userId = $user['id_user'];
    $oneWeek = (3600 * (24 * 7));
    $key = guid();
    setcookie(COOKIE_KEY_CODE, $key, time() + $oneWeek, '', DOMAIN);

	$q = $mysqli->prepare('UPDATE tbl_users SET logkey=?, time_logged=NOW() WHERE id_user=? LIMIT 1');
	$q->bind_param("si", $key, $userId);
	$q->execute();
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
function buildUser($rec) {
	global $mysqli;	
	global $user;

	if (empty($user)) {
		$user = $rec;
	} else {
		$user = (object)array_merge((array) $user, (array) $rec);
	}

	// В БД в поле icon лежит 1 или 0. 
	// Если 1 значит иконка есть. Положим туда id юзера т.к. файл иконки назван по id.
	// Иначе положим туда признак отсутствия иконки - минус.
	if (!empty($user['icon'])) {
		$user['icon'] = $user['id_user'];
	} else {
		$user['icon'] = '-';
	}

	// Списки игнорируемых уродов:
	// ignored_soft - кого юзер мягко игнорит (их сообщения читаются, но не подсвечиваются)
	// vanished - с кем юзер взаимно исчез (в обе стороны, независимо от инициатора)
	// vanished_by_me - vanish-записи, где инициатор сам юзер (только он может отменить)
	$user['ignored_soft'] = array();
	$user['vanished'] = array();
	$user['vanished_by_me'] = array();

	$q = $mysqli->prepare('SELECT id_user, id_ignored_user, mode FROM lnk_user_ignore WHERE id_user=? OR id_ignored_user=?');
	$q->bind_param("ii", $user['id_user'], $user['id_user']);
	$q->execute();
	$result = $q->get_result();
	while ($row = mysqli_fetch_assoc($result)) {
		if ($row['mode'] == 1 && $row['id_user'] == $user['id_user']) {
			$user['ignored_soft'][] = intval($row['id_ignored_user']);
		} elseif ($row['mode'] == 2) {
			if ($row['id_user'] == $user['id_user']) {
				$user['vanished'][] = intval($row['id_ignored_user']);
				$user['vanished_by_me'][] = intval($row['id_ignored_user']);
			} else {
				$user['vanished'][] = intval($row['id_user']);
			}
		}
	}

	// Загрузим доступы юзера
	$user['access'] = array();

	$q = $mysqli->prepare('SELECT DISTINCT id_place, role  FROM tbl_access WHERE id_user=?');
	$q->bind_param("i", $user['id_user']);
	$q->execute();
	$result = $q->get_result();
	while ($row = mysqli_fetch_assoc($result)) {
		$user['access'][] = $row;
	}
}

// Возвращает объект с юзерскими данными в формате, ожидаемом клиентом
function getUserInfoForClient() {
	global $user;
	return (object)[
		'userId' 			=> $user['id_user'],
		'nick' 				=> $user['nick'],
		'icon' 				=> $user['icon'],
		'access'			=> @$user['access'],
		'unreadChannels'	=> @$user['unread_unsubscribed_channels'],
		'ignoredSoft'		=> @$user['ignored_soft'],
		'vanished'			=> @$user['vanished'],
		'vanishedByMe'		=> @$user['vanished_by_me']
	];
}

function canRead($channelId) {
	global $user;
	if (empty($user['access'])) {
		return false;
	} else {
		foreach ($user['access'] as $o) {
			if ($o['id_place'] == $channelId) {
				$role = intval($o['role']);
				if ($role != ROLE_NOBODY) {
					return true;
				}
			}
		}
		return false;
	}
}

function canWrite($channelId) {
	global $user;
	if (empty($user['access'])) {
		return false;
	} else {
		foreach ($user['access'] as $o) {
			if ($o['id_place'] == $channelId) {
				$role = intval($o['role']);
				if ($role != ROLE_NOBODY) {
					return true;
				}
			}
		}
		return false;
	}
}

function canAdmin($channelId) {
	global $user;
	if (empty($user['access'])) {
		return false;
	} else {
		foreach ($user['access'] as $o) {
			if ($o['id_place'] == $channelId) {
				$role = intval($o['role']);
				if ($role == ROLE_MODERATOR || $role == ROLE_ADMIN || $role == ROLE_OWNER || $role == ROLE_GOD) {
					return true;
				}
			}
		}
		return false;
	}
}

// Может ли отправлять сообщения в мусорку
function canTrash($channelId) {
	global $user;
	if (empty($user['access'])) {
		return false;
	} else {
		foreach ($user['access'] as $o) {
			if ($o['id_place'] == $channelId) {
				$role = intval($o['role']);
				if ($role == ROLE_MODERATOR || $role == ROLE_ADMIN || $role == ROLE_OWNER || $role == ROLE_GOD) {
					return true;
				}
			}
		}
		return false;
	}
}

// Может ли редактировать матрицу канала
function canEditMatrix($channelId) {
	global $user;
	if (empty($user['access'])) {
		return false;
	} else {
		foreach ($user['access'] as $o) {
			if ($o['id_place'] == $channelId) {
				$role = intval($o['role']);
				if ($role == ROLE_ADMIN || $role == ROLE_OWNER || $role == ROLE_GOD) {
					return true;
				}
			}
		}
		return false;
	}
}

function killAllSessions() {
	$path = session_save_path();
	$files = glob($path.'/*');
	foreach($files as $file){
	  if (is_file($file) && strpos($file, '/sess_') !== false) {
		unlink($file);
	  }
	}
}

?>
