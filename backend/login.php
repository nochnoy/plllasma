<? 
// REST для автризации
// Параметры:
// 		login
// 		password
// Если в параметрах пусто - попытается авторизоваться данными из сессии или cookies

include("include/main.php");

if (!(empty($input['login']) && empty($input['password']))) {
	if (loginByPassword($input['login'], $input['password'])) {
		exit(json_encode(getUserInfoForClient()));
	}
} else {
	// Если логин-пароль не указаны - значит это попытка залогиниться по сессии/кукам
	loginBySessionOrToken();
	exit(json_encode(getUserInfoForClient()));
}
?>