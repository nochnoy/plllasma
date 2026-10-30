<? // REST для переноса сообщения в другой канал
   // Если в запросе не передан placeId - сообщение переносится в Кухню (KITCHEN_PLACE)

include("include/main.php");

$messageId 			= intval(@trim(@$input['messageId']));
$trashPlaceId		= intval(@$input['placeId']) ? intval($input['placeId']) : KITCHEN_PLACE;

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

	// ошибка: не может модерировать
	if (!canTrash($message['id_place'])) {
		exit(json_encode((object)[
			'error'	  => 'access',
			'success' => false,
		]));
	}

	// ошибка: канал назначения не существует
	$sql = $mysqli->prepare('
		SELECT id_place
		FROM tbl_places
		WHERE
		id_place = ?
		LIMIT 1
	');
	$sql->bind_param("i", $trashPlaceId);
	$sql->execute();
	if (mysqli_num_rows($sql->get_result()) == 0) {
		exit(json_encode((object)[
			'error'	  => 'targetChannelNotFound',
			'success' => false,
		]));
	}

	// ошибка: нет прав писать в канал назначения
	if (!canWrite($trashPlaceId)) {
		exit(json_encode((object)[
			'error'	  => 'targetChannelWriteAccess',
			'success' => false,
		]));
	}

	$oldPlaceId 		= intval($message['id_place']);
	$oldFirstParent 	= intval($message['id_first_parent']);

	// ошибка: исходный и конечный каналы совпадают
	if ($oldPlaceId == $trashPlaceId) {
		exit(json_encode((object)[
			'error'	  => 'sourceAndTargetChannelsAreEqual',
			'success' => false,
		]));
	}

	// Прежде чем что-то двигать, соберём массив id детей в исходном дереве
	$result = getChildrenMessageIds($messageId, intval($message['id_first_parent']));
	$childrenIds = $result->childrenIds;

	// Переносимое сообщение становится корнем новой ветки в целевом канале
	$newChildrenFirstParentId = $messageId;

	// переносим сообщение
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
	$sql->bind_param(
		"ii",
		$trashPlaceId,
		$messageId
	);
	$sql->execute();

	// переносим детей и задаём им firstParent
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

	// Посчитаем количество детей в старой ветке
	$sql = $mysqli->prepare('
		UPDATE tbl_messages
		SET children = (SELECT COUNT(id_message) FROM (SELECT id_message, id_first_parent FROM tbl_messages) as m WHERE id_first_parent = ?)
		WHERE id_message = ?
		LIMIT 1
	');
	$sql->bind_param(
		"ii",
		$oldFirstParent,
		$oldFirstParent,
	);
	$sql->execute();

	// Посчитаем количество детей в новой ветке
	$sql = $mysqli->prepare('
		UPDATE tbl_messages
		SET children = (SELECT COUNT(id_message) FROM (SELECT id_message, id_first_parent FROM tbl_messages) as m WHERE id_first_parent = ?)
		WHERE id_message = ?
		LIMIT 1
	');
	$sql->bind_param(
		"ii",
		$newChildrenFirstParentId,
		$newChildrenFirstParentId,
	);
	$sql->execute();

	// Обновляем звёздочки на исходном канале
	$sql = $mysqli->prepare('
		UPDATE tbl_places
		SET time_changed = (SELECT MAX(time_created) FROM (SELECT id_message, id_first_parent, time_created FROM tbl_messages) as m WHERE id_first_parent = ? OR id_message = ?)
		WHERE id_place = ?
		LIMIT 1
	');
	$sql->bind_param(
		"iii",
		$oldFirstParent,
		$oldFirstParent,
		$oldPlaceId,
	);
	$sql->execute();

	// Обновляем звёздочки на канале назначения
	$sql = $mysqli->prepare('
		UPDATE tbl_places
		SET time_changed = (SELECT MAX(time_created) FROM (SELECT id_message, id_first_parent, time_created FROM tbl_messages) as m WHERE id_first_parent = ? OR id_message = ?)
		WHERE id_place = ?
		LIMIT 1
	');
	$sql->bind_param(
		"iii",
		$newChildrenFirstParentId,
		$newChildrenFirstParentId,
		$trashPlaceId,
	);
	$sql->execute();

	// Переносим аттачменты
	moveAttachments($oldPlaceId, $trashPlaceId, [$messageId]);
	moveAttachments($oldPlaceId, $trashPlaceId, $childrenIds);

	// Готово

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

// Переносит файлы аттачментов сообщений из канала в канал.
// Файловые операции глушим через @ - warning в выводе ломает JSON-ответ
function moveAttachments($sourcePlaceId, $targetPlaceId, $messageIds) {
	if (!file_exists('../attachments/' . $targetPlaceId)) {
		@mkdir('../attachments/' . $targetPlaceId, 0777);
	}

	$pathFrom = '../attachments/' . $sourcePlaceId . '/';
	$pathTo = '../attachments/' . $targetPlaceId . '/';

	for ($i = 0; $i < count($messageIds); $i++) {
		$j = 0;
		while (true) {
			$body = $messageIds[$i] . '_' . $j;
			$fileList = glob($pathFrom . $body . '.*');
			if (count($fileList) > 0) {

				// сам файл
				$extension = getFileExtension($fileList[0]);
				$from = $pathFrom . $body . '.' . $extension;
				$to = $pathTo . $body . '.' . $extension;

				if (@copy($from, $to)) {
					@unlink($from);
				}

				// тумбнейл
				$from = $pathFrom . $body . 't.jpg';
				$to = $pathTo . $body . 't.jpg';

				if (@copy($from, $to)) {
					@unlink($from);
				}

				$j++;
			} else {
				break;
			}
		}
	}
}

?>
