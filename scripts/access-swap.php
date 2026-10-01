<?
/**
 * Атомарная замена боевой tbl_access на собранную tbl_access_new (rename-swap).
 * MyISAM — транзакций нет, поэтому переключение только через RENAME (доли секунды),
 * старая таблица остаётся под именем tbl_access_backup_<дата> для отката.
 *
 *   php scripts/access-swap.php swap       # tbl_access -> backup, tbl_access_new -> tbl_access
 *   php scripts/access-swap.php rollback   # вернуть backup обратно (укажите суффикс при необходимости)
 *
 * Перед swap обязательна чистая сверка: php scripts/access-verify.php <snapshot> --table=tbl_access_new
 * После swap все сессии гасятся (права кешируются в сессии).
 */

require_once(__DIR__ . '/include/access-lib.php');

$mode = isset($argv[1]) ? $argv[1] : '';

if ($mode !== 'swap' && $mode !== 'rollback') {
	echo "Использование:\n";
	echo "  php scripts/access-swap.php swap       — включить новую таблицу\n";
	echo "  php scripts/access-swap.php rollback   — откатиться на backup\n";
	exit(1);
}

function tableExists($name) {
	global $mysqli;
	$stmt = $mysqli->prepare('SHOW TABLES LIKE ?');
	$stmt->bind_param('s', $name);
	$stmt->execute();
	return $stmt->get_result()->num_rows > 0;
}

function tableCount($name) {
	global $mysqli;
	$res = $mysqli->query("SELECT COUNT(*) c FROM {$name}");
	return (int)$res->fetch_assoc()['c'];
}

function confirm($question) {
	echo $question . ' (yes/no): ';
	$handle = fopen('php://stdin', 'r');
	$answer = trim(strtolower(fgets($handle)));
	fclose($handle);
	return $answer === 'yes' || $answer === 'y';
}

$suffix = date('Ymd_His');

if ($mode === 'swap') {
	if (!tableExists('tbl_access_new')) {
		echo "!! tbl_access_new не существует. Сначала: php scripts/access-migrate.php\n";
		exit(1);
	}

	$backup = 'tbl_access_backup_' . $suffix;
	if (tableExists($backup)) {
		echo "!! {$backup} уже существует, подберите другое время\n";
		exit(1);
	}

	$oldCount = tableCount('tbl_access');
	$newCount = tableCount('tbl_access_new');

	echo "=== Swap tbl_access ===\n\n";
	echo "Текущая tbl_access: {$oldCount} строк\n";
	echo "Новая tbl_access_new: {$newCount} строк\n";
	echo "Бэкап будет: {$backup}\n\n";
	echo "Убедитесь, что сверка пройдена и код, читающий новую семантику, задеплоен.\n\n";

	if (!confirm("Делаю rename-swap. Продолжить?")) {
		echo "Отменено.\n";
		exit(0);
	}

	// Одна атомарная операция: старая уходит в backup, новая встаёт на боевое имя
	$mysqli->query("RENAME TABLE tbl_access TO {$backup}, tbl_access_new TO tbl_access");

	echo "\nSwap выполнен.\n";
	echo "  Бывшая tbl_access теперь: {$backup} (НЕ УДАЛЯЙТЕ, это откат)\n";

	killAllSessions();
	echo "  Все сессии сброшены — юзеры разово перелогинятся.\n\n";
	echo "Проверьте сайт вручную, затем в течение пары дней:\n";
	echo "  php scripts/access-verify.php scripts/out/access-snapshot-*.json --table={$backup}\n";
	echo "(сверка против backup = контроль, что старое состояние соответствовало эталону)\n";

} else { // rollback

	// Ищем backup: либо самый свежий tbl_access_backup_*, либо --backup=<имя>
	$backup = null;
	foreach (array_slice($argv, 2) as $arg) {
		if (strpos($arg, '--backup=') === 0) {
			$backup = substr($arg, 9);
		}
	}
	if ($backup === null) {
		$res = $mysqli->query("SHOW TABLES LIKE 'tbl_access_backup_%'");
		$names = [];
		while ($row = $res->fetch_row()) {
			$names[] = $row[0];
		}
		if (count($names) === 0) {
			echo "!! Бэкапов tbl_access_backup_* не найдено\n";
			exit(1);
		}
		rsort($names);
		$backup = $names[0];
	}

	if (!tableExists($backup)) {
		echo "!! Таблица {$backup} не существует\n";
		exit(1);
	}
	if (!tableExists('tbl_access')) {
		echo "!! tbl_access не существует — rename невозможен, разбирайтесь вручную\n";
		exit(1);
	}

	echo "=== Rollback tbl_access ===\n\n";
	echo "Текущая tbl_access: " . tableCount('tbl_access') . " строк\n";
	echo "Откат на: {$backup} (" . tableCount($backup) . " строк)\n\n";

	if (!confirm("Текущая tbl_access будет удалена, вместо неё встанет {$backup}. Продолжить?")) {
		echo "Отменено.\n";
		exit(0);
	}

	$mysqli->query("RENAME TABLE tbl_access TO tbl_access_rolledaway_{$suffix}, {$backup} TO tbl_access");

	echo "\nОткат выполнен: {$backup} теперь снова боевой tbl_access.\n";
	killAllSessions();
	echo "  Все сессии сброшены.\n";
}
?>
