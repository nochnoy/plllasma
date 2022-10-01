<?

// Добавляет команду в $outputBuffer
// В разультирующем json'е она будет лежать в поле под названием $command
function respond($command, $json) {
    global $outputBuffer;
    array_push($outputBuffer, '"'.$command.'":'.$json);
}

// Склеивает все json'ы в буфере $outputBuffer и возвращает клиенту
function sendResponce() {
    global $outputBuffer;
    global $logBuffer;

    // добавим логи
    if (count($logBuffer) > 0) {
        array_push($outputBuffer, '"log":'.'['.implode(",", $logBuffer).']');
    }

    echo('{'.implode(",", $outputBuffer).'}');
}

// Добавляет лог-сообщение в выдачу для клиента 
function lll($s) {
    global $logBuffer;
    array_push($logBuffer, '"'.jsonifyMessageText($s).'"');
}

function guid(){
    return sprintf('%04X%04X-%04X-%04X-%04X-%04X%04X%04X', mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(16384, 20479), mt_rand(32768, 49151), mt_rand(0, 65535), mt_rand(0, 65535), mt_rand(0, 65535));
}

?>