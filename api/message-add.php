<? // REST для добавления нового фокуса фотки

include("include/main.php");

loginBySessionOrToken();

$placeId 			= @$_POST['placeId'];
$parentMessageId 	= @$_POST['parent'];
$message 			= @trim($_POST['message']);

if (!canWrite($placeId)) {
	die('{"error": "access"}');
}

$id_parent = 0;
$id_first_parent = 0;
$receivedFilesCount = 0;

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

$sss = ''; // <<<<<<<<<<<<<<<<<

for ($i = 0; $i < count($_FILES); $i++) { 
	$received_file = $_FILES['f'.$i]['tmp_name'];
	if ($received_file != "" && $received_file != "none") {

		$original_name = $_FILES['f'.$i]['name'];
		$filesize = $_FILES['f'.$i]['size'];
		$extention = strtolower(substr($original_name, strrpos($original_name, ".") + 1));

		$has_icon = 0;
		$file_type = 0; // тип файла: 0-просто файл, 1-jpg, 2-gif, 3-видео, 4-архив

		switch ($extention){
			case "jpg": 
			case "jfif":
			case "jpeg": $file_type=1; $has_icon = 1; break;

			case "gif": $file_type=2; break;

			case "divx":
			case "mpeg": 
			case "mpg": 
			case "wmv":
			case "ram":
			case "rm":
			case "swf":
			case "mov":
			case "asf":
			case "avi": $file_type=3; break;

			case "rar":
			case "arj":
			case "zip": $file_type=4; break;
		}

		$folderPath = getcwd().'/../attachments/'.$placeId.'/';

		$imagefile = $folderPath.$messageId.'_'.$i.".".$extention;
		copy($received_file, $imagefile);
		$receivedFilesCount++;

		if ($file_type == 1) {
			$thumbfile = $folderPath.$messageId.'_'.$i.'t.jpg';
			$img = @imagecreatefromjpeg($imagefile);

			if ($img) {
				$w = imagesx($img);
				$h = imagesy($img);
				$percent = $w / 80; // сжимаем ширину до 80 пикселей
				$w2 = $w / $percent;//thumb width
				$h2 = $h / $percent;//thumb height
				$tmb = @imagecreatetruecolor($w2, $h2);
				imagecopyresampled($tmb, $img, 0, 0, 0, 0, $w2, $h2, $w, $h);
				imagejpeg($tmb,  $thumbfile, 90);
				imagedestroy($img);
				imagedestroy($tmb);
			}

		}

		$sss .= $original_name.', ';

	}
}

if ($receivedFilesCount > 0) {
	mysqli_query($mysqli, 'UPDATE tbl_messages SET attachments='.$receivedFilesCount.' WHERE id_message='.$messageId.' LIMIT 1');
}

mysqli_query($mysqli, 'UPDATE tbl_places SET time_changed = NOW() WHERE id_place='.$placeId);

/*
// пошёл приём файлов
for($i=1; $i<=count($_FILES); $i++){ 
	$received_file=$_FILES['f'.$i]['tmp_name'];
	if($received_file!="" && $received_file!="none"){

		$receivedSomething = true;
		
		$original_name = $_FILES['f'.$i]['name'];
		$filesize = $_FILES['f'.$i]['size'];
		$description = txt2html($_REQUEST["txt".$i],0,50);
		$extention = strtolower(substr($original_name, strrpos($original_name, ".")+1));
		$has_icon = 0;
		$file_type=0; // тип файла - 0-просто файл, 1-jpg, 2-gif, 3-видео, 4-архив
		$dontdel = $_REQUEST['dd'];

		switch($extention){
			case "jpg": 
			case "jpeg": $file_type=1; $has_icon = 1; break;

			case "gif": $file_type=2; break;

			case "divx":
			case "mpeg": 
			case "mpg": 
			case "wmv":
			case "ram":
			case "rm":
			case "swf":
			case "mov":
			case "asf":
			case "avi": $file_type=3; break;

			case "rar":
			case "arj":
			case "zip": $file_type=4; break;
		}

		$sql = 				
		'INSERT INTO tbl_files ('
		.' id_user,'
		.' nick,'
		.' icon,'
		.' anonim,'
		.' id_storage,'
		.' id_place,'
		.' file_type,'
		.' description,'
		.' time_created,'
		.' time_updated,'
		.' has_icon,'
		.' original_name,'
		.' size,'
		.' extension,'
		.' dontdel,'
		.' attachment_id'
		.') VALUES ('
		.' '.$user->id.','
		.' "'.$nick.'",'
		.' '.$icn.','
		.' 0,' // anonim
		.' 1,'
		.' '.$id_place.',' 
		.' '.$file_type.','
		.' "'.$description.'",'
		.' NOW(),'
		.' NOW(),'
		.' '.$has_icon.','
		.' "'.$original_name.'",'
		.' '.$filesize.','
		.' "'.$extention.'",'
		.' '.$dontdel.','
		.' '.(empty($_REQUEST['sess']) ? 0 : $_REQUEST['sess'])
		.")";

		mysqli_query($mysqli, $sql);
		sqlerr();
		$id_file = mysqli_insert_id($mysqli);

		$imagefile=STORAGE.$id_file.".".$extention;
		copy($received_file, $imagefile);

		if($file_type==1){ // создаём тумбу
			$thumbfile=STORAGE.$id_file."t.jpg";
			$img=@imagecreatefromjpeg($imagefile);
			if ($img){
				$w=imagesx($img);
				$h=imagesy($img);
				$percent=$w/80;//насколько сжимаем (сжимаем ширину до 80 пикселей)
				$w2=$w/$percent;//thumb width
				$h2=$h/$percent;//thumb height
				$tmb = @imagecreatetruecolor($w2,$h2);
				imagecopyresampled($tmb, $img, 0, 0, 0, 0, $w2, $h2, $w, $h);
				imagejpeg($tmb,  $thumbfile, 90);
				imagedestroy($img);
				imagedestroy($tmb);
			}

			if(!file_exists($thumbfile)){
				mysqli_query($mysqli, 'UPDATE tbl_files SET has_icon=0 WHERE id_file='.$id_file);
			}
		}

	}
}
*/


exit(json_encode((object)[
	'messageId' => $messageId,
	'files' => $sss
]));

?>