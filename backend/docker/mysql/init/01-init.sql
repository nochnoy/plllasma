-- Инициализация базы данных для Plllasma Backend
-- Этот скрипт выполняется при первом запуске MySQL контейнера

-- Устанавливаем кодировку UTF8MB4 для поддержки эмодзи
ALTER DATABASE plllasma CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Создаем пользователя если не существует
CREATE USER IF NOT EXISTS 'plllasma'@'%' IDENTIFIED BY 'plllasma_password_123';

-- Предоставляем права доступа
GRANT ALL PRIVILEGES ON plllasma.* TO 'plllasma'@'%';

-- Применяем изменения
FLUSH PRIVILEGES;

-- Переключаемся на базу данных plllasma
USE plllasma;

-- Создаем базовые таблицы если они не существуют
-- (основные таблицы будут созданы из plllasma.sql)

-- Создаем тестового пользователя для проверки авторизации
INSERT IGNORE INTO tbl_users (
    id_user, 
    login, 
    password, 
    nick, 
    email, 
    time_joined,
    logmode,
    sex,
    usrStatus,
    birthday,
    country,
    city,
    icq,
    homepage,
    businesstype,
    businesstext,
    realname
) VALUES (
    1,
    'test',
    'test',
    'Test User',
    'test@example.com',
    NOW(),
    1,
    0,
    'active',
    '',
    '',
    '',
    '',
    '',
    0,
    '',
    'Test User'
);

-- Создаем базовые права доступа для тестового пользователя
INSERT IGNORE INTO tbl_access (id, id_user, id_place, role, addedbyscript) VALUES
(1, 1, 1, 1, 0), -- ROLE_WRITER для канала 1
(2, 1, 2, 1, 0); -- ROLE_WRITER для канала 2 (Kitchen)

-- Выводим информацию о созданных пользователях
SELECT 'Database initialized successfully!' as message;
SELECT COUNT(*) as user_count FROM tbl_users;
