<? 
// REST для разлогина

include("include/main.php");

loginBySessionOrToken();

$stmt = $mysqli->prepare('UPDATE tbl_users SET logkey="" WHERE id_user=? LIMIT 1');
$stmt->bind_param("i", $userId);
$stmt->execute();

unset($userId);
unset($_SESSION['plasma_user_id']);

clearToken();

session_unset();
session_destroy();

exit(json_encode((object)[
	'authorized' => false 
]));

?>