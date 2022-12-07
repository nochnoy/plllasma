<? 
/** REST для получения канала
    Параметры:
    cid     - id канала
    lv      - дата последнего просмотра канала юзером
    after   - (опциональный) - дата, после которой появились сообщения - пришлются только они
    unseen  - (опциональный) - если там что-то есть то канал не будет помечен как просмотренный
*/

include("include/main.php");

loginBySessionOrToken();

$placeId = $input['cid']; // id канала
$lastViewed = $input['lv']; // Дата когда юзер в последний раз был на этом канале.
$after = @$input['after']; // Дата. Если указана - выдаст только сообщения, созданные после этой даты.
$unseen = @$input['unseen'];
$page = @$input['page'] ?? 0;

$viewed = '';

if (!canRead($placeId)) {
    die('{"error": "access"}');
}

if (!empty($after)) {
    // Передали параметр after - значит это получение обновлений о канале. Выдадим только обновившиеся сообщения.
    // page вместе с after не работает
    $messagesResult = getChannelUpdateJson($placeId, $lastViewed, $after);
} else {
    $messagesResult = getChannelJson($placeId, $lastViewed, $page);
}

if (empty($unseen)) {

    // Помечаем канал как просмотренный
    $sql = $mysqli->prepare('UPDATE lnk_user_place SET time_viewed=NOW() WHERE id_place=? AND id_user=?');
    $sql->bind_param("ii", $placeId, $user['id_user']);
    $sql->execute();

    // Получаем время просмотра
    $sql = $mysqli->prepare('SELECT NOW()');
    $sql->execute();
    $result = $sql->get_result();
    $row = mysqli_fetch_array($result);
    $viewed = $row[0];    
    
}

// Получаем общее кол-во сообщений
$sql = $mysqli->prepare('SELECT COUNT(id_message) FROM tbl_messages WHERE id_parent=0 AND id_place='.$placeId);
$sql->execute();
$result = $sql->get_result();
$row = mysqli_fetch_array($result);
$total = $row[0] ?? 0;
$pagesCount = ceil($total / PAGE_SIZE);

exit('{"id":'.$placeId.', "pages":'.$pagesCount.', "messages":'.$messagesResult.', "viewed":"'.$viewed.'"}');
?>