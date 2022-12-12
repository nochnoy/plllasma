<? 
/**
	REST возвращает список людей
	Параметр nick (необязательный) - если хотим получить инфу по конкретному юзеру
*/

include("include/main.php");
loginBySessionOrToken();

$nick = @$input['nick'];
$userId	= null;

// Запросили конкретного юзера?
if (!empty($nick)) {
	$sql = $mysqli->prepare('SELECT id_user FROM tbl_users WHERE nick=? LIMIT 1');
	$sql->bind_param("s", $nick);
	$sql->execute();
	$userId = $sql->get_result()->fetch_all(MYSQLI_ASSOC)[0]['id_user'];
}

// Получим массив с инфой о переписке с юзерами
$sql = $mysqli->prepare('
	SELECT conversation_with as id_user, COUNT(id_mail) AS inboxSize, IF(unread="t", 1, 0) AS inboxStarred
	FROM tbl_mail
	WHERE id_user=?
	'.((empty($userId) ? '' : ' AND conversation_with = '.$userId)).'
	GROUP BY conversation_with
');
$sql->bind_param("i", $user['id_user']);
$sql->execute();
$result = $sql->get_result();
$inboxConversations = $result->fetch_all(MYSQLI_ASSOC);
$inboxConversationsById = array();
for ($i = 0; $i < count($inboxConversations); $i++) {
	$inboxConversationsById[$inboxConversations[$i]['id_user']] = $inboxConversations[$i];
}

// Получим массив юзеров
$sql = $mysqli->prepare('
	SELECT
	u.id_user, u.nick, u.sex, u.description, u.time_logged, u.time_joined, u.msgcount, u.city, u.country, u.profile, u.profile_visits, l.time_visitted
	,IF(TO_DAYS(NOW())-TO_DAYS(time_logged)>30, 1, 0) AS gray
	,IF(TO_DAYS(NOW())-TO_DAYS(time_logged)>360 OR ISNULL(time_logged) OR time_logged="0000-00-00 00:00:00", 1, 0) AS dead
	,IF(u.profile_changed > l.time_visitted OR (l.time_visitted IS NULL), 1, 0) AS profileStarred
	FROM tbl_users u
	LEFT JOIN lnk_user_profile l ON (l.id_viewed_user=u.id_user AND l.id_user=?)
	'.((empty($userId) ? '' : ' WHERE u.id_user = '.$userId)).'
	ORDER BY nick ASC
');
$sql->bind_param("i", $user['id_user']);
$sql->execute();
$result = $sql->get_result();
$users = $result->fetch_all(MYSQLI_ASSOC);

// Выкинем юзеров с "?" в начале ника - это не прошедшие кандидаты
$users = array_filter(
	$users, 
	function($user, $key) {
		if ($user['id_user'] == 0) {
			return false; // Юзер "Plasma" - это технический юзер, не выводим его
		}
		if ($user['id_user'] == 1) {
			return false; // Юзер "Guest" - это технический юзер, не выводим его
		}		
		return $user['nick'][0] != '?';
	},
	ARRAY_FILTER_USE_BOTH);
$users = array_values($users); // Восстановим индексы после фильтрации

for ($i = 0; $i < count($users); $i++) {

	// Вольём инфу об инбоксе
	$inboxInfo = @$inboxConversationsById[$users[$i]['id_user']];
	if (!empty($inboxInfo)) {
		$users[$i]['inboxSize'] = $inboxInfo['inboxSize'] ?? 0;
		$users[$i]['inboxStarred'] = $inboxInfo['inboxStarred'] ?? 0;
	} else {
		$users[$i]['inboxSize'] = 0;
		$users[$i]['inboxStarred'] = 0;
	}

	// Нормализуем поля
	$users[$i]['dead'] = boolval($users[$i]['dead']);
	$users[$i]['gray'] = boolval($users[$i]['gray']);
	$users[$i]['inboxStarred'] = boolval($users[$i]['inboxStarred']);
	$users[$i]['profileStarred'] = boolval($users[$i]['profileStarred']);
	if (empty($users[$i]['sex'])) {
		$users[$i]['sex'] = 0;
	}	
	if (empty($users[$i]['description'])) {
		$users[$i]['description'] = '';
	}
	if (empty($users[$i]['city'])) {
		$users[$i]['city'] = '';
	}
	if (empty($users[$i]['country'])) {
		$users[$i]['country'] = '';
	}

	// Фотка в профиле
	$photo = '../profilephotos/'.$users[$i]['id_user'].'.jpg';
	if(file_exists($photo)) {
		$users[$i]['profilephoto'] = 'https://plllasma.com/profilephotos/'.$users[$i]['id_user'].'.jpg';
	} else {
		$users[$i]['profilephoto'] = '';
	}

	// Нехуй светить айдишники
	unset($users[$i]['id_user']); 
}

// Выдадим
exit(json_encode((object)[
	'users' => $users
]));

?>