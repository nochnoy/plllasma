<? 
// REST для получения канала

include("include/main.php");

loginBySessionOrToken();

exit('{"id":'.$input['cid'].', "messages":'.getChannelJson($input['cid'], $input['lv']).'}');

?>