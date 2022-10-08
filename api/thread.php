<? 
// REST для получения ветки

include("include/main.php");

exit('{"id":"'.$input['tid'].'", "messages":'.getThreadJson($input['tid'], $input['lv']).'}');

?>