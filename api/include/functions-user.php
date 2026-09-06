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

	// Списки игноров перечитываем на каждый запрос - они могли измениться с момента логина
	// (другой браузер, отмена vanish второй стороной), а сессия у активного юзера живёт долго
	loadUserIgnoreLists();
}

// Загружает в $user списки игнорируемых и взаимно исчезнувших юзеров
function loadUserIgnoreLists() {
	global $mysqli;
	global $user;

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
}

// Пересчитывает счётчик непрочитанных неподписанных каналов (суперзвезду)
// и сохраняет его в tbl_users. Вызывается при логине из buildUser().
// Канал непрочитан, если у юзера есть к нему доступ (роль непустая и не ROLE_NOBODY),
// канал не подписан в меню и не игнорится, и в нём есть непросмотренные сообщения
// (никогда не открытый канал считается непрочитанным).
function computeUnreadUnsubscribedChannels() {
	global $mysqli;
	global $user;

	$idUser = $user['id_user'];
	$roleNobody = ROLE_NOBODY;

	$baseWhere = 'a.id_user = ? AND a.role IS NOT NULL AND a.role <> ?'
		.' AND (l.id_place IS NULL OR (l.ignoring = 0 AND l.at_menu = "f" AND l.time_viewed < p.time_changed))';

	// Авторы, чьи новые сообщения не делают канал непрочитанным:
	// мягко игнорируемые юзеры и юзеры, с которыми взаимно исчезли
	$excludedAuthors = array_merge($user['ignored_soft'], $user['vanished']);

	if (count($excludedAuthors) == 0) {
		$sql = 'SELECT COUNT(*) FROM tbl_access a'
			.' JOIN tbl_places p ON p.id_place = a.id_place'
			.' LEFT JOIN lnk_user_place l ON l.id_user = a.id_user AND l.id_place = p.id_place'
			.' WHERE '.$baseWhere;
	} else {
		// EXISTS вынесен из условий отбора: derived-таблица дешёво отбирает
		// каналы-кандидаты по датам, и только для них проверяется,
		// есть ли новые сообщения не от исключённых авторов
		$sql = 'SELECT COUNT(*) FROM ('
			.' SELECT a.id_place, l.time_viewed FROM tbl_access a'
			.' JOIN tbl_places p ON p.id_place = a.id_place'
			.' LEFT JOIN lnk_user_place l ON l.id_user = a.id_user AND l.id_place = p.id_place'
			.' WHERE '.$baseWhere
			.') cc'
			.' WHERE EXISTS ('
			.' SELECT 1 FROM tbl_messages m'
			.' WHERE m.id_place = cc.id_place'
			.' AND (cc.time_viewed IS NULL OR m.time_created > cc.time_viewed)'
			.' AND (m.id_user IS NULL OR m.id_user NOT IN ('.implode(',', $excludedAuthors).'))'
			.')';
	}

	$q = $mysqli->prepare($sql);
	$q->bind_param("ii", $idUser, $roleNobody);
	$q->execute();
	$row = $q->get_result()->fetch_array();
	$user['unread_unsubscribed_channels'] = intval($row[0]);

	$q = $mysqli->prepare('UPDATE tbl_users SET unread_unsubscribed_channels = ? WHERE id_user = ?');
	$q->bind_param("ii", $user['unread_unsubscribed_channels'], $idUser);
	$q->execute();
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

	// Списки игнорируемых уродов
	loadUserIgnoreLists();

	// Суперзвезда (счётчик непрочитанных неподписанных каналов) пересчитывается при логине
	computeUnreadUnsubscribedChannels();

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
