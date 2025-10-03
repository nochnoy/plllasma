-- Скрипт ожидания создания основных таблиц
-- Выполняется после импорта plllasma.sql

-- Ждем создания основных таблиц (максимум 30 секунд)
SET @counter = 0;
SET @max_attempts = 30;

CREATE PROCEDURE WaitForTables()
BEGIN
    WHILE @counter < @max_attempts DO
        SET @counter = @counter + 1;
        
        -- Проверяем существование основных таблиц
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'plllasma' 
            AND table_name IN ('tbl_users', 'tbl_access', 'lnk_user_ignor')
        ) THEN
            SELECT CONCAT('Tables ready after ', @counter, ' attempts') as status;
            LEAVE;
        END IF;
        
        -- Ждем 1 секунду
        SELECT SLEEP(1);
    END WHILE;
    
    IF @counter >= @max_attempts THEN
        SELECT 'Warning: Tables not ready after maximum attempts' as status;
    END IF;
END;

CALL WaitForTables();
DROP PROCEDURE WaitForTables;
