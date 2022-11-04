<?  
// REST для получения списка каналов юзера

include("include/main.php");

loginBySessionOrToken();

exit(json_encode(getChannels()));

?>