<?
// Функции для работы с сообщениями

// Подготавливаем текст из бд для всовывания в json
function jsonifyMessageText($s) {

	// Сообщения в БД хранятся в специфичеки плазма-эскейпнутом виде. Раскукоживаем.
	$s = htmlspecialchars_decode($s);

	// убиваем тэги <a..> и </a>, оставляем только их содержимое
	$s = preg_replace('/<a([^>]*)>/i', "", $s);
	$s = preg_replace('/<\/a>/i', "", $s);

	// обратные слеши
	$s = str_replace('\\', '\\\\', $s);

	// двойные кавычки надо снабжать двумя слешами - первый сожрёт JS, второй сожрёт парсер JSON
	// (одинарные кавычки оставляем как есть - JSON их игнорирует)
	$s = str_replace('"', '\\"', $s);

	// <br> превращаем в \n
	$s = preg_replace('/<br\s?\/?>/i', "\\n", str_replace("\n", "", str_replace("\r", "", $s)));

	// табы превращаем в пробелы
	$s = preg_replace('/\t+/', ' ', $s);

	// возврат каретки убиваем
	$s = preg_replace('/\r+/', '', $s);

	// тримаем
	$s = trim($s);

	return $s;
}

function txt2html($s){
	$s = htmlspecialchars($s, ENT_QUOTES);
	$s = nl2br($s);
	return $s;
}

?>
