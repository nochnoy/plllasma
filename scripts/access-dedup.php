<?
/**
 * Поиск и устранение дублей пар (id_user, id_place) в tbl_access.
 * Оставляет одну строку на пару: максимальная роль, ручная запись важнее скриптовой.
 *
 *   php scripts/access-dedup.php          # только отчёт
 *   php scripts/access-dedup.php --fix    # удалить лишние строки (спросит подтверждение)
 */

require_once(__DIR__ . '/include/access-lib.php');

$fix = in_array('--fix', $argv);

echo "=== Дедупликация tbl_access ===\n\n";

// Все строки, участвующие в дублях, с сортировкой "лучшая первая":
// addedbyscript ASC (0 ручные раньше), role DESC
$res = $mysqli->query(
	'SELECT t.id, t.id_place, t.id_user, t.role, t.addedbyscript, u.nick ' .
	'FROM tbl_access t LEFT JOIN tbl_users u ON u.id_user = t.id_user ' .
	'WHERE (t.id_place, t.id_user) IN (' .
	'  SELECT id_place, id_user FROM tbl_access GROUP BY id_place, id_user HAVING COUNT(*) > 1' .
	') ORDER BY t.id_place, t.id_user, t.addedbyscript ASC, t.role DESC'
);

$groups = [];
while ($row = $res->fetch_assoc()) {
	$key = $row['id_place'] . ':' . $row['id_user'];
	$groups[$key][] = $row;
}

$totalGroups = count($groups);
$totalExtra = 0;
$conflicts = 0;
foreach ($groups as $key => $rows) {
	$extra = count($rows) - 1;
	$totalExtra += $extra;
	$roles = array_unique(array_map(function ($r) { return $r['role']; }, $rows));
	if (count($roles) > 1) {
		$conflicts++;
	}
}

echo "Пар с дублями: {$totalGroups}\n";
echo "Лишних строк: {$totalExtra}\n";
echo "Из них с конфликтом ролей (max != min): {$conflicts}\n\n";

if ($totalGroups === 0) {
	echo "Дублей нет, таблица чистая.\n";
	exit(0);
}

$show = min($totalGroups, 30);
echo "Первые {$show} пар:\n";
$i = 0;
foreach ($groups as $key => $rows) {
	if ($i++ >= $show) {
		break;
	}
	$first = $rows[0];
	$roles = implode(',', array_map(function ($r) { return $r['role'] . ($r['addedbyscript'] ? 's' : 'm'); }, $rows));
	$nick = $first['nick'] !== null ? $first['nick'] : 'ПРИЗРАК';
	echo "  place={$first['id_place']} user={$first['id_user']} ({$nick}) строк: {$roles} — останется role={$first['role']}\n";
}
if ($totalGroups > $show) {
	echo "  ... и ещё " . ($totalGroups - $show) . "\n";
}
echo "\n";

if (!$fix) {
	echo "Запущен без --fix: только отчёт. Для исправления: php scripts/access-dedup.php --fix\n";
	exit(0);
}

echo "Будет удалено {$totalExtra} лишних строк. Продолжить? (yes/no): ";
$handle = fopen('php://stdin', 'r');
$answer = trim(strtolower(fgets($handle)));
fclose($handle);
if ($answer !== 'yes' && $answer !== 'y') {
	echo "Отменено.\n";
	exit(0);
}

$deleted = 0;
foreach ($groups as $rows) {
	array_shift($rows); // первая (лучшая) остаётся
	foreach ($rows as $row) {
		$stmt = $mysqli->prepare('DELETE FROM tbl_access WHERE id = ? LIMIT 1');
		$stmt->bind_param('i', $row['id']);
		$stmt->execute();
		$deleted += $stmt->affected_rows;
	}
}

echo "\nУдалено строк: {$deleted}\n";

// Контрольная проверка
$res = $mysqli->query('SELECT COUNT(*) c FROM (SELECT 1 FROM tbl_access GROUP BY id_place, id_user HAVING COUNT(*) > 1) t');
$row = $res->fetch_assoc();
echo "Осталось пар с дублями: {$row['c']}\n";
echo "Готово. Теперь можно добавлять UNIQUE KEY (id_user, id_place) и запускать access-migrate.php\n";
?>
