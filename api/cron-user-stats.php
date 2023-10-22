<? 
// REST обновляем всякое про юзеров - тяжёлые рассчёты

include("include/main.php");

// обнуляем всё у юзера
mysqli_query($mysqli, 'update tbl_users set msgcount=0');
mysqli_query($mysqli, 'update tbl_users set sps=0');

// расставляем юзерам количество спасиб
$result = mysqli_query($mysqli, 'select id_user, sum(emote_sps) as sps, sum(emote_ogo) as ogo, max(time_created) last, count(id_message) cnt from tbl_messages group by id_user;');
while($row = mysqli_fetch_assoc($result)){
	mysqli_query(
		$mysqli,
		'update tbl_users set'.
		' msgcount='.$row['cnt'].
		',sps=' . $row['sps'] . '+(' . $row['ogo'] . '*4)'.
		//',time_lastmessage="'.$row['last'].'"'. это опасная хуйня - надо выкинуть. Так можно понять кто привидение.
		' where id_user='.$row['id_user']
	);
}

// расставляем юзерам количество написанных сообщений и даты последних сообщений
/*$result = mysqli_query($mysqli, 'select id_user, max(time_created) last, count(id_message) cnt from tbl_messages group by id_user;');
while($row = mysqli_fetch_assoc($result)){
	mysqli_query(
		$mysqli,
		'update tbl_users set'.
		' msgcount='.$row['cnt'].
		',time_lastmessage="'.$row['last'].'"'.
		' where id_user='.$row['id_user']
	);
}*/

// добавляем ту-же инфу про инбоксы
$result = mysqli_query(
	$mysqli, 
	'select id_user, max(time_created) last, count(id_mail) cnt'.
	' from tbl_mail'.
	' where id_user=author'.
	' group by id_user;'
);
while($row = mysqli_fetch_assoc($result)){
	mysqli_query(
		$mysqli, 
		'update tbl_users set'.
		' msgcount = msgcount + '.$row['cnt'].
		',time_lastmessage = if(time_lastmessage < "'.$row['last'].'", "'.$row['last'].'", time_lastmessage)'.
		' where id_user = '.$row['id_user']
	);
}

exit(json_encode((object)[
	'ok' => true
]));

?>