<? 
// REST для получения канала

include("include/main.php");

respond('channel', '{"id":'.$channelId.', "messages":'.getChannelJson($channelId, $lastVieved).'}');

?>