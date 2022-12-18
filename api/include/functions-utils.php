<?

// Добавляет команду в $outputBuffer
// В разультирующем json'е она будет лежать в поле под названием $command
function respond($command, $json) {
    global $outputBuffer;
    array_push($outputBuffer, '"'.$command.'":'.$json);
}

function guid() {
    return sprintf('%04X%04X-%04X-%04X-%04X-%04X%04X%04X', mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(16384, 20479), mt_rand(32768, 49151), mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(0, 65535));
}

function logActivity($message) {
	global $user;
	global $HTTP_SERVER;
	global $mysqli;

	if (!empty($_SERVER['REMOTE_ADDR'])) {
		$ip = $_SERVER['REMOTE_ADDR'];
	}
	else{
		$ip = empty($_SERVER['HTTP_X_FORWARDED_FOR']) ? '' : $_SERVER['HTTP_X_FORWARDED_FOR'];
	}

	mysqli_query($mysqli, 'INSERT INTO tbl_log(user_name, id_user, action, time_created, ip) VALUES ("'.substr($user['nick'],0,30).'",'.$user['id_user'].',"PIII '.$message.'",NOW(), "'.$ip.'")');
}

function sendEmail($from_name, $to, $subject, $message) {
	$from = "notification@plllasma.ru";

	$headers = 
		"From: =?UTF-8?B?".base64_encode($from_name)."?= <".$from.">\n".
		"MIME-Version: 1.0\n".
		"Content-type: text/plain; charset=utf-8\n".
		"Content-Transfer-Encoding: 8bit\n";

	mail(
		$to, 
		($subject!="")?"=?UTF-8?B?".base64_encode($subject)."?=":"", 
		str_replace("\r\n","\n",$message), 
		$headers
	); 
}

?>