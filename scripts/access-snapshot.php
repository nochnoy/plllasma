<?
/**
 * Снапшот текущих (старых) эффективных прав -> JSON-эталон для сверки.
 * ТОЛЬКО ЧТЕНИЕ. Запускать ПЕРВЫМ, до любых изменений:
 *
 *   php scripts/access-snapshot.php
 */

require_once(__DIR__ . '/include/access-lib.php');

$outDir = __DIR__ . '/out';
if (!is_dir($outDir)) {
	mkdir($outDir, 0755, true);
}

echo "=== Снапшот текущих прав (старая модель) ===\n\n";

$users = loadUsers();
$channels = loadChannels();
echo "Юзеров: " . count($users) . ", каналов: " . count($channels) . "\n";

// Статистика дублей пар (user, place)
$dupePairs = 0;
$dupeConflicts = 0;
$res = $mysqli->query('SELECT COUNT(*) c, MAX(role) mx, MIN(role) mn FROM tbl_access GROUP BY id_place, id_user HAVING c > 1');
while ($row = $res->fetch_assoc()) {
	$dupePairs++;
	if ($row['mx'] != $row['mn']) {
		$dupeConflicts++;
	}
}
echo "Дублирующихся пар (user, place): {$dupePairs} (из них с разными ролями: {$dupeConflicts})\n";
if ($dupePairs > 0) {
	echo "!! Сначала прогоните scripts/access-dedup.php\n\n";
}

$accessMap = loadAccessMap('tbl_access');
$pour = pourUserIds($users);
echo "Вливается в open-каналы по умолчанию: " . count($pour) . " юзеров\n";

// Юзеры с ником на '?' — кандидаты на исключение из дефолтного вливания
$questionNicks = [];
foreach ($users as $uid => $nick) {
	if (mb_substr($nick, 0, 1, 'UTF-8') === '?') {
		$questionNicks[$uid] = true;
	}
}
echo "Юзеров с ником на '?': " . count($questionNicks) . "\n\n";

$ghostRows = 0;
$openGaps = 0;
$data = [
	'created' => date('c'),
	'model' => 'old',
	'users' => count($users),
	'channels' => [],
];

foreach ($channels as $chId => $ch) {
	$rows = isset($accessMap[$chId]) ? $accessMap[$chId] : [];
	// "Сырые" строки по призракам считаем отдельно от эффективных прав
	foreach ($rows as $uid => $r) {
		if (!isset($users[$uid])) {
			$ghostRows++;
		}
	}
	$eff = oldEffective($rows);
	ksort($eff['read']);
	ksort($eff['admin']);
	$data['channels'][$chId] = [
		'mode' => $ch['mode'],
		'name' => $ch['name'],
		'read' => $eff['read'],
		'admin' => $eff['admin'],
	];
	if ($ch['mode'] === 'open') {
		foreach ($pour as $uid => $_) {
			if (!isset($eff['read'][$uid])) {
				$openGaps++;
			}
		}
	}
}

// Юзеры без доступа к Главному (в новой модели ничего не ломается,
// но их стоит знать — это единственные, кто увидит сайт без Главного в меню)
$noMain = [];
$mainRead = isset($data['channels'][ACCESS_MAIN_CHANNEL_ID]['read']) ? $data['channels'][ACCESS_MAIN_CHANNEL_ID]['read'] : [];
foreach ($pour as $uid => $_) {
	if (!isset($mainRead[$uid])) {
		$noMain[] = $uid;
	}
}
sort($noMain);

$data['stats'] = [
	'dupePairs' => $dupePairs,
	'dupeConflicts' => $dupeConflicts,
	'ghostRows' => $ghostRows,
	'openGaps' => $openGaps,
	'questionNickUsers' => count($questionNicks),
	'noMainAccess' => $noMain,
];

$path = $outDir . '/access-snapshot-' . date('Ymd-His') . '.json';
file_put_contents($path, json_encode($data, JSON_UNESCAPED_UNICODE));

echo str_repeat('-', 70) . "\n";
echo "ИТОГИ:\n";
echo "  Строк access по призракам (uid нет в tbl_users): {$ghostRows}\n";
echo "  Дыр во вливании (юзер есть, строки на open-канале нет): {$openGaps}\n";
echo "  Юзеров без доступа к Главному (канал " . ACCESS_MAIN_CHANNEL_ID . "): " . count($noMain) . "\n";
if (count($noMain) > 0 && count($noMain) <= 20) {
	foreach (describeUsers($noMain, $users) as $line) {
		echo "    - {$line}\n";
	}
}
echo "\nСнапшот записан: {$path}\n";
echo "Сохраните этот файл — это эталон для access-verify.php\n";
?>
