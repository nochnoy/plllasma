<? 
// REST для получения канала

include("include/main.php");

loginBySessionOrToken();

$placeId = $input['cid'];
$lastViewed = $input['lv'];

if (!canRead($placeId)) {
    die('{"error": "access"}');
}

exit('{"id":'.$placeId.', "messages":'.getChannelJson($placeId, $lastViewed).'}');

?>