<?  
// REST для получения списка каналов юзера

include("include/main.php");

loginBySessionOrToken();

//respond('channels', '{"channels":'.getChannelsJson().'}');

exit(json_encode(getChannels2()));

?>