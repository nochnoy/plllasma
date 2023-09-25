<?
// Главный файл для REST-API
// Цепляется к базе, подготавливает всё для работы конкретных эндпоинтов

require("include/functions-utils.php");
require("include/functions-user.php");
require("include/functions-messages.php");
require("include/functions-channels.php");
require("include/functions-channel.php");
require("include/functions-files.php");

include "../../plllasma-passwords.php";
if (empty($passwordDB)) {
    die('Скопируй plllasma-passwords.php в родительскую папку всех сайтов, впиши туда актуальные пароли.');
}

define("SESSION_NAME", 'plasma');
define("DOMAIN", $_SERVER['SERVER_NAME']);
define("DB_HOST", "localhost");
define("DB_USER", "plllasma");
define("DB_PASSWORD", $passwordDB);
define("DB_DB", "plllasma");
define("COOKIE_KEY_CODE", "contortion_key");
define("PATH_TO_STORAGE", "../../attachments/");
define("MAX_STARRED_THREADS", 20); // порог кол-ва новых сообщений после которого перестаём строить серые ветки
define("PAGE_SIZE", 50);
define("TRASH_PLACE", 5);
define("ROLE_READER", 0);
define("ROLE_WRITER", 1);
define("ROLE_MODERATOR", 2);
define("ROLE_ADMIN", 3);
define("ROLE_OWNER", 4);
define("ROLE_GOD", 5);
define("ROLE_NOBODY", 9);
define("PREVIEW_IMAGE_WIDTH", 160);
define("PREVIEW_IMAGE_HEIGHT", 160);
define("ATTACHMENT_MAX_WEIGHT_MB", 50);
define("MATRIX_IMAGE_MAX_WEIGHT_MB", 1);

$allowed_http_origins = [
    "https://plllasma.ru",
    "https://plllasma.com",
    "https://contortion.ru",
    "https://localhost",
];

session_set_cookie_params(0 , '/', DOMAIN);
session_name(SESSION_NAME);
session_start();

header('Content-Type: application/json; charset=UTF-8');
header("Access-Control-Allow-Headers: Cache-Control, Pragma, Origin, Authorization, Content-Type, X-Requested-With, X-Auth-Token");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, PATCH, DELETE");
header("Access-Control-Allow-Credentials: true");
if (in_array(DOMAIN, $allowed_http_origins)) {  
    @header("Access-Control-Allow-Origin: " . DOMAIN);
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_DB);
$mysqli->query("SET NAMES 'utf8'");
$mysqli->set_charset('utf8mb4');
$mysqli->options(MYSQLI_OPT_INT_AND_FLOAT_NATIVE, 1);

$user = NULL;
$userId = NULL;
$input = json_decode(file_get_contents('php://input'), true);
?>