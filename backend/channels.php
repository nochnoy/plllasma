<?  
// REST для получения списка каналов юзера

include("include/main.php");

respond('channels', '{"channels":'.getChannelsJson().'}');

?>