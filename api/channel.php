<? 
// REST для получения канала

include("include/main.php");

loginBySessionOrToken();

$placeId = $input['cid'];
$lastViewed = $input['lv'];

if (!canRead($placeId)) {
    die('{"error": "access"}');
}

$result = '{"id":'.$placeId.', "messages":'.getChannelJson($placeId, $lastViewed).'}';

// Помечаем канал как просмотренный
$sql = $mysqli->prepare('UPDATE lnk_user_place SET time_viewed=NOW() WHERE id_place=? AND id_user=?');
$sql->bind_param("ii", $placeId, $user['id_user']);
$sql->execute();

exit($result);
?>