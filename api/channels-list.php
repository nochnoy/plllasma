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

for ($i = 0; $i < count($output); $i++) { 
    $row = &$output[$i];
}

exit(json_encode($output));
?>