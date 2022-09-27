<? 
// REST для разлогина

include("include/main.php");

global $userId;

unset($userId);
unset($_SESSION['plasma_user_id']);

clearCookieKey();

session_unset();
session_destroy();

respond('status', '{"authorized": false}');

?>