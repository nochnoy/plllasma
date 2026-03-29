<? 
// Регистрация: e-mail (в login и email, lower-case), password, nick — письмо с логином и паролем

include("include/main.php");

sleep(1);

if (!is_array($input)) {
	$input = [];
}

function registration_public_places($mysqli) {
	$sql = 'SELECT id_place, at_menu, `weight` FROM tbl_places WHERE privacy_mode = \'open\' ORDER BY `weight`, id_place';
	$res = $mysqli->query($sql);
	if (!$res) {
		return [];
	}
	$out = [];
	while ($row = $res->fetch_assoc()) {
		$out[] = [
			'id_place' => (int)$row['id_place'],
			'at_menu' => ($row['at_menu'] === 't') ? 't' : 'f',
			'weight' => isset($row['weight']) ? (int)$row['weight'] : 100,
		];
	}
	return $out;
}

$email = mb_strtolower(trim((string)@$input['email']));
$login = $email;
$password = (string)@$input['password'];
$nick = trim((string)@$input['nick']);

if ($email === '' || $password === '' || $nick === '') {
	exit(json_encode((object)['error' => 'invalid_input']));
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
	exit(json_encode((object)['error' => 'invalid_email']));
}

if (mb_strlen($password, 'UTF-8') < 6) {
	exit(json_encode((object)['error' => 'weak_password']));
}

if (mb_strlen($login, 'UTF-8') > 80) {
	exit(json_encode((object)['error' => 'login_long']));
}

if (mb_strlen($nick, 'UTF-8') > 32) {
	exit(json_encode((object)['error' => 'nick_long']));
}

if (mb_strtolower($nick, 'UTF-8') === mb_strtolower('Привидение', 'UTF-8')) {
	exit(json_encode((object)['error' => 'nick_reserved']));
}

$publicPlaces = registration_public_places($mysqli);
if (empty($publicPlaces)) {
	exit(json_encode((object)['error' => 'places']));
}

$q = $mysqli->prepare(
	'SELECT id_user FROM tbl_users WHERE LOWER(login) = ? OR LOWER(TRIM(email)) = ? LIMIT 1'
);
$q->bind_param('ss', $login, $email);
$q->execute();
if ($q->get_result()->num_rows > 0) {
	exit(json_encode((object)['error' => 'login_taken']));
}

$q = $mysqli->prepare('SELECT id_user FROM tbl_users WHERE nick = ? LIMIT 1');
$q->bind_param('s', $nick);
$q->execute();
if ($q->get_result()->num_rows > 0) {
	exit(json_encode((object)['error' => 'nick_taken']));
}

$stmt = $mysqli->prepare(
	'INSERT INTO tbl_users (login, password, nick, email, time_joined, country, businesstext, realname, firstnick, profile, profile_visits, profile_changed) '.
	'VALUES (?, ?, ?, ?, NOW(), "", "", "", ?, "", 0, NOW())'
);
$stmt->bind_param('sssss', $login, $password, $nick, $email, $nick);
$stmt->execute();
$newUserId = (int)mysqli_insert_id($mysqli);

if ($newUserId <= 0) {
	exit(json_encode((object)['error' => 'server']));
}

$roleWriter = ROLE_WRITER;
$addedByScript = 1;

foreach ($publicPlaces as $place) {
	$placeId = $place['id_place'];
	$sql = $mysqli->prepare('INSERT INTO tbl_access (id_user, id_place, role, addedbyscript) VALUES (?, ?, ?, ?)');
	$sql->bind_param('iiii', $newUserId, $placeId, $roleWriter, $addedByScript);
	$sql->execute();
}

$chkLnk = $mysqli->prepare('SELECT id FROM lnk_user_place WHERE id_place = ? AND id_user = ? LIMIT 1');
$insLnk = $mysqli->prepare(
	'INSERT INTO lnk_user_place (id_place, id_user, at_menu, time_viewed, weight, ignoring) VALUES (?, ?, ?, NOW(), ?, 0)'
);
$updLnk = $mysqli->prepare('UPDATE lnk_user_place SET at_menu = ?, weight = ? WHERE id_place = ? AND id_user = ? LIMIT 1');

foreach ($publicPlaces as $place) {
	$placeId = $place['id_place'];
	$atMenu = $place['at_menu'];
	$weight = $place['weight'];
	$chkLnk->bind_param('ii', $placeId, $newUserId);
	$chkLnk->execute();
	$resLnk = $chkLnk->get_result();
	$hasLnk = $resLnk && $resLnk->num_rows > 0;
	if ($resLnk) {
		$resLnk->free();
	}
	if (!$hasLnk) {
		$insLnk->bind_param('iisi', $placeId, $newUserId, $atMenu, $weight);
		$insLnk->execute();
	} else {
		$updLnk->bind_param('siii', $atMenu, $weight, $placeId, $newUserId);
		$updLnk->execute();
	}
}

registration_post_welcome_message($mysqli, $nick);

$mailBody =
	"Ваша учётная запись создана.\r\n\r\n".
	"URL: plllasma.ru (или plllasma.com)\r\n".
	"Логин: ".$login."\r\n".
	"Пароль: ".$password;

sendEmail('Plllasma.ru', $email, 'Добро пожаловать на Плазму', $mailBody);

$q = $mysqli->prepare('SELECT * FROM tbl_users WHERE id_user = ? LIMIT 1');
$q->bind_param('i', $newUserId);
$q->execute();
$row = $q->get_result()->fetch_assoc();
buildUser($row);
saveUserToSession();
createToken();
exit(json_encode(getUserInfoForClient()));
