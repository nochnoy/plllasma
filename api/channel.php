<? 
// REST для получения канала

include("include/main.php");

loginBySessionOrToken();

$placeId = $input['cid']; // id канала
$lastViewed = $input['lv']; // Дата когда юзер в последний раз был на этом канале.
$after = @$input['after']; // Дата. Если указана - выдаст только сообщения, созданные после этой даты.

if (!canRead($placeId)) {
    die('{"error": "access"}');
}

if (!empty($after)) {
    // Передали параметр after - значит это получение обновлений о канале. Выдадим только обновившиеся сообщения.
    $result = '{"id":'.$placeId.', "messages":'.getChannelUpdateJson($placeId, $lastViewed, $after).'}';
} else {
    $result = '{"id":'.$placeId.', "messages":'.getChannelJson($placeId, $lastViewed).'}';
}

// Помечаем канал как просмотренный
$sql = $mysqli->prepare('UPDATE lnk_user_place SET time_viewed=NOW() WHERE id_place=? AND id_user=?');
$sql->bind_param("ii", $placeId, $user['id_user']);
$sql->execute();

exit($result);
?>