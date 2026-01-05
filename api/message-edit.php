<? // REST для исправления текста сообщения и публикации черновиков

include("include/main.php");

$messageId 			= @trim($_POST['messageId']);
$message 			= @trim($_POST['message']);
$newPlaceId 		= @trim($_POST['placeId']); // Для публикации черновика
$htmlMessage 		= txt2html($message);
$oldMessage 		= '';

loginBySessionOrToken();

// Узнаем есть ли такое сообщение и что за канал
$sql = $mysqli->prepare('
	SELECT id_user, id_place, message, IF (time_created < (NOW() - INTERVAL 4 HOUR), 1, 0) as tooLate
	FROM tbl_messages
	WHERE
	id_message = ?
');
$sql->bind_param("i", $messageId);
$sql->execute();
$result = $sql->get_result();
if ($row = mysqli_fetch_assoc($result)) {

	$oldMessage = $row['message'];
	$currentPlaceId = intval($row['id_place']);
	$isDraft = ($currentPlaceId === 0); // Это черновик?
	$isPublishing = $isDraft && !empty($newPlaceId); // Публикуем черновик?

	// это вообще твоё сообщение?
	if ($row['id_user'].'' != $user['id_user'].'') {
		exit(json_encode((object)[
			'error'	  => 'notYourMessage',
			'success' => false,
			'message' => $oldMessage
		]));	
	}

	// Проверяем права на канал
	if ($isPublishing) {
		// Публикация черновика — проверяем права на целевой канал
		if (!canWrite($newPlaceId)) {
			exit(json_encode((object)[
				'error'	  => 'access',
				'success' => false,
				'message' => $oldMessage
			]));	
		}
	} elseif (!$isDraft) {
		// Обычное редактирование — проверяем права на текущий канал
		if (!canWrite($currentPlaceId)) {
			exit(json_encode((object)[
				'error'	  => 'access',
				'success' => false,
				'message' => $oldMessage
			]));	
		}
		
		// с момента его написания ещё не прошли 4 часа? (не для черновиков)
		if ($row['tooLate']) {
			exit(json_encode((object)[
				'error'	  => 'tooLate',
				'success' => false,
				'message' => $oldMessage
			]));		
		}	

		// а ответов на сообщение ещё не писали? (не для черновиков)
		$sql = $mysqli->prepare('
			SELECT id_message
			FROM tbl_messages
			WHERE
			id_parent = ?
		');
		$sql->bind_param("i", $messageId);
		$sql->execute();
		$result = $sql->get_result();
		if (mysqli_num_rows($result) > 0) {
			exit(json_encode((object)[
				'error'	  => 'thereAreAnsvers',
				'success' => false,
				'message' => $oldMessage
			]));
		}
	}

	// Всё ок, пишем
	if ($isPublishing) {
		// Публикуем черновик — обновляем текст и id_place
		$sql = $mysqli->prepare('
			UPDATE tbl_messages SET message = ?, id_place = ?
			WHERE id_message = ?
			LIMIT 1
		');
		$sql->bind_param("sii", $htmlMessage, $newPlaceId, $messageId);
		$sql->execute();
		
		// Обновляем время изменения канала
		mysqli_query($mysqli, 'UPDATE tbl_places SET time_changed = NOW() WHERE id_place='.$newPlaceId);
	} else {
		// Обычное редактирование
		$sql = $mysqli->prepare('
			UPDATE tbl_messages SET message = ?
			WHERE id_message = ?
			LIMIT 1
		');
		$sql->bind_param("si", $htmlMessage, $messageId);
		$sql->execute();
	}

	// Обрабатываем аттачменты для YouTube ссылок
	$youtubeAttachments = processMessageAttachments($messageId, $message);
	
	// Получаем ВСЕ аттачменты сообщения из БД (включая файлы)
	$allAttachmentIds = [];
	$attachmentResult = mysqli_query($mysqli, "SELECT id FROM tbl_attachments WHERE id_message = {$messageId} ORDER BY created");
	while ($attachmentRow = mysqli_fetch_assoc($attachmentResult)) {
		$allAttachmentIds[] = $attachmentRow['id'];
	}
	
	// Обновляем JSON со всеми аттачментами
	if (!empty($allAttachmentIds)) {
		updateMessageJson($messageId, $allAttachmentIds);
	}

	exit(json_encode((object)[
		'success' => true,
		'message' => $message,
		'published' => $isPublishing
	]));
}

exit(json_encode((object)[
	'error'	  => 'messageNotFound',
	'success' => false,
	'message' => $oldMessage
]));

?>
