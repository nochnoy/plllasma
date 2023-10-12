<?
// Функции для работы со списком каналов

// Возвращает json с данными для бокового меню юзера - его подписки
function getChannels() {
	global $user;
	global $mysqli;

	// Внимание, мы не проверяем права. Юзер может быть подписан на канал, в который не сможет войти. Сможет видеть на нём звёздочку.
	$sql =
		'SELECT DISTINCT p.id_place, p.parent, p.first_parent, p.name, p.description, p.time_changed, p.path, p.typ, l.weight, l.time_viewed'.
		' FROM tbl_places p'.
		' LEFT JOIN tbl_access a ON a.id_place = p.id_place AND a.id_user = '.$user['id_user'].
		' LEFT JOIN lnk_user_place l ON l.id_place = a.id_place AND l.id_user = '.$user['id_user'].
		' WHERE l.at_menu="t"'.
		' ORDER BY p.parent, p.weight'; // это нужно чтоб первыми создавались города а потом в них совались их дети
	$result = mysqli_query($mysqli, $sql);

	// Перегоняем результат в массив, чтобы записи можно было дополнять полем STAR
	$output = array();
	while($row = mysqli_fetch_assoc($result)) {
		$output[] = $row;
	}

	$softStars = false;

	// Если юзер кого-то игнорит то пробуем вычислить звёздочки по датам сообщений, учитывая игнорируемых юзеров и прочие факторы
	if (count($user['ignored']) > 0) {
		$softStars = true;

		$placeIds = array();
		for ($i = 0; $i < count($output); $i++) { 
			$row = &$output[$i];
			if ($row['time_changed'] > $row['time_viewed']) {
				$placeIds[] = $row['id_place'];
			}
		}

		// Получаем список каналов, в которых есть новые сообщения не от игноренных юзеров
		$sql =
			'SELECT l.id_place, m.id_user, m.message'
			.' FROM tbl_messages m'
			.' LEFT JOIN lnk_user_place l ON l.id_user='.$user['id_user'].' AND l.id_place = m.id_place'
			.' WHERE m.id_place IN ('.implode(',', $placeIds).') AND m.time_created > l.time_viewed'
			.' AND m.id_user NOT IN ('.implode(',', $user['ignored']).')'
			.' GROUP BY id_place'
			;
		$r = mysqli_query($mysqli, $sql);
		$updatedPlaces = array();
		while($r2 = mysqli_fetch_array($r)) {
			$updatedPlaces[] = $r2[0];
		}

		// Раздаём звёздочки
		for ($i = 0; $i < count($output); $i++) { 
			$row = &$output[$i];
			$row['_STAR_'] = in_array($row['id_place'], $updatedPlaces);
		}
	}

	// Сложный расчёт звёздочек не понадобился или не получился. Вычисляем по-старинке.
	if (!$softStars) {
		for ($i = 0; $i < count($output); $i++) { 
			$row = &$output[$i];
			$row['_STAR_'] = ($row['time_changed'] > $row['time_viewed']);
		}
	}

	return $output;
}

?>
