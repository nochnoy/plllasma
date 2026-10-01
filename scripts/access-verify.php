<?
/**
 * Сверка новой модели против снапшота старых прав.
 *
 *   php scripts/access-verify.php scripts/out/access-snapshot-XXX.json [--table=tbl_access_new]
 *
 * --table по умолчанию tbl_access_new. Можно указать tbl_access, чтобы
 * ПРЕДВАРИТЕЛЬНО посмотреть ожидаемые расхождения ещё до миграции.
 *
 * Жёсткие гейты (exit 1):
 *  - private-канал: кто-либо реальный потерял или получил доступ/админку
 *  - любой канал: реальный юзер потерял доступ или изменилась админка
 * Ожидаемо и НЕ является провалом:
 *  - gain на open-каналах (заливка дыр, где старых строк не было)
 *  - gain/loss по призракам (uid нет в tbl_users)
 */

require_once(__DIR__ . '/include/access-lib.php');

$snapPath = null;
$table = 'tbl_access_new';
foreach (array_slice($argv, 1) as $arg) {
	if (strpos($arg, '--table=') === 0) {
		$table = substr($arg, 8);
	} elseif ($snapPath === null) {
		$snapPath = $arg;
	}
}

if ($snapPath === null || !file_exists($snapPath)) {
	echo "Укажите путь к снапшоту:\n";
	echo "  php scripts/access-verify.php scripts/out/access-snapshot-XXX.json [--table=tbl_access_new]\n";
	exit(1);
}

echo "=== Сверка прав: снапшот vs таблица {$table} ===\n\n";

$snap = json_decode(file_get_contents($snapPath), true);
if (empty($snap['channels'])) {
	echo "!! Не удалось разобрать снапшот\n";
	exit(1);
}
echo "Снапшот: {$snapPath} ({$snap['created']})\n";

$res = $mysqli->query("SHOW TABLES LIKE '{$table}'");
if ($res->num_rows === 0) {
	echo "!! Таблица {$table} не существует\n";
	exit(1);
}

$users = loadUsers();
$channels = loadChannels();
$pour = pourUserIds($users);
$accessMap = loadAccessMap($table);

$fail = false;
$totalGainOpen = 0;
$totalLostGhosts = 0;

foreach ($channels as $chId => $ch) {
	$oldCh = isset($snap['channels'][$chId]) ? $snap['channels'][$chId] : null;
	if ($oldCh === null) {
		echo "!! Канал {$chId} ({$ch['name']}) отсутствует в снапшоте\n";
		$fail = true;
		continue;
	}

	$eff = newEffective($chId, $ch['mode'], $accessMap, $pour);
	$oldRead = $oldCh['read'];
	$oldAdmin = $oldCh['admin'];

	$gainedRead = array_diff_key($eff['read'], $oldRead);
	$lostRead = array_diff_key($oldRead, $eff['read']);
	$gainedAdmin = array_diff_key($eff['admin'], $oldAdmin);
	$lostAdmin = array_diff_key($oldAdmin, $eff['admin']);

	// Распределяем: реальные юзеры vs призраки
	$split = function ($uids) use ($users) {
		$real = [];
		$ghost = [];
		foreach ($uids as $uid => $_) {
			if (isset($users[$uid])) {
				$real[] = $uid;
			} else {
				$ghost[] = $uid;
			}
		}
		return [$real, $ghost];
	};

	list($gainedReadReal, $gainedReadGhost) = $split($gainedRead);
	list($lostReadReal, $lostReadGhost) = $split($lostRead);
	list($gainedAdminReal, ) = $split($gainedAdmin);
	list($lostAdminReal, ) = $split($lostAdmin);

	$isPrivate = ($ch['mode'] === 'private');
	$channelFail = false;

	// Гейты
	if (count($lostReadReal) > 0) {
		$channelFail = true; // реальный юзер потерял доступ — где угодно это провал
	}
	if ($isPrivate && count($gainedReadReal) > 0) {
		$channelFail = true; // кто-то попал в закрытый канал — катастрофа
	}
	if (count($gainedAdminReal) > 0 || count($lostAdminReal) > 0) {
		$channelFail = true; // админка не должна меняться миграцией
	}

	if (!$channelFail && count($gainedReadReal) === 0 && count($gainedReadGhost) === 0
		&& count($lostReadGhost) === 0 && count($gainedAdmin) === 0 && count($lostAdmin) === 0) {
		continue; // чисто — не печатаем, чтобы не засорять вывод
	}

	echo ($channelFail ? '!! ' : '   ') . "Канал {$chId} «{$ch['name']}» [{$ch['mode']}]\n";

	if (count($gainedReadReal) > 0) {
		$totalGainOpen += count($gainedReadReal);
		echo "    + доступ ПОЛУЧИЛИ (" . count($gainedReadReal) . "): ";
		echo $isPrivate ? "ЭТО ПРОВАЛ — закрытый канал\n" : "заливка дыр (ожидаемо для open)\n";
		if (count($gainedReadReal) <= 10) {
			foreach (describeUsers($gainedReadReal, $users) as $line) {
				echo "        {$line}\n";
			}
		}
		if ($isPrivate) {
			$fail = true;
		}
	}
	if (count($lostReadReal) > 0) {
		echo "    - доступ ПОТЕРЯЛИ (" . count($lostReadReal) . ") — ПРОВАЛ:\n";
		if (count($lostReadReal) <= 20) {
			foreach (describeUsers($lostReadReal, $users) as $line) {
				echo "        {$line}\n";
			}
		}
		$fail = true;
	}
	if (count($gainedAdminReal) > 0 || count($lostAdminReal) > 0) {
		echo "    !! админка изменилась: +" . count($gainedAdminReal) . " / -" . count($lostAdminReal) . " — ПРОВАЛ\n";
		$fail = true;
	}
	if (count($gainedReadGhost) > 0 || count($lostReadGhost) > 0) {
		$totalLostGhosts += count($lostReadGhost);
		echo "    призраки: +" . count($gainedReadGhost) . " / -" . count($lostReadGhost) . " (не влияет на гейты)\n";
	}
	if ($channelFail) {
		$fail = true;
	}
}

echo "\n" . str_repeat('-', 70) . "\n";
echo "ИТОГО: реальных потерь/проникновений в private — " . ($fail ? "ЕСТЬ" : "нет") . "\n";
echo "  Ожидаемые gain на open-каналах (заливка дыр): {$totalGainOpen}\n";
echo "  Призраков выброшено: {$totalLostGhosts}\n\n";

if ($fail) {
	echo "!! СВЕРКА НЕ ПРОЙДЕНА — swap запрещён\n";
	exit(1);
}
echo "СВЕРКА ЧИСТАЯ. Можно делать swap: php scripts/access-swap.php swap\n";
?>
