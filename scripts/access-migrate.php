<?
/**
 * Сборка tbl_access_new по новой семантике (без трогания боевой tbl_access):
 *  - private-каналы: переносятся ВСЕ строки (это и есть списки участников)
 *  - open-каналы: переносятся только исключения (role != 1)
 *  - дубли схлопываются: MAX(role), ручная запись важнее скриптовой (MIN(addedbyscript))
 *
 *   php scripts/access-migrate.php           # собрать tbl_access_new
 *   php scripts/access-migrate.php --force   # пересобрать, если уже существует
 *
 * Swap боевой таблицы — отдельно: scripts/access-swap.php (только после access-verify.php).
 */

require_once(__DIR__ . '/include/access-lib.php');

$force = in_array('--force', $argv);

echo "=== Сборка tbl_access_new ===\n\n";

$res = $mysqli->query("SHOW TABLES LIKE 'tbl_access_new'");
if ($res->num_rows > 0) {
	if (!$force) {
		echo "tbl_access_new уже существует. Пересобрать? Добавьте --force.\n";
		exit(1);
	}
	echo "Удаляю старую tbl_access_new (--force)\n";
	$mysqli->query('DROP TABLE tbl_access_new');
}

// Что будет выброшено / свёрнуто — для отчёта
$res = $mysqli->query(
	"SELECT COUNT(*) c FROM tbl_access a JOIN tbl_places p ON p.id_place = a.id_place " .
	"WHERE p.privacy_mode = 'open' AND a.role = " . ROLE_WRITER
);
$dropWriterOpen = (int)$res->fetch_assoc()['c'];

$res = $mysqli->query(
	"SELECT COUNT(*) c FROM tbl_access a JOIN tbl_places p ON p.id_place = a.id_place " .
	"WHERE p.privacy_mode = 'open' AND a.role = " . ROLE_WRITER . " AND NOT EXISTS (SELECT 1 FROM tbl_users u WHERE u.id_user = a.id_user)"
);
$dropGhostWriterOpen = (int)$res->fetch_assoc()['c'];

$res = $mysqli->query('SELECT COUNT(*) c FROM tbl_access');
$oldTotal = (int)$res->fetch_assoc()['c'];

echo "Строк в боевой tbl_access: {$oldTotal}\n";
echo "Будет снято записей role=1 (writer) на open-каналах: {$dropWriterOpen}\n";
echo "  из них по призракам (uid нет в tbl_users): {$dropGhostWriterOpen}\n\n";

echo "Создаю tbl_access_new...\n";
$mysqli->query('CREATE TABLE tbl_access_new LIKE tbl_access');
$mysqli->query('ALTER TABLE tbl_access_new ADD UNIQUE KEY user_place (id_user, id_place)');

// Private-каналы: всё переносим
$mysqli->query(
	'INSERT INTO tbl_access_new (id_user, id_place, role, addedbyscript) ' .
	'SELECT a.id_user, a.id_place, MAX(a.role), MIN(a.addedbyscript) ' .
	'FROM tbl_access a JOIN tbl_places p ON p.id_place = a.id_place ' .
	"WHERE p.privacy_mode = 'private' GROUP BY a.id_user, a.id_place"
);
$privateRows = $mysqli->affected_rows;

// Open-каналы: только исключения (всё, кроме writer)
$mysqli->query(
	'INSERT INTO tbl_access_new (id_user, id_place, role, addedbyscript) ' .
	'SELECT a.id_user, a.id_place, MAX(a.role), MIN(a.addedbyscript) ' .
	'FROM tbl_access a JOIN tbl_places p ON p.id_place = a.id_place ' .
	"WHERE p.privacy_mode = 'open' AND a.role <> " . ROLE_WRITER . ' GROUP BY a.id_user, a.id_place'
);
$openRows = $mysqli->affected_rows;

echo "Перенесено: private — {$privateRows} строк, open (исключения) — {$openRows} строк\n";

// Контроль: дублей в новой таблице быть не должно
$res = $mysqli->query('SELECT COUNT(*) c FROM (SELECT 1 FROM tbl_access_new GROUP BY id_place, id_user HAVING COUNT(*) > 1) t');
$dupes = (int)$res->fetch_assoc()['c'];
echo "Дублей в tbl_access_new: {$dupes}\n";
if ($dupes > 0) {
	echo "!! Неожиданно: дубли есть, разбирайтесь до swap\n";
	exit(1);
}

// Распределение ролей в новой таблице — глазами админа
echo "\nРаспределение ролей в tbl_access_new:\n";
$res = $mysqli->query('SELECT role, COUNT(*) c FROM tbl_access_new GROUP BY role ORDER BY role');
while ($row = $res->fetch_assoc()) {
	echo "  role={$row['role']}: {$row['c']}\n";
}

echo "\nГотово. Дальше:\n";
echo "  1. php scripts/access-verify.php scripts/out/access-snapshot-*.json --table=tbl_access_new\n";
echo "  2. Если сверка чистая — php scripts/access-swap.php swap\n";
?>
