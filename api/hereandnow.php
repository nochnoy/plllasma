<? // REST возвращает список людей в онлайне

include("include/main.php");
loginBySessionOrToken();

$a = array();

$result = mysqli_query($mysqli, "SELECT user_name FROM tbl_log WHERE (id_user<>".$user['id_user'].") AND (time_created >= (NOW() - INTERVAL 5 MINUTE)) GROUP BY id_user");
if (mysqli_num_rows($result) > 0) {
	while ($row = mysqli_fetch_row($result)){
		array_push($a, '"'.$row[0].'"');
	}
}

echo('['.implode(',', $a).']');
?>