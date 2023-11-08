<?
// REST обновляет юзерам столбец "количество неподписанных непросмотренных каналов"

require("include/main.php");

$roleNobody = ROLE_NOBODY;

// в условии ниже вторая строка была такой:
// (SELECT u.id_user, u.nick, SUM(IF(l.id_place IS NULL OR (l.id_place IS NOT NULL AND l.at_menu = "f" AND l.time_viewed < p.time_changed), 1, 0)) AS unreadUnsubscribedChannels
// Но я решил что суперзвёздочка должна появляться только на каналах в которые ты ещё не входил

$stmt = $mysqli->prepare('
UPDATE tbl_users uu LEFT JOIN
(SELECT u.id_user, u.nick, SUM(IF(l.id_place IS NULL, 1, 0)) AS unreadUnsubscribedChannels
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

exit(json_encode((object)[
	'ok' => true
]));

?>