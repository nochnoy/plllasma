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

function guid4($trim = true) {
    // Windows
    if (function_exists('com_create_guid') === true) {
        if ($trim === true)
            return trim(com_create_guid(), '{}');
        else
            return com_create_guid();
    }

    // OSX/Linux
    if (function_exists('openssl_random_pseudo_bytes') === true) {
        $data = openssl_random_pseudo_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);    // set version to 0100
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);    // set bits 6-7 to 10
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    // Fallback (PHP 4.2+)
    mt_srand((double)microtime() * 10000);
    $charid = strtolower(md5(uniqid(rand(), true)));
    $hyphen = chr(45);                  // "-"
    $lbrace = $trim ? "" : chr(123);    // "{"
    $rbrace = $trim ? "" : chr(125);    // "}"
    $guidv4 = $lbrace.
              substr($charid,  0,  8).$hyphen.
              substr($charid,  8,  4).$hyphen.
              substr($charid, 12,  4).$hyphen.
              substr($charid, 16,  4).$hyphen.
              substr($charid, 20, 12).
              $rbrace;
    return $guidv4;
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