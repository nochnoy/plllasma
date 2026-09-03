<?
// REST обновляет юзерам столбец "количество неподписанных непросмотренных каналов"

require("include/main.php");

$roleNobody = ROLE_NOBODY;

$stmt = $mysqli->prepare('
UPDATE tbl_users uu LEFT JOIN
(SELECT u.id_user, u.nick, SUM(IF(l.id_place IS NULL OR (l.id_place IS NOT NULL AND l.ignoring = 0 AND l.at_menu = "f" AND l.time_viewed < p.time_changed), 1, 0)) AS unreadUnsubscribedChannels
FROM tbl_users u
LEFT JOIN tbl_access a ON a.id_user = u.id_user AND a.role IS NOT NULL AND a.role <> ?
LEFT JOIN tbl_places p ON p.id_place = a.id_place
LEFT JOIN lnk_user_place l ON l.id_user = a.id_user AND l.id_place = p.id_place
WHERE p.id_place IS NOT NULL
GROUP BY a.id_user
ORDER BY `u`.`nick` ASC
) cc
ON uu.id_user = cc.id_user
SET uu.unread_unsubscribed_channels = cc.unreadUnsubscribedChannels
');
$stmt->bind_param("i", $roleNobody);
$stmt->execute();
$result = $stmt->get_result();

// Для юзеров, у которых есть записи в lnk_user_ignore, пересчитываем отдельно:
// канал не считается непрочитанным, если все новые сообщения в нём
// от мягко игнорируемых юзеров или от юзеров, с которыми взаимно исчезли
$stmt = $mysqli->prepare('
UPDATE tbl_users uu JOIN
(SELECT u.id_user, SUM(IF((l.id_place IS NULL OR (l.id_place IS NOT NULL AND l.ignoring = 0 AND l.at_menu = "f" AND l.time_viewed < p.time_changed))
AND EXISTS (
	SELECT 1 FROM tbl_messages m
	WHERE m.id_place = p.id_place
	AND (l.time_viewed IS NULL OR m.time_created > l.time_viewed)
	AND (m.id_user IS NULL OR m.id_user NOT IN (
		SELECT id_ignored_user FROM lnk_user_ignore i1 WHERE i1.id_user = u.id_user AND i1.mode = 1
		UNION
		SELECT id_ignored_user FROM lnk_user_ignore i2 WHERE i2.id_user = u.id_user AND i2.mode = 2
		UNION
		SELECT id_user FROM lnk_user_ignore i3 WHERE i3.id_ignored_user = u.id_user AND i3.mode = 2
	))
), 1, 0)) AS unreadUnsubscribedChannels
FROM tbl_users u
JOIN (SELECT id_user FROM lnk_user_ignore UNION SELECT id_ignored_user FROM lnk_user_ignore WHERE mode = 2) ig ON ig.id_user = u.id_user
LEFT JOIN tbl_access a ON a.id_user = u.id_user AND a.role IS NOT NULL AND a.role <> ?
LEFT JOIN tbl_places p ON p.id_place = a.id_place
LEFT JOIN lnk_user_place l ON l.id_user = a.id_user AND l.id_place = p.id_place
WHERE p.id_place IS NOT NULL
GROUP BY a.id_user
) cc
ON uu.id_user = cc.id_user
SET uu.unread_unsubscribed_channels = cc.unreadUnsubscribedChannels
');
$stmt->bind_param("i", $roleNobody);
$stmt->execute();
$result = $stmt->get_result();

exit(json_encode((object)[
	'ok' => true
]));

?>