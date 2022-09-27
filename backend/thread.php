<? 
// REST для получения ветки

include("include/main.php");

respond('thread', '{"id":"'.$threadId.'", "messages":'.getThreadJson($threadId, $lastVieved).'}');

?>