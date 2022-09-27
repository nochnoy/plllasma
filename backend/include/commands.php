<?
        
// Разлогиниваемся
function cmdLogOff() {
    global $userId;

    unset($userId);
    unset($_SESSION['plasma_user_id']);

    //@setcookie("p3user","---",time()-1);
    //setcookie("plasma3","",time()-1,"/");
    clearCookieKey();

    session_unset();
    session_destroy();

    respond('status', '{"authorized": false}');
}

// Получить канал - пачку первых сообщений плюс дайджесты с обновлениями
function cmdGetChannel($channelId, $lastVieved) {
    respond('channel', '{"id":'.$channelId.', "messages":'.getChannelJson($channelId, $lastVieved).'}');
}

// Получить все сообщения треда
function cmdGetThread($threadId, $lastVieved) {
    respond('thread', '{"id":"'.$threadId.'", "messages":'.getThreadJson($threadId, $lastVieved).'}');
}
    
// Получить список каналов
function cmdGetChannels($lastVieved) {
    respond('channels', '{"channels":'.getChannelsJson().'}');
}

?>