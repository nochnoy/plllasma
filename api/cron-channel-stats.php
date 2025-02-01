<? 
// REST обновляем всякое про каналы - тяжёлые рассчёты

include("include/main.php");

// Количество подписчиков каналов
mysqli_query($mysqli, 
	' UPDATE tbl_places p'.
	' JOIN ( '.
	'	SELECT a.id_place, COUNT(l.id_user) AS cnt'.
	'	FROM tbl_access a'.
	'	LEFT JOIN lnk_user_place l ON l.id_place = a.id_place AND a.id_user = l.id_user AND l.at_menu = "t"'.
	'	WHERE a.role IS NOT NULL AND a.role <> 9'.
	'	GROUP BY a.id_place'.
	' ) AS sub'.
	' ON p.id_place = sub.id_place'.
	' SET p.stat_subscribers = sub.cnt;'
);

?>