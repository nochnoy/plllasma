<?  
// REST для получения списка каналов юзера для страницы "каналы"

include("include/main.php");

loginBySessionOrToken();

$sql =
    'SELECT DISTINCT p.id_place, p.id_section, p.parent, p.first_parent, p.name, p.description, p.time_changed, p.path, p.typ, l.weight, l.time_viewed, l.at_menu, a.role, l.ignoring'.
    ' FROM tbl_places p'.
    ' LEFT JOIN tbl_access a ON a.id_place = p.id_place AND a.id_user = '.$user['id_user'].    
    ' LEFT JOIN lnk_user_place l ON l.id_place = p.id_place AND l.id_user = '.$user['id_user']
    ;
$result = mysqli_query($mysqli, $sql);

$output = array();
while($row = mysqli_fetch_assoc($result)) {
    $output[] = $row;
}

// Проставим звёздочки. Базово - по датам (никогда не открытый канал звездится),
// каналы, которые юзер игнорит, не звездятся (фронт им звёздочку не рисует).
for ($i = 0; $i < count($output); $i++) { 
    $row = &$output[$i];
    $row['_STAR_'] = ($row['ignoring'] != 1) && (empty($row['time_viewed']) || $row['time_changed'] > $row['time_viewed']);
}
unset($row);

// Авторы, чьи новые сообщения не должны звездить каналы:
// мягко игнорируемые юзеры и юзеры, с которыми взаимно исчезли
$excludedAuthors = array_merge(
    !empty($user['ignored_soft']) ? $user['ignored_soft'] : array(),
    !empty($user['vanished']) ? $user['vanished'] : array()
);

// Если юзер кого-то игнорит - мягкий пересчёт: звездим канал,
// только если в нём есть новые сообщения не от исключённых авторов
if (count($excludedAuthors) > 0) {
    $placeIds = array();
    for ($i = 0; $i < count($output); $i++) { 
        $row = &$output[$i];
        if ($row['_STAR_']) {
            $placeIds[] = $row['id_place'];
        }
    }
    unset($row);

    if (count($placeIds) > 0) {
        $sql =
            'SELECT DISTINCT m.id_place'
            .' FROM tbl_messages m'
            .' LEFT JOIN lnk_user_place l ON l.id_user='.$user['id_user'].' AND l.id_place = m.id_place'
            .' WHERE m.id_place IN ('.implode(',', $placeIds).')'
            .' AND (l.time_viewed IS NULL OR m.time_created > l.time_viewed)'
            .' AND (m.id_user IS NULL OR m.id_user NOT IN ('.implode(',', $excludedAuthors).'))'
            ;
        $r = mysqli_query($mysqli, $sql);
        $updatedPlaces = array();
        while($r2 = mysqli_fetch_array($r)) {
            $updatedPlaces[] = $r2[0];
        }

        // Раздаём звёздочки
        for ($i = 0; $i < count($output); $i++) { 
            $row = &$output[$i];
            $row['_STAR_'] = $row['_STAR_'] && in_array($row['id_place'], $updatedPlaces);
        }
        unset($row);
    }
}

exit(json_encode($output));
?>