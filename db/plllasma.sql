-- Сид локальной разработки: ТОЛЬКО структура нужных проекту таблиц, без данных.
--
-- Снимок боевой схемы (28 таблиц) + применённые миграции из db/migrations/.
-- Таблицы соседних проектов, живущие в той же боевой базе (bara_comments,
-- comments, counters, ig_*, texts), намеренно НЕ включены.
--
-- Поэтому после `docker compose up` база пустая, но готова к работе: остаётся
-- завести юзера (см. docker/README.md). Данные боевого дампа заливаются поверх
-- скриптом docker/db-restore.ps1 (база при этом пересоздаётся).
--
-- Как обновить этот файл, если схема на проде поменялась — см. раздел
-- «Обновление снимка схемы» в docker/README.md.
--
-- Дальше — обычный вывод `mysqldump --no-data --skip-add-drop-table`.

-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: plllasma
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `lnk_cty_fce`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lnk_cty_fce` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `id_place` bigint NOT NULL DEFAULT '0',
  `id_face` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lnk_user_face`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lnk_user_face` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_face` bigint NOT NULL DEFAULT '0',
  `main` tinyint(1) NOT NULL DEFAULT '0',
  `can_talk` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lnk_user_ignore`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lnk_user_ignore` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL COMMENT 'Инициатор. mode=1: кто игнорит. mode=2: кто нажал «Исчезнуть» (только он может отменить)',
  `id_ignored_user` bigint NOT NULL COMMENT 'Кого игнорируют',
  `mode` tinyint NOT NULL COMMENT '1 = soft (направленный, не подсвечивать сообщения); 2 = vanish (взаимное исчезновение)',
  `date_created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pair` (`id_user`,`id_ignored_user`),
  KEY `idx_ignored` (`id_ignored_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lnk_user_place`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lnk_user_place` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_place` bigint NOT NULL DEFAULT '0',
  `at_menu` enum('f','t') NOT NULL DEFAULT 'f',
  `time_viewed` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `weight` smallint NOT NULL DEFAULT '100',
  `ignoring` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_place` (`id_user`,`id_place`),
  KEY `id_user` (`id_user`),
  KEY `id_place` (`id_place`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lnk_user_profile`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lnk_user_profile` (
  `id_user` bigint NOT NULL,
  `id_viewed_user` bigint NOT NULL,
  `time_visitted` datetime NOT NULL,
  UNIQUE KEY `id_user` (`id_user`,`id_viewed_user`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_access`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_access` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint DEFAULT NULL,
  `id_place` bigint DEFAULT NULL,
  `role` tinyint DEFAULT NULL,
  `addedbyscript` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_place` (`id_user`,`id_place`),
  KEY `id_user` (`id_user`),
  KEY `id_place` (`id_place`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_attachments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_attachments` (
  `id` varchar(36) NOT NULL COMMENT 'GUID аттачмента',
  `id_message` bigint NOT NULL COMMENT 'ID сообщения',
  `type` enum('file','image','video','youtube') NOT NULL COMMENT 'Тип аттачмента',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Дата создания',
  `filename` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'Оригинальное имя загруженного файла',
  `title` varchar(500) DEFAULT NULL COMMENT 'Название аттачмента (особенно для YouTube видео)',
  `icon` tinyint NOT NULL DEFAULT '0' COMMENT 'Версия иконки (0 - нет, >0 - есть с версией)',
  `preview` tinyint NOT NULL DEFAULT '0' COMMENT 'Версия превью (0 - нет, >0 - есть с версией)',
  `file` tinyint NOT NULL DEFAULT '0' COMMENT 'Версия файла (0 - нет, >0 - есть с версией)',
  `s3` tinyint NOT NULL DEFAULT '0' COMMENT 'Файл хранится в S3 (1) или локально (0)',
  `source` varchar(500) DEFAULT NULL COMMENT 'Исходный URL (для YouTube)',
  `status` enum('unavailable','pending','ready','rejected','processing_failed') NOT NULL DEFAULT 'pending' COMMENT 'Статус обработки',
  `views` int NOT NULL DEFAULT '0' COMMENT 'Количество просмотров',
  `downloads` int NOT NULL DEFAULT '0' COMMENT 'Количество скачиваний',
  `size` bigint DEFAULT NULL COMMENT 'Размер файла в байтах',
  `duration` int unsigned DEFAULT NULL COMMENT 'Длительность видео в миллисекундах',
  `processing_started` timestamp NULL DEFAULT NULL COMMENT 'Время начала обработки воркером',
  `s3_migration_started` datetime DEFAULT NULL COMMENT 'Время начала миграции в S3',
  PRIMARY KEY (`id`),
  KEY `idx_message` (`id_message`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created`),
  KEY `idx_views` (`views`),
  KEY `idx_downloads` (`downloads`),
  KEY `idx_processing` (`processing_started`),
  KEY `idx_size` (`size`),
  KEY `idx_s3_migration` (`s3_migration_started`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Новая система аттачментов к сообщениям';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_boards`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_boards` (
  `id_Board` bigint NOT NULL AUTO_INCREMENT,
  `brdMode` char(3) NOT NULL DEFAULT '',
  PRIMARY KEY (`id_Board`),
  UNIQUE KEY `id_Board` (`id_Board`),
  KEY `id_Board_2` (`id_Board`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_files`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_files` (
  `id_file` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_face` bigint NOT NULL DEFAULT '0',
  `id_storage` bigint NOT NULL DEFAULT '0',
  `id_place` bigint NOT NULL DEFAULT '0',
  `nick` text NOT NULL,
  `icon` tinyint(1) NOT NULL DEFAULT '0',
  `anonim` tinyint(1) NOT NULL DEFAULT '0',
  `file_type` tinyint NOT NULL DEFAULT '0',
  `description` mediumtext NOT NULL,
  `time_created` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `time_updated` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `has_icon` tinyint(1) NOT NULL DEFAULT '0',
  `original_name` text NOT NULL,
  `size` bigint NOT NULL DEFAULT '0',
  `extension` text NOT NULL,
  `dontdel` tinyint(1) NOT NULL DEFAULT '0',
  `attachment_id` bigint NOT NULL DEFAULT '0',
  `transferred_as_attachment` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_file`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_focus`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_focus` (
  `id_focus` bigint NOT NULL AUTO_INCREMENT,
  `ghost` tinyint NOT NULL DEFAULT '0',
  `id_user` int NOT NULL,
  `nick` tinytext NOT NULL,
  `icon` int DEFAULT NULL,
  `id_place` int NOT NULL,
  `id_message` bigint NOT NULL,
  `id_attachment` tinyint NOT NULL,
  `l` int NOT NULL,
  `r` int NOT NULL,
  `t` int NOT NULL,
  `b` int NOT NULL,
  `sps` int NOT NULL,
  `nep` int NOT NULL,
  `he` int NOT NULL,
  `ogo` int NOT NULL,
  PRIMARY KEY (`id_focus`),
  KEY `place-message-attachment` (`id_place`,`id_message`,`id_attachment`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_galleries`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_galleries` (
  `id_gallery` bigint NOT NULL AUTO_INCREMENT,
  `id_place` bigint NOT NULL DEFAULT '0',
  `dontdel` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_gallery`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_kpp`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_kpp` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_kpp_officer` bigint DEFAULT NULL,
  `id_poll` int DEFAULT NULL,
  `typ` enum('dopros','poll','allowed','admins') DEFAULT 'dopros',
  `question` longtext,
  `ansver` longtext,
  `chlenstvo` enum('glavniy','glavniy_stariy') DEFAULT NULL,
  `created` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_log`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` text NOT NULL,
  `time_created` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `user_name` varchar(30) NOT NULL DEFAULT '',
  `ip` varchar(19) NOT NULL DEFAULT '',
  `id_user` int NOT NULL DEFAULT '0',
  `action_id` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `tim` (`time_created`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_mail`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_mail` (
  `id_mail` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL DEFAULT '0',
  `author` bigint DEFAULT NULL,
  `conversation_with` bigint NOT NULL DEFAULT '0',
  `subject` text,
  `message` mediumtext,
  `time_created` datetime DEFAULT NULL,
  `unread` enum('f','t') NOT NULL DEFAULT 't',
  PRIMARY KEY (`id_mail`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_messages`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_messages` (
  `id_message` bigint NOT NULL AUTO_INCREMENT,
  `id_face` bigint NOT NULL DEFAULT '0',
  `id_user` bigint DEFAULT NULL,
  `anonim` tinyint(1) NOT NULL DEFAULT '0',
  `id_place` bigint DEFAULT NULL,
  `place_type` tinyint NOT NULL DEFAULT '0',
  `id_recipient_face` bigint DEFAULT NULL,
  `icon` tinyint(1) NOT NULL DEFAULT '0',
  `nick` text,
  `subject` text,
  `message` mediumtext,
  `json` json DEFAULT NULL,
  `time_created` datetime DEFAULT NULL,
  `mail_anchor` bigint DEFAULT NULL,
  `reply_to_message_id` bigint NOT NULL DEFAULT '0',
  `children` int NOT NULL DEFAULT '0',
  `id_first_parent` bigint NOT NULL DEFAULT '0',
  `id_parent` bigint NOT NULL DEFAULT '0',
  `id_recipient` int NOT NULL DEFAULT '0',
  `id_mail_recipient` int DEFAULT NULL,
  `attachment_id` bigint NOT NULL DEFAULT '0',
  `attachments` tinyint NOT NULL DEFAULT '0',
  `emote_sps` int NOT NULL DEFAULT '0',
  `emote_osj` int NOT NULL DEFAULT '0',
  `emote_byn` int NOT NULL DEFAULT '0',
  `emote_wut` int NOT NULL DEFAULT '0',
  `emote_heh` int NOT NULL DEFAULT '0',
  `emote_ogo` int NOT NULL DEFAULT '0',
  `pereezd_na_glavniy` tinyint NOT NULL DEFAULT '0',
  `muted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_message`),
  KEY `id_recipient_face` (`id_recipient_face`),
  KEY `id_user` (`id_user`),
  KEY `id_face` (`id_face`),
  KEY `time_created` (`time_created`),
  KEY `idx_place_time` (`id_place`,`time_created`),
  KEY `idx_place_parent` (`id_place`,`id_parent`),
  KEY `idx_first_parent` (`id_first_parent`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_place_sections`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_place_sections` (
  `id_section` tinyint NOT NULL AUTO_INCREMENT,
  `title` varchar(128) NOT NULL,
  `description` text NOT NULL,
  PRIMARY KEY (`id_section`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_places`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_places` (
  `id_place` bigint NOT NULL AUTO_INCREMENT,
  `parent` bigint NOT NULL DEFAULT '0',
  `id_section` tinyint NOT NULL DEFAULT '0',
  `name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `matrix` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `disclaimer` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `time_changed` datetime DEFAULT NULL,
  `id_user` int NOT NULL,
  `anonim` tinyint NOT NULL DEFAULT '1',
  `privacy_mode` enum('open','private') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'open' COMMENT 'open — авто-доступ при регистрации; private — нет',
  `path` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `typ` enum('board','album','page','site') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'board',
  `script` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `first_parent` bigint DEFAULT NULL,
  `weight` smallint DEFAULT '100',
  `at_menu` enum('t','f') DEFAULT 'f',
  `dont_clean` tinyint(1) NOT NULL DEFAULT '0',
  `stat_subscribers` int NOT NULL DEFAULT '0',
  `stat_visitors_day` int NOT NULL DEFAULT '0',
  `stat_visitors_week` int NOT NULL DEFAULT '0',
  `stat_visitors_month` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_place`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_poll_ansvers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_poll_ansvers` (
  `id_user` bigint DEFAULT NULL,
  `id_poll` bigint DEFAULT NULL,
  `variants` mediumtext,
  `message` longtext
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_poll_variants`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_poll_variants` (
  `id_variant` int NOT NULL AUTO_INCREMENT,
  `id_poll` int DEFAULT NULL,
  `ansver` mediumtext,
  PRIMARY KEY (`id_variant`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_polls`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_polls` (
  `id_poll` int NOT NULL AUTO_INCREMENT,
  `question` longtext,
  `typ` enum('multi','single','text') DEFAULT 'multi',
  `on_variants` mediumtext,
  `weight` int DEFAULT '0',
  PRIMARY KEY (`id_poll`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_steps`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_steps` (
  `id_step` int NOT NULL AUTO_INCREMENT,
  `id_place` int NOT NULL DEFAULT '0',
  `cmd` char(1) NOT NULL DEFAULT '',
  `role` char(1) NOT NULL DEFAULT '',
  `ordr` int NOT NULL DEFAULT '0',
  `description` text NOT NULL,
  `users` text NOT NULL,
  `usernames` mediumtext NOT NULL,
  PRIMARY KEY (`id_step`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_storages`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_storages` (
  `id_storage` bigint NOT NULL AUTO_INCREMENT,
  `url` text NOT NULL,
  `description` text NOT NULL,
  PRIMARY KEY (`id_storage`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_test`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_test` (
  `id` int NOT NULL AUTO_INCREMENT,
  `number` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_unread`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_unread` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_message` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `id_user` (`id_user`,`id_message`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_users`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_users` (
  `id_user` int NOT NULL AUTO_INCREMENT,
  `login` varchar(80) DEFAULT NULL,
  `password` varchar(80) DEFAULT NULL,
  `nick` varchar(32) DEFAULT NULL,
  `logkey` varchar(100) DEFAULT NULL,
  `logmode` tinyint NOT NULL DEFAULT '1',
  `sex` tinyint(1) NOT NULL DEFAULT '0',
  `email` text NOT NULL,
  `time_joined` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `time_logged` datetime DEFAULT NULL,
  `icon_old` text,
  `usrStatus` varchar(10) NOT NULL DEFAULT '',
  `birthday` varchar(12) NOT NULL DEFAULT '',
  `country` text NOT NULL,
  `city` varchar(120) NOT NULL DEFAULT '',
  `icq` varchar(30) NOT NULL DEFAULT '',
  `homepage` varchar(120) NOT NULL DEFAULT '',
  `businesstype` tinyint NOT NULL DEFAULT '0',
  `businesstext` text NOT NULL,
  `realname` text NOT NULL,
  `firstnick` text NOT NULL,
  `inbox_email` tinyint(1) NOT NULL DEFAULT '1',
  `icon` tinyint NOT NULL DEFAULT '0',
  `id_face` int DEFAULT NULL,
  `description` mediumtext,
  `msgcount` bigint DEFAULT '0',
  `time_lastmessage` datetime DEFAULT NULL,
  `profile` mediumtext NOT NULL,
  `profile_visits` bigint NOT NULL,
  `profile_changed` datetime NOT NULL,
  `dimidroland` tinyint(1) NOT NULL DEFAULT '0',
  `molchanka_until` datetime DEFAULT NULL,
  `sps` int NOT NULL DEFAULT '0',
  `unread_unsubscribed_channels` int DEFAULT NULL,
  PRIMARY KEY (`id_user`),
  KEY `idx_logkey` (`logkey`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_viewed`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_viewed` (
  `id_view` bigint NOT NULL AUTO_INCREMENT,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_place` bigint NOT NULL DEFAULT '0',
  `time_viewed` datetime DEFAULT NULL,
  PRIMARY KEY (`id_view`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_viewed_sub`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_viewed_sub` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `id_place` int DEFAULT NULL,
  `id_user` bigint DEFAULT NULL,
  `id_sub` bigint DEFAULT NULL,
  `viewed` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbl_youtubize`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_youtubize` (
  `id_message` int NOT NULL,
  `status` enum('pending','processing','completed','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `attempts` tinyint NOT NULL DEFAULT '0',
  `time_added` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `time_processed` datetime DEFAULT NULL,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id_message`),
  KEY `idx_status` (`status`),
  KEY `idx_time_added` (`time_added`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-05 18:23:41
