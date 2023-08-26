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

	// Прежде чем что-то двигать, соберём массив id детей в исходном дереве
	$result = getChildrenMessageIds($messageId, intval($message['id_first_parent']));
	$childrenIds = $result->childrenIds;

	if (!empty($message['id_parent'])) {
		// Если у сообщения был родитель - значит скопируем родителя и сделаем его firstParent'ом новой ветки

		// делаем копию родителя
		$sql = $mysqli->prepare('
			INSERT INTO tbl_messages (id_user, anonim, id_place, icon, nick, subject, message, time_created, children, id_first_parent, id_parent, attachments, emote_sps, emote_osj, 	emote_byn, emote_wut, emote_heh, emote_ogo, muted)
			SELECT id_user, anonim, id_place, icon, nick, subject, message, time_created, children, id_first_parent, id_parent, attachments, emote_sps, emote_osj, 	emote_byn, emote_wut, emote_heh, emote_ogo, muted
			FROM tbl_messages m
			WHERE
			id_message = ?
			LIMIT 1
		');
		$sql->bind_param("i", $message['id_parent']);
		$sql->execute();

		$newMessageParentId 		= mysqli_insert_id($mysqli);
		$newMessageFirstParentId 	= mysqli_insert_id($mysqli);
		$newChildrenFirstParentId 	= mysqli_insert_id($mysqli);

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
		$sql->bind_param("ii", $trashPlaceId, $newChildrenFirstParentId);
		$sql->execute();

	} else {
		// Если сообщение само было firstParent'ом - значит так и останется

		$newMessageParentId 		= 0;
		$newMessageFirstParentId 	= 0;
		$newChildrenFirstParentId 	= $messageId;
		
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
	$sql->bind_param(
		"iiii", 
		$trashPlaceId, 
		$newMessageParentId,
		$newMessageFirstParentId,
		$messageId
	);
	$sql->execute();

	// переносим детей в мусорку и задаём им firstParent
	if (count($childrenIds) > 0) {
		
		$types = 'ii' . str_repeat('i', count($childrenIds));

		$values = array();
		$values[] = $trashPlaceId;
		$values[] = $newChildrenFirstParentId;
		$values = array_merge($values, $childrenIds);

		$childrenQuestions = str_repeat('?,', count($childrenIds) - 1) . '?';

		$sql = '
			UPDATE tbl_messages
			SET
			id_place = ?,
			id_first_parent = ?
			WHERE
			id_message IN ('.$childrenQuestions.')
		';
		
		$stmt = $mysqli->prepare($sql);
		$stmt->bind_param($types, ...$values);
		$stmt->execute();

	}

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

	if (empty($messageFirstParentId)) { // значит что он сам firstParent
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

		$rec = &getOrCreateRec($messagesByIds, intval($row['id_message']));
		$rec->id_parent = (intval($row['id_parent']));
		if (empty($rec->id_parent)) {
			$rec->parent = NULL;
		} else {
			$rec->parent = &getOrCreateRec($messagesByIds, $rec->id_parent);
			// Если у парента нет такой ноды - добавим её
			$childExistsInParent = false;
			foreach ($rec->parent->children as $child) {
				if ($child->id_message == $rec->id_message) {
					$childExistsInParent = true;
					break;
				}
			}
			if (!$childExistsInParent) {
				$parent = &$rec->parent;
				$children = &$parent->children;
				$rec->parent->children[] = &$rec; // array_push не работает с ссылками, добавляем так
			}
		}

		if ($rec->id_message == $messageId) {
			$ourMessageRef = &$rec; // Это ссылка на искомое сообщение в дереве
			if (empty($messageFirstParentId)) {
				$firstParentRef = &$rec; // Удаляемое сообщение - и есть рутовое
			}
		}

		if (!empty($messageFirstParentId)) {
			if ($rec->id_message == $messageFirstParentId) {
				$firstParentRef = &$rec; // Это ссылка на рутовое сообщение дерева
			}
		}
		
	}

	// Дерево построили, теперь пробежимся по нему, соберём айдишники

	// Выводим результат
	$result = (object)[
		'childrenIds' => getIdsOfChildrenRecursively($ourMessageRef),
		'debuggingInfo' => (object)[
			'message' => getMessageDigest($ourMessageRef),
			'messages' => getMessagesDigest($messagesByIds),
			'firstParent' => getMessageDigest($firstParentRef)
		]
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

// Строит краткую инфу по всем сообщениям и их детям/родителям
function getMessagesDigest(&$messagesByIds) {
	$digest = array();
	foreach ($messagesByIds as $message) {
		$s = getMessageDigest($message);
		array_push($digest, $s);
	}
	return $digest;
}
function getMessageDigest(&$message) {
	$digest = 'NONE';
	if (!empty($message)) {

		$parentDigest = 'NONE';
		if (!empty($message->parent)) {
			$parentDigest = ''
				. '{' 
				. 'id:'  . $message->parent->id_message 
				. '|idp:' . $message->parent->id_parent
				. '|p' 	 . ( empty($message->parent->parent) ? 'NONE' : $message->parent->parent->id_message )
				. '}'
				;
		}

		$childrenDigest = 'NONE';
		if (!empty($message->children)) {
			$childrenDigest = '';
			foreach ($message->children as $child) {
				$childrenDigest .= ''
					. '{' 
					. 'id:'  . $child->id_message 
					. '|idp' . $child->id_parent
					. '|p' 	 . ( empty($child->parent) ? 'NONE' : $child->parent->id_message )
					. '}  '
					;
			}
		}

		$digest = 
			'id:' . $message->id_message . ' ' .
			'idparent:' . $message->id_parent . ' ' . 
			'parent:' . $parentDigest . ' ' .
			'children:' . $childrenDigest;
	}
	return '['.$digest.']';
}

function getIdsOfChildrenRecursively(&$message) {
	$result = array();
	if (!empty($message->children)) {
		foreach($message->children as $child) {
			array_push($result, $child->id_message);
			$subChildrenIds = getIdsOfChildrenRecursively($child);
			$result = array_merge($result, $subChildrenIds);
		}
		$result = array_unique($result);
	}
	return $result;
}

?>
