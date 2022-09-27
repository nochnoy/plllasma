<?
// Функции для работы с файлами каналов

// Отрезает путь, возвращает имя файла
function getFileName($path) {
	$s = '';
	for($i = 0; $i < strlen($path); $i++) {
		$c = substr($path, $i, 1);
		if($c == '\\') {
			$c = '/';
		}
		$s .= $c;
	}
	$path = $s;

	$a = explode('/', $path);
	return $a[count($a) - 1];
}

// Отрезает имя файла, возвращает расширение
function getFileExtension($path) {
	$name = getFileName($path);
	$a = explode('.', $name);
	return $a[1];
}

// Отрезает имя файла без расширения
function getFileNameNoExtension($path) {
	$name = getFileName($path);
	$a = explode('.', $name);
	return $a[0];
}

// Тип файла: image, file
function getFileType($path) {
	$ex = getFileExtension($path);
	switch($ex) {
		case 'jpg':
		case 'jpeg':
		case 'gif':
		case 'png':
			return 'image';

		default:
			return 'file';
	}
}

?>