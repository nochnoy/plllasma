<? 
// REST для получения ветки

include("include/main.php");

loginBySessionOrToken();

exit('{"id":"'.$input['tid'].'", "messages":'.getThreadJson($input['tid'], $input['lv']).'}');

?>