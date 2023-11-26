-- phpMyAdmin SQL Dump
-- version 4.9.5deb2
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Nov 26, 2023 at 11:51 AM
-- Server version: 8.0.28-0ubuntu0.20.04.3
-- PHP Version: 7.4.3

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `plllasma`
--

-- --------------------------------------------------------

--
-- Table structure for table `lnk_cty_fce`
--

CREATE TABLE `lnk_cty_fce` (
  `id` bigint NOT NULL,
  `id_place` bigint NOT NULL DEFAULT '0',
  `id_face` bigint NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `lnk_user_face`
--

CREATE TABLE `lnk_user_face` (
  `id` bigint NOT NULL,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_face` bigint NOT NULL DEFAULT '0',
  `main` tinyint(1) NOT NULL DEFAULT '0',
  `can_talk` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `lnk_user_ignor`
--

CREATE TABLE `lnk_user_ignor` (
  `id` int NOT NULL,
  `id_user` int NOT NULL,
  `id_ignored_user` int NOT NULL,
  `date_created` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `lnk_user_place`
--

CREATE TABLE `lnk_user_place` (
  `id` bigint NOT NULL,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_place` bigint NOT NULL DEFAULT '0',
  `at_menu` enum('f','t') NOT NULL DEFAULT 'f',
  `time_viewed` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `weight` smallint NOT NULL DEFAULT '100',
  `ignoring` tinyint NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `lnk_user_profile`
--

CREATE TABLE `lnk_user_profile` (
  `id_user` bigint NOT NULL,
  `id_viewed_user` bigint NOT NULL,
  `time_visitted` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_access`
--

CREATE TABLE `tbl_access` (
  `id` bigint NOT NULL,
  `id_user` bigint DEFAULT NULL,
  `id_place` bigint DEFAULT NULL,
  `role` tinyint DEFAULT NULL,
  `addedbyscript` tinyint DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_boards`
--

CREATE TABLE `tbl_boards` (
  `id_Board` bigint NOT NULL,
  `brdMode` char(3) NOT NULL DEFAULT ''
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_files`
--

CREATE TABLE `tbl_files` (
  `id_file` bigint NOT NULL,
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
  `transferred_as_attachment` tinyint NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_focus`
--

CREATE TABLE `tbl_focus` (
  `id_focus` bigint NOT NULL,
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
  `ogo` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_galleries`
--

CREATE TABLE `tbl_galleries` (
  `id_gallery` bigint NOT NULL,
  `id_place` bigint NOT NULL DEFAULT '0',
  `dontdel` tinyint NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_kpp`
--

CREATE TABLE `tbl_kpp` (
  `id` bigint NOT NULL,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_kpp_officer` bigint DEFAULT NULL,
  `id_poll` int DEFAULT NULL,
  `typ` enum('dopros','poll','allowed','admins') DEFAULT 'dopros',
  `question` longtext,
  `ansver` longtext,
  `chlenstvo` enum('glavniy','glavniy_stariy') DEFAULT NULL,
  `created` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_log`
--

CREATE TABLE `tbl_log` (
  `id` bigint NOT NULL,
  `action` text NOT NULL,
  `time_created` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `user_name` varchar(30) NOT NULL DEFAULT '',
  `ip` varchar(19) NOT NULL DEFAULT '',
  `id_user` int NOT NULL DEFAULT '0',
  `action_id` tinyint DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_mail`
--

CREATE TABLE `tbl_mail` (
  `id_mail` bigint NOT NULL,
  `id_user` bigint NOT NULL DEFAULT '0',
  `author` bigint DEFAULT NULL,
  `conversation_with` bigint NOT NULL DEFAULT '0',
  `subject` text,
  `message` mediumtext,
  `time_created` datetime DEFAULT NULL,
  `unread` enum('f','t') NOT NULL DEFAULT 't'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_messages`
--

CREATE TABLE `tbl_messages` (
  `id_message` bigint NOT NULL,
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
  `muted` tinyint NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_places`
--

CREATE TABLE `tbl_places` (
  `id_place` bigint NOT NULL,
  `parent` bigint NOT NULL DEFAULT '0',
  `id_section` tinyint NOT NULL DEFAULT '0',
  `name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `matrix` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `disclaimer` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `time_changed` datetime DEFAULT NULL,
  `id_user` int NOT NULL,
  `anonim` tinyint NOT NULL DEFAULT '1',
  `path` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `typ` enum('board','album','page','site') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'board',
  `script` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `first_parent` bigint DEFAULT NULL,
  `weight` smallint DEFAULT '100',
  `at_menu` enum('t','f') DEFAULT 'f',
  `dont_clean` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_place_sections`
--

CREATE TABLE `tbl_place_sections` (
  `id_section` tinyint NOT NULL,
  `title` varchar(128) NOT NULL,
  `description` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_polls`
--

CREATE TABLE `tbl_polls` (
  `id_poll` int NOT NULL,
  `question` longtext,
  `typ` enum('multi','single','text') DEFAULT 'multi',
  `on_variants` mediumtext,
  `weight` int DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_poll_ansvers`
--

CREATE TABLE `tbl_poll_ansvers` (
  `id_user` bigint DEFAULT NULL,
  `id_poll` bigint DEFAULT NULL,
  `variants` mediumtext,
  `message` longtext
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_poll_variants`
--

CREATE TABLE `tbl_poll_variants` (
  `id_variant` int NOT NULL,
  `id_poll` int DEFAULT NULL,
  `ansver` mediumtext
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_steps`
--

CREATE TABLE `tbl_steps` (
  `id_step` int NOT NULL,
  `id_place` int NOT NULL DEFAULT '0',
  `cmd` char(1) NOT NULL DEFAULT '',
  `role` char(1) NOT NULL DEFAULT '',
  `ordr` int NOT NULL DEFAULT '0',
  `description` text NOT NULL,
  `users` text NOT NULL,
  `usernames` mediumtext NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_storages`
--

CREATE TABLE `tbl_storages` (
  `id_storage` bigint NOT NULL,
  `url` text NOT NULL,
  `description` text NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_test`
--

CREATE TABLE `tbl_test` (
  `id` int NOT NULL,
  `number` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_unread`
--

CREATE TABLE `tbl_unread` (
  `id` bigint NOT NULL,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_message` bigint NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_users`
--

CREATE TABLE `tbl_users` (
  `id_user` int NOT NULL,
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
  `unread_unsubscribed_channels` int DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_viewed`
--

CREATE TABLE `tbl_viewed` (
  `id_view` bigint NOT NULL,
  `id_user` bigint NOT NULL DEFAULT '0',
  `id_place` bigint NOT NULL DEFAULT '0',
  `time_viewed` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_viewed_sub`
--

CREATE TABLE `tbl_viewed_sub` (
  `id` bigint NOT NULL,
  `id_place` int DEFAULT NULL,
  `id_user` bigint DEFAULT NULL,
  `id_sub` bigint DEFAULT NULL,
  `viewed` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `lnk_cty_fce`
--
ALTER TABLE `lnk_cty_fce`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `lnk_user_face`
--
ALTER TABLE `lnk_user_face`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `lnk_user_ignor`
--
ALTER TABLE `lnk_user_ignor`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `id_user` (`id_user`,`id_ignored_user`),
  ADD KEY `id_user_2` (`id_user`) USING BTREE;

--
-- Indexes for table `lnk_user_place`
--
ALTER TABLE `lnk_user_place`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_place` (`id_user`,`id_place`),
  ADD KEY `id_user` (`id_user`),
  ADD KEY `id_place` (`id_place`);

--
-- Indexes for table `lnk_user_profile`
--
ALTER TABLE `lnk_user_profile`
  ADD UNIQUE KEY `id_user` (`id_user`,`id_viewed_user`);

--
-- Indexes for table `tbl_access`
--
ALTER TABLE `tbl_access`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_place` (`id_user`,`id_place`),
  ADD KEY `id_user` (`id_user`),
  ADD KEY `id_place` (`id_place`);

--
-- Indexes for table `tbl_boards`
--
ALTER TABLE `tbl_boards`
  ADD PRIMARY KEY (`id_Board`),
  ADD UNIQUE KEY `id_Board` (`id_Board`),
  ADD KEY `id_Board_2` (`id_Board`);

--
-- Indexes for table `tbl_files`
--
ALTER TABLE `tbl_files`
  ADD PRIMARY KEY (`id_file`);

--
-- Indexes for table `tbl_focus`
--
ALTER TABLE `tbl_focus`
  ADD PRIMARY KEY (`id_focus`),
  ADD KEY `place-message-attachment` (`id_place`,`id_message`,`id_attachment`);

--
-- Indexes for table `tbl_galleries`
--
ALTER TABLE `tbl_galleries`
  ADD PRIMARY KEY (`id_gallery`);

--
-- Indexes for table `tbl_kpp`
--
ALTER TABLE `tbl_kpp`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_log`
--
ALTER TABLE `tbl_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `tim` (`time_created`);

--
-- Indexes for table `tbl_mail`
--
ALTER TABLE `tbl_mail`
  ADD PRIMARY KEY (`id_mail`);

--
-- Indexes for table `tbl_messages`
--
ALTER TABLE `tbl_messages`
  ADD PRIMARY KEY (`id_message`),
  ADD KEY `id_recipient_face` (`id_recipient_face`),
  ADD KEY `id_user` (`id_user`),
  ADD KEY `id_face` (`id_face`),
  ADD KEY `time_created` (`time_created`);

--
-- Indexes for table `tbl_places`
--
ALTER TABLE `tbl_places`
  ADD PRIMARY KEY (`id_place`);

--
-- Indexes for table `tbl_place_sections`
--
ALTER TABLE `tbl_place_sections`
  ADD PRIMARY KEY (`id_section`);

--
-- Indexes for table `tbl_polls`
--
ALTER TABLE `tbl_polls`
  ADD PRIMARY KEY (`id_poll`);

--
-- Indexes for table `tbl_poll_variants`
--
ALTER TABLE `tbl_poll_variants`
  ADD PRIMARY KEY (`id_variant`);

--
-- Indexes for table `tbl_steps`
--
ALTER TABLE `tbl_steps`
  ADD PRIMARY KEY (`id_step`);

--
-- Indexes for table `tbl_storages`
--
ALTER TABLE `tbl_storages`
  ADD PRIMARY KEY (`id_storage`);

--
-- Indexes for table `tbl_test`
--
ALTER TABLE `tbl_test`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_unread`
--
ALTER TABLE `tbl_unread`
  ADD PRIMARY KEY (`id`),
  ADD KEY `id_user` (`id_user`,`id_message`);

--
-- Indexes for table `tbl_users`
--
ALTER TABLE `tbl_users`
  ADD PRIMARY KEY (`id_user`);

--
-- Indexes for table `tbl_viewed`
--
ALTER TABLE `tbl_viewed`
  ADD PRIMARY KEY (`id_view`);

--
-- Indexes for table `tbl_viewed_sub`
--
ALTER TABLE `tbl_viewed_sub`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `lnk_cty_fce`
--
ALTER TABLE `lnk_cty_fce`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lnk_user_face`
--
ALTER TABLE `lnk_user_face`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lnk_user_ignor`
--
ALTER TABLE `lnk_user_ignor`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lnk_user_place`
--
ALTER TABLE `lnk_user_place`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_access`
--
ALTER TABLE `tbl_access`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_boards`
--
ALTER TABLE `tbl_boards`
  MODIFY `id_Board` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_files`
--
ALTER TABLE `tbl_files`
  MODIFY `id_file` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_focus`
--
ALTER TABLE `tbl_focus`
  MODIFY `id_focus` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_galleries`
--
ALTER TABLE `tbl_galleries`
  MODIFY `id_gallery` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_kpp`
--
ALTER TABLE `tbl_kpp`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_log`
--
ALTER TABLE `tbl_log`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_mail`
--
ALTER TABLE `tbl_mail`
  MODIFY `id_mail` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_messages`
--
ALTER TABLE `tbl_messages`
  MODIFY `id_message` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_places`
--
ALTER TABLE `tbl_places`
  MODIFY `id_place` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_place_sections`
--
ALTER TABLE `tbl_place_sections`
  MODIFY `id_section` tinyint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_polls`
--
ALTER TABLE `tbl_polls`
  MODIFY `id_poll` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_poll_variants`
--
ALTER TABLE `tbl_poll_variants`
  MODIFY `id_variant` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_steps`
--
ALTER TABLE `tbl_steps`
  MODIFY `id_step` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_storages`
--
ALTER TABLE `tbl_storages`
  MODIFY `id_storage` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_test`
--
ALTER TABLE `tbl_test`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_unread`
--
ALTER TABLE `tbl_unread`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_users`
--
ALTER TABLE `tbl_users`
  MODIFY `id_user` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_viewed`
--
ALTER TABLE `tbl_viewed`
  MODIFY `id_view` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_viewed_sub`
--
ALTER TABLE `tbl_viewed_sub`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
