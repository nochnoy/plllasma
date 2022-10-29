<? // REST для добавления нового фокуса фотки

include("include/main.php");

$maxMegabytes 		= 10;

$previewWidth 		= 160;
$previewHeight 		= 160;

$placeId 			= @$_POST['placeId'];
$parentMessageId 	= @$_POST['parent'];
$message 			= @trim($_POST['message']);

$channelFolder 		= getcwd().'/../attachments/'.$placeId.'/';
$iconFolder 		= getcwd().'/images/attachment-icons/';

$id_parent = 0;
$id_first_parent = 0;
$receivedFilesCount = 0;
$lll = '';

function lll($s) {
	global $lll;
	$lll = $lll . $s . ';';
}

loginBySessionOrToken();

if (!canWrite($placeId)) {
	die('{"error": "access"}');
}

// это коммент к другому cообщению
if (!empty($parentMessageId)) {
	$result = mysqli_query($mysqli, 'SELECT * FROM tbl_messages WHERE id_message='.$parentMessageId);
	if ($row = mysqli_fetch_assoc($result)) {
		$id_parent = (int)$row['id_message'];

		if ($row['id_place'] != $placeId) {
			if (!canWrite($placeId)) {
				die('{"error": "placeMoved"}');
			}
		} 

		if ($row['id_parent']=='0') {
			$id_first_parent = $row['id_message'];
		} else {
			$id_first_parent = $row['id_first_parent'];
		}
		// увеличиваем число детей
		mysqli_query($mysqli, 'UPDATE tbl_messages SET children=children+1 WHERE id_message='.$id_first_parent);
	}
}

mysqli_query($mysqli,
	'INSERT INTO tbl_messages SET'.
	' icon=1'. // привидение
	',anonim=1'. // привидение
	',nick="Привидение"'.
	',id_user='.$user['id_user'].
	',id_place='.$placeId.
	',id_first_parent='.$id_first_parent.
	',id_parent='.$id_parent.
	',message="'.txt2html($message).'"'.
	',subject=""'.
	',time_created=NOW()'.
	',place_type=0'
);
$messageId = mysqli_insert_id($mysqli);

// Принимаем файлы, если они были

// Если папки не было, создадим и зададим права
if (!file_exists($channelFolder)) {
	lll('Creating folder '. $channelFolder);
	mkdir($channelFolder, 0777, true);
}

$receivedFilesCount = 0;

for ($i = 0; $i < count($_FILES); $i++) {
	$received_file = $_FILES['f'.$i]['tmp_name'];
	if ($received_file != "" && $received_file != "none") {

		$original_name = $_FILES['f'.$i]['name'];
		$filesize = $_FILES['f'.$i]['size'];
		$extention = strtolower(substr($original_name, strrpos($original_name, ".") + 1));

		if ($filesize / (1024 * 1024) > $maxMegabytes) {
			lll($original_name.' too big');
			continue;
		}

		lll('Adding '. $original_name);

		$fileName = $channelFolder.$messageId.'_'.$receivedFilesCount.'.'.$extention;
		copy($received_file, $fileName);
		$thumbfile = $channelFolder.$messageId.'_'.$receivedFilesCount.'t.jpg';

		$img = null;

		switch ($extention){

			case 'jpg':
			case 'jpeg':
			case 'jpe':
			case 'jif':
			case 'jfif':
				$img = @imagecreatefromjpeg($fileName);
				break;

			case "gif":
				$img = @imagecreatefromgif($fileName);
				break;

			case 'png':
				$img = @imagecreatefrompng($fileName);
				break;

			case 'webp':
				$img = @imagecreatefromwebp($fileName);
				break;

			case 'bmp':
				$img = @imagecreatefrombmp($fileName);
				break;
		}

		if ($img) {

			$w = imagesx($img);
			$h = imagesy($img);

			if($w > $h) {
				$percent = $h / $previewHeight;
			} else {
				$percent = $w / $previewWidth;
			}

			$w2 = $w / $percent;
			$h2 = $h / $percent;

			$tmb = @imagecreatetruecolor($previewWidth, $previewHeight);
			imagecopyresampled($tmb, $img, ($previewWidth / 2) - ($w2 / 2), ($previewHeight / 2) - ($h2 / 2), 0, 0, $w2, $h2, $w, $h);			

		} else {

			$icon = null;
			$mimeType = mime_content_type($fileName);	
			$mime = explode('/', $mimeType)[0];			

			switch ($mime) {

				case 'image':
					$icon = imagecreatefrompng($iconFolder.'image.png');
					break;

				case 'video':
					$icon = imagecreatefrompng($iconFolder.'video.png');
					break;

				default:

					switch($extention) {
						case 'zip':
						case 'rar':
						case 'tar':
						case 'tga':
						case 'iso':
						case '7z':
						case 's7z':
						case 'gz':
							$icon = imagecreatefrompng($iconFolder.'archive.png');
							break;

						default:
						$icon = imagecreatefrompng($iconFolder.'file.png');
					}
			}

			$tmb = @imagecreatetruecolor($previewWidth, $previewHeight);
			if ($icon) {
				$result = imagecopyresampled($tmb, $icon, 0, 0, 0, 0, $previewWidth, $previewHeight, $previewWidth, $previewHeight);
				imagedestroy($icon);
			}

		}

		imagejpeg($tmb,  $thumbfile, 90);
		imagedestroy($tmb);

		if ($img) {
			imagedestroy($img);
		}

		$receivedFilesCount++;
	}
}

if ($receivedFilesCount > 0) {
	mysqli_query($mysqli, 'UPDATE tbl_messages SET attachments='.$receivedFilesCount.' WHERE id_message='.$messageId.' LIMIT 1');
}

mysqli_query($mysqli, 'UPDATE tbl_places SET time_changed = NOW() WHERE id_place='.$placeId);

exit(json_encode((object)[
	'messageId' => $messageId,
	'log' => $lll
]));

?>