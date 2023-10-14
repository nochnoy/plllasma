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

$userId     = $user['id_user'];
$placeId    = $input['cid']; // id канала
$lastViewed = $input['lv']; // дата, которую клиент просит считать датой последнего просмотра канала. Если пустая - запишем сюда фактический last_viewed.
$after      = @$input['after']; // Дата. Если указана - выдаст только сообщения, созданные после этой даты.
$page       = @$input['page'] ?? 0;

if (!canRead($placeId)) {
    die('{"error": "access"}');
}

// now
$sql = $mysqli->prepare('SELECT NOW()');
$sql->execute();
$result = $sql->get_result();
$row = mysqli_fetch_array($result);
$now = $row[0] ?? '';

// Получаем инфу о канале
$sql = $mysqli->prepare('
    SELECT 
        p.name,
        p.time_changed,
        p.matrix,
        l.at_menu,
        l.time_viewed,
        l.id as id_lnk_user_place
    FROM tbl_places p
    LEFT JOIN lnk_user_place l ON l.id_place = p.id_place AND l.id_user = ?
    WHERE p.id_place = ?
');
$sql->bind_param(
	"ii",
	$userId,
    $placeId,
);
$sql->execute();
$result = $sql->get_result();
$row = mysqli_fetch_array($result);
$name           = $row[0] ?? '';
$changed        = $row[1] ?? '';
$matrix         = $row[2] ?? '';
$atMenu         = $row[3] ? true : false;
$lastViewedLnk  = $row[4] ?? '';
$lnkId          = $row[5];

if (empty($lnkId)) {
    // Если не было связи юзер-канал - создадим её
    // и пометим канал как просмотренный
    $sql = $mysqli->prepare('
        INSERT INTO lnk_user_place (id_place, id_user, at_menu, time_viewed, weight)
        VALUES (?, ?, "f", NOW(), 100)
    ');
    $sql->bind_param("ii", $placeId, $userId);
    $sql->execute();

    // данные о только что созданной связи
    $atMenu = false;

    // Клиент не знает с какого времени он хочет видеть звёздочки. 
    // Значит будет смотреть с того которое записано в lnk.
    if (empty($lastViewed)) {
        $lastViewed =  $now;
    }       
} else {
    // Клиент не знает с какого времени он хочет видеть звёздочки. 
    // Значит будет смотреть с того которое записано в lnk.
    if (empty($lastViewed)) {
        $lastViewed = $lastViewedLnk;
    }

    // Пометим канал как просмотренный
    $sql = $mysqli->prepare('UPDATE lnk_user_place SET time_viewed = NOW() WHERE id_place=? AND id_user=?');
    $sql->bind_param("ii", $placeId, $userId);
    $sql->execute();
}

// Получаем сообщения канала
if (!empty($after)) {
    // Передали параметр after - значит это получение обновлений о канале. Выдадим только обновившиеся сообщения.
    // page вместе с after не работает
    $messagesResult = getChannelUpdateJson($placeId, $lastViewed, $after);
} else {
    $messagesResult = getChannelJson($placeId, $lastViewed, $page);
}

// Получаем общее кол-во сообщений
$sql = $mysqli->prepare('SELECT COUNT(id_message) FROM tbl_messages WHERE id_parent=0 AND id_place='.$placeId);
$sql->execute();
$result = $sql->get_result();
$row = mysqli_fetch_array($result);
$total = $row[0] ?? 0;
$pagesCount = ceil($total / PAGE_SIZE);

logActivity('channel '.$placeId);

try {
    $messagesDecoded = json_decode($messagesResult);
} catch (Exception $e) {
    $messagesDecoded = [];
}

try {
    $matrixDecoded = json_decode($matrix);
} catch (Exception $e) {
    $matrixDecoded = (object)[
        'error' => 'Matrix JSON is broken'
    ];
}

exit(json_encode((object)[
	'id' =>         $placeId,
	'pages' =>      $pagesCount,
    'page' =>       $page,
	'messages' =>   $messagesDecoded,
	'matrix' =>     $matrixDecoded,
	'viewed' =>     $now, // Отправляем время фактического просмотра канала. Клиент не должен сразу отображать его в модели а отложить до переключения каналов.
    'changed' =>    $changed,
    'name' =>       $name,
    'matrix' =>     $matrixDecoded,
    'atMenu' =>     $atMenu
]));

?>