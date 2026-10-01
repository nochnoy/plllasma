<?
// REST для авторизации серверного сервиса (go-бэкенд на том же сервере) по токену.
// Токен тот же, что у браузерного фронта (logkey из tbl_users), берём по приоритету:
// 		заголовок X-Auth-Token
// 		заголовок Authorization: Bearer <токен>
// 		параметр token в query string или в JSON-теле
// 		кука contortion_key (как у браузерного фронта)
// Ответ: JSON с userId, nick, icon (имя юзерпика без расширения) и iconsPath (адрес папки юзерпиков).
// Полный адрес юзерпика: iconsPath + icon + '.gif'.
// Не удалось авторизоваться - HTTP 401.
// В отличие от loadUserByToken() токен здесь не ротируется и в куках не выставляется:
// сервисный вызов не должен инвалидировать токен браузерной сессии с тем же logkey.

include("include/main.php");

$token = '';

if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
	$token = $_SERVER['HTTP_X_AUTH_TOKEN'];
} elseif (!empty($_SERVER['HTTP_AUTHORIZATION']) && preg_match('/^Bearer\s+(\S+)$/i', trim($_SERVER['HTTP_AUTHORIZATION']), $m)) {
	$token = $m[1];
} elseif (!empty($_REQUEST['token'])) {
	$token = $_REQUEST['token'];
} elseif (!empty($input['token'])) {
	$token = $input['token'];
} else {
	$token = @$_COOKIE[COOKIE_KEY_CODE];
}

// Защитимся от кулхацкеров, как в getToken()
$token = str_replace(array('"', "'", "\\"), '', (string)$token);

if ($token == '') {
	http_response_code(401);
	exit('{"error": "auth"}');
}

$q = $mysqli->prepare('SELECT id_user, nick, icon FROM tbl_users WHERE logkey=? LIMIT 1');
$q->bind_param("s", $token);
$q->execute();
$row = $q->get_result()->fetch_assoc();

if (empty($row)) {
	http_response_code(401);
	exit('{"error": "auth"}');
}

// В БД в поле icon лежит 1 или 0.
// Если 1 значит иконка есть, файл иконки назван по id юзера.
// Иначе признак отсутствия иконки - минус (в папке юзерпиков есть -.gif).
$icon = !empty($row['icon']) ? (string)$row['id_user'] : '-';

// Папка юзерпиков лежит в корне сайта рядом с api/.
// Адрес строим от хоста запроса, чтобы тот, кто дёрнул api по публичному домену,
// получил публичный адрес иконок, открываемый из браузера
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] != 'off') ? 'https' : 'http';
$iconsPath = $scheme . '://' . $_SERVER['HTTP_HOST'] . '/i/';

exit(json_encode(array(
	'userId'	=> intval($row['id_user']),
	'nick'		=> $row['nick'],
	'icon'		=> $icon,
	'iconsPath'	=> $iconsPath
), JSON_UNESCAPED_UNICODE));
?>
