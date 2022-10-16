<?
include("include/main.php");

$placeId = $_REQUEST['p'];
$messageId = $_REQUEST['m'];
$attachmentId = $_REQUEST['a'];

loginBySessionOrToken();

if (!canRead($placeId)) {
	die('{"error": "access"}');
}

// Находим файл

$fileList = glob('../attachments/' . $placeId . '/' . $messageId . '_' . $attachmentId . '.*');

if(count($fileList) == 0)
	die;

$path = $fileList[0];
$extension = getFileExtension($path);

switch($extension) {
	case 'jpg':
	case 'jpeg':
		$contentType = 'Content-Type: image/jpeg';
		break;
	case 'gif':
		$contentType = 'Content-Type: image/gif';
		break;
	case 'png':
		$contentType = 'Content-Type: image/png';
		break;
	default:
		$contentType = 'Content-Type: application/download';
}

// Отдаём файл

@ob_end_clean();

header($contentType);
header("Cache-Control: ");
header("Pragma: ");
header('Content-Length: ' . filesize($path));
header("Expires: Sat, 26 Jul 3000 05:00:00 GMT"); // Дата в будущем
header("Content-Transfer-Encoding: binary\n");
header('Content-disposition: filename="plasma_' . $placeId . '_' . $messageId . '_' . $attachmentId . '.' .$extension. '"');

readfile($path);

exit();
?>