<? 
// REST для получения канала

include("include/main.php");


exit('{"id":'.$input['cid'].', "messages":'.getChannelJson($input['cid'], $input['lv']).'}');

?>