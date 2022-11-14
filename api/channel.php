<? 
/** REST для получения канала
    Параметры:
    cid     - id канала
    lv      - дата последнего просмотра канала юзером
    after   - (опциональный) - дата, после которой появились сообщения - пришлются только они
*/

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
    $messagesResult = getChannelUpdateJson($placeId, $lastViewed, $after);
} else {
    $messagesResult = getChannelJson($placeId, $lastViewed);
}

// Помечаем канал как просмотренный
$sql = $mysqli->prepare('UPDATE lnk_user_place SET time_viewed=NOW() WHERE id_place=? AND id_user=?');
$sql->bind_param("ii", $placeId, $user['id_user']);
$sql->execute();

// Получаем время просмотра
$sql = $mysqli->prepare('SELECT NOW()');
$sql->execute();
$result = $sql->get_result();
$row = mysqli_fetch_array($result);

exit('{"id":'.$placeId.', "messages":'.$messagesResult.', "viewed":"'.$row[0].'"}');
?>