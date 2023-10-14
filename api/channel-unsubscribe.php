<? // REST для отписки от канала

include("include/main.php");
loginBySessionOrToken();

$userId     = $user['id_user'];
$placeId    = $input['channelId']; // id канала

// Если не было связи юзер-канал - создадим её
createUserChannelLink($placeId);

$sql = $mysqli->prepare('UPDATE lnk_user_place SET at_menu = "f" WHERE id_place = ? AND id_user = ? LIMIT 1');
$sql->bind_param("ii", $placeId, $userId);
$sql->execute();

exit(json_encode((object)[
	'ok' => '1'
]));

?>