<?

// Юзер авторизован?
function isAuthorized() {
    global $userId;
    return !empty($userId);
}

// Возвращает объект с юзерскими данными в формате, ожидаемом клиентом
function getUserInfoForClient() {
	
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

?>