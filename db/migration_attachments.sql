-- Миграция для добавления новой системы аттачментов
-- Добавляем JSON столбец в таблицу сообщений
ALTER TABLE `tbl_messages` ADD COLUMN `json` JSON NULL AFTER `message`;

-- Создаем таблицу для новых аттачментов
CREATE TABLE `tbl_attachments` (
  `id` varchar(36) NOT NULL COMMENT 'GUID аттачмента',
  `id_message` bigint NOT NULL COMMENT 'ID сообщения',
  `type` enum('file','image','video','youtube') NOT NULL COMMENT 'Тип аттачмента',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Дата создания',
  `icon` varchar(255) DEFAULT NULL COMMENT 'Путь к иконке',
  `preview` varchar(255) DEFAULT NULL COMMENT 'Путь к превью',
  `file` varchar(255) DEFAULT NULL COMMENT 'Путь к файлу',
  `source` varchar(500) DEFAULT NULL COMMENT 'Исходный URL (для YouTube)',
  `status` enum('unavailable','pending','ready') NOT NULL DEFAULT 'pending' COMMENT 'Статус обработки',
  PRIMARY KEY (`id`),
  KEY `idx_message` (`id_message`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Новая система аттачментов к сообщениям';
