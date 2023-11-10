<? 
// REST обновляем всякое про юзеров - тяжёлые рассчёты

include("include/main.php");

$roleNobody = ROLE_NOBODY;
$mainChannelId = 1; // id Главного канала, на который попадаешь при входе

// обнуляем всё у юзеров
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

// Снимаем игноры с каналов...
$stmt = $mysqli->prepare('UPDATE lnk_user_place SET ignoring = 0');
$stmt->execute();
// ...и ставим игноры на каналы, на которые люди не заходят больше месяца, хотя у них есть доступ и каналы обновились
$stmt = $mysqli->prepare('
UPDATE lnk_user_place ll LEFT JOIN
(
	SELECT l.id_user, l.id_place
	FROM tbl_users u
	LEFT JOIN tbl_access a ON a.id_user = u.id_user AND a.role IS NOT NULL AND a.role <> ?
	LEFT JOIN tbl_places p ON p.id_place = a.id_place
	LEFT JOIN lnk_user_place l ON l.id_user = a.id_user AND l.id_place = p.id_place
	WHERE 
	DATEDIFF(p.time_changed, l.time_viewed) > 30 
	AND p.id_place IS NOT NULL
	AND p.id_place <> ?
) cc
ON ll.id_user = cc.id_user AND ll.id_place = cc.id_place
SET ll.ignoring = 1
WHERE cc.id_place IS NOT NULL
');
$stmt->bind_param("ii", $roleNobody, $mainChannelId);
$stmt->execute();

exit(json_encode((object)[
	'ok' => true
]));

?>