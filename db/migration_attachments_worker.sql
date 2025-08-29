-- Миграция для воркера аттачментов
-- Добавляем новый статус 'rejected' в таблицу аттачментов

ALTER TABLE `tbl_attachments` 
MODIFY COLUMN `status` enum('unavailable','pending','ready','rejected') NOT NULL DEFAULT 'pending' COMMENT 'Статус обработки';

-- Изменяем типы полей preview и icon на boolean
ALTER TABLE `tbl_attachments` 
MODIFY COLUMN `preview` TINYINT(1) DEFAULT FALSE COMMENT 'Флаг наличия превью (TRUE - есть, FALSE - нет)',
MODIFY COLUMN `icon` TINYINT(1) DEFAULT FALSE COMMENT 'Флаг наличия иконки (TRUE - есть, FALSE - нет)';

