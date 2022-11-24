<? // REST логирует всякое

include("include/main.php");
loginBySessionOrToken();

$message = $input['message'];
$nick = substr($user['nick'], 0, 30);

if (!empty($_SERVER['REMOTE_ADDR'])) {
    $ip = $_SERVER['REMOTE_ADDR'];
} else {
    $ip = empty($_SERVER['HTTP_X_FORWARDED_FOR']) ? '' : $_SERVER['HTTP_X_FORWARDED_FOR'];
}

$sql = $mysqli->prepare('
	INSERT INTO tbl_log
	SET 
        user_name=?,
		id_user=?,
		action=?,
		time_created=NOW(),
		ip=?
');
$sql->bind_param("siss", $nick, $user['id_user'], $message, $ip);
$sql->execute();

?>