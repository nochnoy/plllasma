<?
/**
 * Общая библиотека для скриптов миграции системы прав (scripts/access-*.php)
 *
 * Семантика новой модели:
 *  - open-канал: по умолчанию доступ имеют ВСЕ юзеры из tbl_users;
 *    записи в tbl_access — только исключения: 9 = бан, 0 = ридонли, 2..5 = повышенные права.
 *    Записи с role=1 (writer) на open-каналах избыточны и при миграции удаляются.
 *  - private-канал: дефолта нет; доступ только по явным записям (role != 9).
 *  - Главный канал никак не выделяется, подчиняется общим правилам, как и все.
 *
 * Примечание: до отдельного релиза canWrite() на сервере эквивалентна canRead(),
 * поэтому здесь сравнивается один набор readers — это изоморфно текущему поведению.
 */

chdir(__DIR__ . '/../../api');
require_once('include/main.php');

ini_set('memory_limit', '2G');

// Кого НЕ лить в open-каналы по умолчанию. '' = лить всех (изоморфно старой схеме,
// где register.php выдавал writer каждому зарегистрировавшемуся).
// Статистику по таким юзерам покажет access-snapshot.php — решение принимать по ней.
define('ACCESS_POUR_EXCLUDE_NICK_PREFIX', '');

define('ACCESS_MAIN_CHANNEL_ID', 1);

function isAdminRole($role) {
	return $role == ROLE_MODERATOR || $role == ROLE_ADMIN || $role == ROLE_OWNER || $role == ROLE_GOD;
}

function loadUsers() {
	global $mysqli;
	$users = [];
	$res = $mysqli->query('SELECT id_user, nick FROM tbl_users');
	while ($row = $res->fetch_assoc()) {
		$users[(int)$row['id_user']] = $row['nick'];
	}
	return $users;
}

function loadChannels() {
	global $mysqli;
	$channels = [];
	$res = $mysqli->query('SELECT id_place, name, privacy_mode FROM tbl_places ORDER BY id_place');
	while ($row = $res->fetch_assoc()) {
		$channels[(int)$row['id_place']] = [
			'name' => $row['name'],
			'mode' => $row['privacy_mode'],
		];
	}
	return $channels;
}

// [channelId][userId] = ['role'=>int, 'manual'=>bool], дубликаты схлопнуты
// (максимальная роль; ручная запись важнее скриптовой)
function loadAccessMap($table) {
	global $mysqli;
	$map = [];
	$res = $mysqli->query("SELECT id_user, id_place, role, addedbyscript FROM {$table}");
	while ($row = $res->fetch_assoc()) {
		$ch = (int)$row['id_place'];
		$u = (int)$row['id_user'];
		$role = (int)$row['role'];
		$manual = ((int)$row['addedbyscript'] === 0);
		if (!isset($map[$ch][$u])) {
			$map[$ch][$u] = ['role' => $role, 'manual' => $manual];
		} else {
			if ($role > $map[$ch][$u]['role']) {
				$map[$ch][$u]['role'] = $role;
			}
			if ($manual) {
				$map[$ch][$u]['manual'] = true;
			}
		}
	}
	return $map;
}

// Старые эффективные права: есть строка с role != 9
function oldEffective($rows) {
	$read = [];
	$admin = [];
	foreach ($rows as $uid => $r) {
		if ($r['role'] == ROLE_NOBODY) {
			continue;
		}
		$read[$uid] = $r['role'];
		if (isAdminRole($r['role'])) {
			$admin[$uid] = true;
		}
	}
	return ['read' => $read, 'admin' => $admin];
}

// Новые эффективные права: open — все из $pourSet плюс исключения из таблицы;
// private — только явные записи. Вернёт ['read'=>[uid=>role], 'admin'=>[uid=>true]]
function newEffective($channelId, $mode, $accessMap, $pourSet) {
	$read = [];
	$admin = [];
	if ($mode === 'open') {
		foreach ($pourSet as $uid => $_) {
			$read[$uid] = ROLE_WRITER;
		}
	}
	$rows = isset($accessMap[$channelId]) ? $accessMap[$channelId] : [];
	foreach ($rows as $uid => $r) {
		if ($r['role'] == ROLE_NOBODY) {
			unset($read[$uid]);
			continue;
		}
		$read[$uid] = $r['role'];
		if (isAdminRole($r['role'])) {
			$admin[$uid] = true;
		}
	}
	return ['read' => $read, 'admin' => $admin];
}

// Множество юзеров, льющихся в open-каналы по умолчанию
function pourUserIds($users) {
	$out = [];
	$prefix = ACCESS_POUR_EXCLUDE_NICK_PREFIX;
	foreach ($users as $id => $nick) {
		if ($prefix !== '' && mb_substr($nick, 0, mb_strlen($prefix, 'UTF-8'), 'UTF-8') === $prefix) {
			continue;
		}
		$out[$id] = true;
	}
	return $out;
}

// uid => nick из плоского списка id
function describeUsers($uids, $users) {
	$out = [];
	foreach ($uids as $uid) {
		$out[] = $uid . (isset($users[$uid]) ? ' (' . $users[$uid] . ')' : ' (ПРИЗРАК)');
	}
	return $out;
}
?>
