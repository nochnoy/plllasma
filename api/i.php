<?
// Не REST. Возвращает png иконки файла.

include("include/main.php");

$id_place = $_REQUEST['p'];
$messageId = $_REQUEST['m'];
$attachmentId = $_REQUEST['a'];

loginBySessionOrToken();

if (!canRead($id_place)) {
	die('{"error": "access"}');
}

$result = mysqli_query($mysqli, 'SELECT * FROM tbl_messages WHERE id_message=' . $messageId);

$row = mysqli_fetch_assoc($result);
$id_place = $row["id_place"];
$path = '../attachments/' . $id_place . '/' . $messageId . '_' . $attachmentId . 't.jpg';

// Отдаём файл

if (!is_file($path) || connection_status() != 0)
	die('You pesky mothafaka');

session_write_close();
@ob_end_clean();

header('Content-Type: image/jpeg');
header("Cache-Control: ");
header("Pragma: ");
header('Content-Length: ' . filesize($path));
header("Expires: Sat, 26 Jul 3000 05:00:00 GMT"); // Дата в будущем
header('Content-Length: ' . filesize($path));
header("Content-Transfer-Encoding: binary\n");

readfile($path);

exit;
?>