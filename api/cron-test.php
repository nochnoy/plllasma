<?
require("include/main.php");

$stmt = $mysqli->prepare('INSERT INTO tbl_test SET number = 1');
$stmt->execute();
$result = $stmt->get_result();
$insertId = mysqli_insert_id($mysqli);

exit(json_encode((object)[
	'insertID' => $insertId
]));

?>