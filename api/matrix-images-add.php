<? // REST для добавления нового фокуса фотки

include("include/main.php");

$maxMegabytes 		= MATRIX_IMAGE_MAX_WEIGHT_MB;

$previewWidth 		= PREVIEW_IMAGE_WIDTH;
$previewHeight 		= PREVIEW_IMAGE_HEIGHT;

$placeId 			= @$_POST['placeId'];

$matrixFolder 		= getcwd().'/../matrix/'.$placeId.'/';

$images = array();

loginBySessionOrToken();

if (!canEditMatrix($placeId)) {
	die('{"error": "access"}');
}

// Если папки не было, создадим и зададим права
if (!file_exists($matrixFolder)) {
	mkdir($matrixFolder, 0777, true);
}

for ($i = 0; $i < count($_FILES); $i++) {
	$received_file = $_FILES['f'.$i]['tmp_name'];
	if ($received_file != "" && $received_file != "none") {

		$original_name = $_FILES['f'.$i]['name'];
		$filesize = $_FILES['f'.$i]['size'];
		$extention = strtolower(substr($original_name, strrpos($original_name, ".") + 1));

		if ($filesize / (1024 * 1024) > $maxMegabytes) {
			die('{"error": "toobig", "errorMessage": "Файл '.$original_name.' превышает допустимый размер в '.$maxMegabytes.' MB"}');
		}

		switch ($extention){
			case 'jpg':
			case 'jpeg':
			case 'jpe':
			case 'jif':
			case 'jfif':
			case "gif":
			case 'png':
			case 'webp':
				$newName = guid4().'.'.$extention;				
				copy($received_file, $matrixFolder.$newName);
				array_push($images, $newName);
		}

	}
}


exit(json_encode((object)[
	'images' => $images
]));

?>
