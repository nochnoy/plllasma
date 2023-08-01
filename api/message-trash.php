<? // REST для удаления сообщения в мусорку

include("include/main.php");

$messageId 			= intval(@trim(@$input['messageId']));
$trashPlaceId		= TRASH_PLACE;

loginBySessionOrToken();

// Узнаем есть ли такое сообщение и что за канал
$sql = $mysqli->prepare('
	SELECT *
	FROM tbl_messages
	WHERE
	id_message = ?
');
$sql->bind_param("i", $messageId);
$sql->execute();
$result = $sql->get_result();
if ($message = mysqli_fetch_assoc($result)) {

	// есть право сюда писать?
	if (!canTrash($message['id_place'])) {
		exit(json_encode((object)[
			'error'	  => 'access',
			'success' => false,
		]));
	}

	// Прежде чем что-то менять, соберём массив id детей
	$childrenIds = getChildrenMessageIds($messageId, intval($message['id_first_parent']));

	// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
	echo(json_encode($childrenIds));
	die();

	// Если у сообщения был родитель - значит скопируем родителя и сделаем его firstParent'ом новой ветки
	// Если сообщение само было firstParent'ом - значит так и останется
	if (!empty($message['id_parent'])) {

		// делаем копию родителя
		$sql = $mysqli->prepare('
			INSERT INTO tbl_messages
			SELECT *
			FROM tbl_messages
			WHERE
			id_message = ?
			LIMIT 1
		');
		$sql->bind_param("i", $message['id_parent']);
		$sql->execute();
		$newFirstParentId = mysqli_insert_id($mysqli);

		// меняем поля копии
		$sql = $mysqli->prepare('
			UPDATE tbl_messages
			SET
			id_place = ?,
			id_parent = 0,
			id_first_parent = 0
			WHERE
			id_message = ?
			LIMIT 1
		');
		$sql->bind_param("ii", $trashPlaceId, $newFirstParentId);
		$sql->execute();

	} else {
		$newFirstParentId = $messageId;
	}

	// переносим удаляемое в мусорку
	$sql = $mysqli->prepare('
		UPDATE tbl_messages
		SET
		id_place = ?,
		id_parent = ?,
		id_first_parent = ?
		WHERE
		id_message = ?
		LIMIT 1
	');
	$newParentId = $newFirstParentId == $messageId ? 0 : $newFirstParentId;
	$newFirstParent = $newFirstParentId == $messageId ? 0 : $newFirstParentId;
	$sql->bind_param(
		"iiii", 
		$trashPlaceId, 
		$newParentId,
		$newFirstParent,
		$messageId
	);
	$sql->execute();

	// переносим детей в мусорку
	// задаём детям firstParent

	// обновить кол-во детей в обеих ветках - старой и новой
	// обновить звёздочки в обоих каналах


	exit(json_encode((object)[
		'success' => true
	]));
} else {
	exit(json_encode((object)[
		'error'	  => 'messageNotFound',
		'success' => false
	]));
}

// Получает id сообщения и id первого сообщения ветки
// Возвращает массив id дочерних сообщений вниз по иерархии
function &getChildrenMessageIds($messageId, $messageFirstParentId) {
	global $mysqli;

	$messagesByIds = array();
	$ourMessageRef = NULL;
	$firstParentRef = NULL;
	$log = array(); // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<

	if (empty($messageFirstParentId)) { // значит что он сам firstParent
		echo('Он сам firstParent');
		$oldFirstParent = $messageId;
	} else {
		$oldFirstParent = $messageFirstParentId;
	}

	$sql = $mysqli->prepare('
		SELECT id_message, id_parent
		FROM tbl_messages
		WHERE
		id_first_parent = ? OR id_message = ?
	');
	$sql->bind_param("ii", $oldFirstParent, $oldFirstParent);
	$sql->execute();
	$result = $sql->get_result();
	while ($row = mysqli_fetch_assoc($result)) {

		array_push($log, $row['id_message']);
		$rec = &getOrCreateRec($messagesByIds, intval($row['id_message']));
		$rec->id_parent = (intval($row['id_parent']));
		if (empty($rec->id_parent)) {
			$rec->parent = NULL;
		} else {
			$rec->parent = &getOrCreateRec($messagesByIds, $rec->id_parent);
		}

		if ($rec->id_message == $messageId) {
			$ourMessageRef = &$rec; // Это ссылка на искомое сообщение в дереве
		}
		if ($rec->id_message == $messageFirstParentId) {
			$firstParentRef = &$rec; // Это ссылка на рутовое сообщение дерева
		}
		
	}

	$result = (object)[
		'log' => $log,
		'message' => $ourMessageRef,
		'firstParent' => $firstParentRef,
		'allThreadMessages' => $messagesByIds
	];

	return $result;
}

// Утилита для getChildrenMessageIds() - работает с массивом messagesByIds
// возвращает объект сообщения из массива по id. Если его там ещё нет - создаст.
function &getOrCreateRec(&$messagesByIds, $messageId) { 
	if (empty($messageId)) {
		throw new Exception("messageId не может быть пустой", 1);
	}
	$rec = &$messagesByIds[$messageId];
	if (empty($rec)) {
		$rec = (object)[
			'id_message' => $messageId,
			'id_parent'  => NULL,
			'parent'	 => NULL,
			'children'   => array()
		];			
		$messagesByIds[$messageId] = &$rec;
	}
	return $rec;
};

?>
