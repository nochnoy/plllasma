<? 
// REST увеличения счётчика просмотра профиля юзера

include("include/main.php");
loginBySessionOrToken();

$nick = @$input['nick'];

$stmt = $mysqli->prepare('UPDATE tbl_users SET profile_visits = profile_visits + 1 WHERE nick=? LIMIT 1');
$stmt->bind_param("s", $nick);
$stmt->execute();

exit(json_encode((object)[
	'ok' => true
]));


?>