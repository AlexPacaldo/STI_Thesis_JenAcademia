-- MySQL dump 10.13  Distrib 8.0.31, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: jen_academia
-- ------------------------------------------------------
-- Server version	8.0.31

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `assignment_submissions`
--

DROP TABLE IF EXISTS `assignment_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignment_submissions` (
  `submission_id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `student_id` int NOT NULL,
  `submission_text` text,
  `file_url` varchar(1000) DEFAULT NULL,
  `attempt_count` int NOT NULL DEFAULT '1',
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `grade` int DEFAULT NULL,
  `feedback` text,
  `graded_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`submission_id`),
  UNIQUE KEY `unique_assignment_student` (`assignment_id`,`student_id`),
  KEY `student_id` (`student_id`),
  KEY `idx_assignment_id` (`assignment_id`),
  KEY `idx_submitted_at` (`submitted_at`),
  KEY `idx_submissions_assignment_submitted` (`assignment_id`,`submitted_at`,`submission_id`),
  CONSTRAINT `assignment_submissions_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`assignment_id`),
  CONSTRAINT `assignment_submissions_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignment_submissions`
--

LOCK TABLES `assignment_submissions` WRITE;
/*!40000 ALTER TABLE `assignment_submissions` DISABLE KEYS */;
INSERT INTO `assignment_submissions` VALUES (12,16,69,'enc:v1:0NGdCFBdLZmIehOK:18przHXl5hOsc6M8bvalxw==:yVCgxvWTQzPOhCY=',NULL,1,'2026-05-28 07:44:57',NULL,NULL,NULL);
/*!40000 ALTER TABLE `assignment_submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assignments`
--

DROP TABLE IF EXISTS `assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignments` (
  `assignment_id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` int NOT NULL,
  `student_id` int NOT NULL,
  `course_id` int DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `instructions` text,
  `due_date` date DEFAULT NULL,
  `due_time` time DEFAULT NULL,
  `attempt_limit` int DEFAULT NULL,
  `status` enum('pending','submitted','graded','overdue') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  KEY `course_id` (`course_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_due_date` (`due_date`),
  KEY `idx_status` (`status`),
  KEY `idx_assignments_teacher_created` (`teacher_id`,`created_at`,`assignment_id`),
  KEY `idx_assignments_student_due` (`student_id`,`due_date`,`due_time`,`created_at`),
  CONSTRAINT `assignments_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `assignments_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `assignments_ibfk_3` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignments`
--

LOCK TABLES `assignments` WRITE;
/*!40000 ALTER TABLE `assignments` DISABLE KEYS */;
INSERT INTO `assignments` VALUES (16,67,69,8,'Task for Alex Pacaldo','enc:v1:TAuvK8m+KZ0H0LtB:VBzgPm7SAP3HaIdyHd2jig==:vuLQW8G/hTCo2xDgftlX/TU=',NULL,NULL,NULL,'submitted','2026-05-28 07:44:10','2026-05-28 07:44:57');
/*!40000 ALTER TABLE `assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `books`
--

DROP TABLE IF EXISTS `books`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `books` (
  `book_id` int NOT NULL AUTO_INCREMENT,
  `course_id` int NOT NULL,
  `teacher_id` int DEFAULT NULL,
  `cover_url` varchar(1000) DEFAULT NULL,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  `archived_at` timestamp NULL DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `author` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`book_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_books_status` (`status`),
  KEY `idx_books_status_teacher_course_created` (`status`,`teacher_id`,`course_id`,`created_at`),
  CONSTRAINT `books_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `books`
--

LOCK TABLES `books` WRITE;
/*!40000 ALTER TABLE `books` DISABLE KEYS */;
/*!40000 ALTER TABLE `books` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_remarks`
--

DROP TABLE IF EXISTS `class_remarks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_remarks` (
  `remark_id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `teacher_id` int NOT NULL,
  `student_id` int NOT NULL,
  `remarks` text NOT NULL,
  `rating` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`remark_id`),
  UNIQUE KEY `unique_class_remark` (`class_id`,`teacher_id`),
  KEY `teacher_id` (`teacher_id`),
  KEY `idx_class_id` (`class_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_remarks_student_created` (`student_id`,`created_at`),
  CONSTRAINT `class_remarks_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`class_id`),
  CONSTRAINT `class_remarks_ibfk_2` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `class_remarks_ibfk_3` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `class_remarks_chk_1` CHECK (((`rating` >= 1) and (`rating` <= 5)))
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_remarks`
--

LOCK TABLES `class_remarks` WRITE;
/*!40000 ALTER TABLE `class_remarks` DISABLE KEYS */;
INSERT INTO `class_remarks` VALUES (10,3,67,69,'enc:v1:+ZtMonOkzKE4Aq89:yJRaXLVTtyk3cJPh+JsxWQ==:qfbqE9k33T7x5bcf56CI3sP+',NULL,'2026-05-28 03:43:27','2026-05-28 07:28:02');
/*!40000 ALTER TABLE `class_remarks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `classes`
--

DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classes` (
  `class_id` int NOT NULL AUTO_INCREMENT,
  `class_name` varchar(255) NOT NULL,
  `teacher_id` int NOT NULL,
  `student_id` int NOT NULL,
  `scheduled_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `duration` varchar(50) DEFAULT NULL,
  `class_link` text,
  `status` enum('scheduled','completed','cancelled','no-show') DEFAULT 'scheduled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`class_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_scheduled_date` (`scheduled_date`),
  KEY `idx_status` (`status`),
  KEY `idx_classes_teacher_day_status_time` (`teacher_id`,`scheduled_date`,`status`,`start_time`),
  KEY `idx_classes_student_day_status_time` (`student_id`,`scheduled_date`,`status`,`start_time`),
  KEY `idx_classes_student_status_created` (`student_id`,`status`,`created_at`),
  CONSTRAINT `classes_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `classes_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classes`
--

LOCK TABLES `classes` WRITE;
/*!40000 ALTER TABLE `classes` DISABLE KEYS */;
INSERT INTO `classes` VALUES (1,'Conversational English',67,69,'2026-05-28','11:50:00','12:40:00','50','enc:v1:TO1Q2Fe2aFqmAE7Z:kepmAdc45HgmP2Az+ia+mw==:TGi3etNw40V8SpwIf5cLmDTBn6B+igo0gamteo1rq6HHYY5LFXAZ1F0bmV/jkMHAtiPAlXX1mdaIQVkVxZHHuRBUxu7ldXuUs/lSw/dAz1c+E0s+zP/z51o=','completed','2026-05-28 03:30:59','2026-05-28 03:31:34'),(2,'Conversational English',67,69,'2026-05-28','11:50:00','12:40:00','50','enc:v1:avUezO3ci7nVozhb:8VB+OUGw7/opLnBl69U/pQ==:6o9PMzCTZi8kulXVDbh41lacNEu9NF1b9ZMARwQoFKTvEQxRfel1RFHZ1mi82+/IOSBpXVtzvw+pS72ufIDhx0qLw8IUYE7gcCNYubDK6aAQRBYL7Muf+ck=','completed','2026-05-28 03:32:58','2026-05-28 03:33:33'),(3,'Conversational English',67,69,'2026-05-28','12:15:00','13:05:00','50','enc:v1:/ZJToVozAFzUoW7n:SyKOZAiOFB4mdjh9MMNMrw==:jBvUexXgI3iN1IHPe5HZcLB9oXK5+gvxzfvrYdBKUxENje9x4B9SXHWOUo0QkpHXCX4uClOezXIqLDpLVTH0cu17bF3RHBg0LFCGYZenq7xPLdDPcR68Fsk=','no-show','2026-05-28 03:35:08','2026-05-28 07:00:41'),(4,'Conversational English',67,69,'2026-05-28','18:55:00','19:45:00','50','enc:v1:/JVovr1lcUjGWivL:W/+WCkg0qny0TiCv+9KwJQ==:moSkM1REb8QmJE97ljk0vE6i9JmmENDoMZCRfx+ML/w74lM+uloGufYGVtDziD1cV7gju+SOTW59Rjd0968OQKKPsHkrPIaAfs2hldyr7RQu3q6oTXm9Akg=','no-show','2026-05-28 10:49:19','2026-05-28 11:45:00'),(5,'Conversational English',67,69,'2026-05-29','07:00:00','07:50:00','50','enc:v1:CjTfgZ4/9vlkF7kj:WBTie+jCOMDihp6+zYDRPw==:0Lg1geNyFKOF9U2YNVi3zayAaZC2gdGq9x2BZCssqqanjpI5Q2JjhblHLwgjkk0NIA+uQkowJVSI7zoblEeSdlmbifh2KFeHnjQ457jCpW3ssih0TkrAtbI=','scheduled','2026-05-28 10:57:37','2026-05-28 10:57:37');
/*!40000 ALTER TABLE `classes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_attendance_logs`
--

DROP TABLE IF EXISTS `class_attendance_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_attendance_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `teacher_id` int NOT NULL,
  `student_id` int NOT NULL,
  `teacher_started_at` timestamp NULL DEFAULT NULL,
  `student_joined_at` timestamp NULL DEFAULT NULL,
  `teacher_ended_at` timestamp NULL DEFAULT NULL,
  `duration_minutes` int NOT NULL DEFAULT '0',
  `proof_url` varchar(1000) DEFAULT NULL,
  `summary` text,
  `verification_status` enum('pending','in_progress','student_confirmed','verified','needs_review','incomplete') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  UNIQUE KEY `unique_class_attendance_log` (`class_id`),
  KEY `idx_class_attendance_class` (`class_id`),
  KEY `idx_class_attendance_teacher` (`teacher_id`),
  KEY `idx_class_attendance_student` (`student_id`),
  KEY `idx_class_attendance_status` (`verification_status`,`created_at`),
  CONSTRAINT `class_attendance_class_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`class_id`) ON DELETE CASCADE,
  CONSTRAINT `class_attendance_teacher_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `class_attendance_student_fk` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `course_id` int NOT NULL AUTO_INCREMENT,
  `course_name` varchar(255) NOT NULL,
  `description` text,
  `duration` int DEFAULT NULL COMMENT 'Duration in hours',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`course_id`),
  UNIQUE KEY `course_name` (`course_name`),
  KEY `idx_course_name` (`course_name`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
INSERT INTO `courses` VALUES (1,'Business English',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(2,'Job Interview',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(3,'Online English',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(4,'News',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(5,'TOEIC',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(6,'IELTS',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(7,'OPIc',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(8,'Conversational English',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11'),(9,'Travel English',NULL,NULL,'2026-05-27 18:07:11','2026-05-27 18:07:11');
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dropbox_submissions`
--

DROP TABLE IF EXISTS `dropbox_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dropbox_submissions` (
  `dropbox_id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` int NOT NULL,
  `student_id` int NOT NULL,
  `submission_type` enum('assignment','book_content','note','other') DEFAULT 'assignment',
  `title` varchar(255) DEFAULT NULL,
  `content` text,
  `file_url` varchar(500) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_size` int DEFAULT NULL COMMENT 'Size in bytes',
  `notes` text,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dropbox_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_submission_type` (`submission_type`),
  CONSTRAINT `dropbox_submissions_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `dropbox_submissions_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dropbox_submissions`
--

LOCK TABLES `dropbox_submissions` WRITE;
/*!40000 ALTER TABLE `dropbox_submissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `dropbox_submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lesson_progress`
--

DROP TABLE IF EXISTS `lesson_progress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lesson_progress` (
  `progress_id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `lesson_id` int NOT NULL,
  `progress_percentage` int NOT NULL DEFAULT '0',
  `is_completed` tinyint(1) DEFAULT '0',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `time_spent_minutes` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`progress_id`),
  UNIQUE KEY `unique_student_lesson` (`student_id`,`lesson_id`),
  KEY `lesson_id` (`lesson_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_is_completed` (`is_completed`),
  KEY `idx_lesson_progress_student_updated` (`student_id`,`updated_at`),
  CONSTRAINT `lesson_progress_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `lesson_progress_ibfk_2` FOREIGN KEY (`lesson_id`) REFERENCES `lessons` (`lesson_id`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lesson_progress`
--

LOCK TABLES `lesson_progress` WRITE;
/*!40000 ALTER TABLE `lesson_progress` DISABLE KEYS */;
/*!40000 ALTER TABLE `lesson_progress` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lessons`
--

DROP TABLE IF EXISTS `lessons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lessons` (
  `lesson_id` int NOT NULL AUTO_INCREMENT,
  `book_id` int NOT NULL,
  `lesson_number` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` longtext,
  `file_path` varchar(500) DEFAULT NULL,
  `order_number` int DEFAULT NULL,
  `is_published` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lesson_id`),
  KEY `idx_book_id` (`book_id`),
  KEY `idx_is_published` (`is_published`),
  CONSTRAINT `lessons_ibfk_1` FOREIGN KEY (`book_id`) REFERENCES `books` (`book_id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lessons`
--

LOCK TABLES `lessons` WRITE;
/*!40000 ALTER TABLE `lessons` DISABLE KEYS */;
/*!40000 ALTER TABLE `lessons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `sender_id` int NOT NULL,
  `recipient_id` int NOT NULL,
  `subject` text,
  `content` text NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`message_id`),
  KEY `sender_id` (`sender_id`),
  KEY `idx_recipient_id` (`recipient_id`),
  KEY `idx_is_read` (`is_read`),
  KEY `idx_sent_at` (`sent_at`),
  KEY `idx_messages_recipient_read` (`recipient_id`,`is_read`),
  KEY `idx_messages_pair_sent` (`sender_id`,`recipient_id`,`sent_at`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
INSERT INTO `messages` VALUES (20,69,67,NULL,'enc:v1:UMezjB1uIMChtP/U:DqHDHqlzS9lrL0hRssWoMA==:YUM=',1,'2026-05-28 12:58:56','2026-05-28 12:59:15');
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` enum('reschedule','assignment','remark','announcement','class_reminder','general') DEFAULT 'general',
  `title` varchar(255) DEFAULT NULL,
  `message` text NOT NULL,
  `related_id` int DEFAULT NULL COMMENT 'ID of related entity',
  `related_type` varchar(50) DEFAULT NULL COMMENT 'Type of related entity',
  `is_read` tinyint(1) DEFAULT '0',
  `action_url` varchar(500) DEFAULT NULL COMMENT 'Optional URL',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_is_read` (`is_read`),
  KEY `idx_type` (`type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_notifications_user_read` (`user_id`,`is_read`),
  KEY `idx_notifications_user_created` (`user_id`,`created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=199 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (174,69,'announcement','enc:v1:wsz+DmFuMIrK6ing:L/jxjlW0jncHI+tCw5mR5A==:u5es1ZLM6rc2PtUUaOEAAfjzYBQUWYP2P+jGPA==','enc:v1:XatRm1Co/7jARjau:SMBHyM5ySbKkUafEHstUzg==:S0Ju9yIwK0gNrLcA1sZMeRxtCdbD/qv8zdRTVdBgGP2grlvVMA5uJLDzeTExDJlzhnyUY+bTJY03ZUrUeyGVrduNuj9w',71,'teacher_availability',1,'/Calendar','2026-05-27 18:53:15','2026-05-28 07:23:39'),(175,67,'general','enc:v1:8VNuE4xLqQMKUzj5:D7FKbevU5qLq0waoLoyw6w==:FXM9FzWU2HJJx1MaeOIDXA==','enc:v1:xRTvvjpdVT5C7Z3Q:q74xCJ/aTLOjJ+maGuJrdg==:sqHBMRjDuOvJZYfxi0QE6bjklaDQx2oRG9oHJxgHgaapyrFk9E0yqTNuPySLgPxq5Yul/Cs2tUPTyc2KcLyE8fwWaTBv',56,'class',1,NULL,'2026-05-27 18:53:37','2026-05-28 07:22:45'),(176,69,'announcement','enc:v1:ALV125ZLMQiESARa:Z15LS1xuylExbBhZvB7kQA==:rduCF3ri5cMk8sWEwwA8dT9Dt34MTrdFFgjmyg==','enc:v1:0hf9jFGZp8VdYzht:itJ4hqaOpwC19DVxoFju6Q==:Kpx03eJf9KldBLh4xbnkaxke7TKi22L4vW1eUryLG7G6BdkG5HtRp7WXYfPhr8LBP11GrNs7SssHgkD32OaUEYQTqVuVqg==',71,'teacher_availability',1,'/Calendar','2026-05-28 02:33:39','2026-05-28 07:23:39'),(177,67,'general','enc:v1:CVLT74z1nFNU++Qm:FUsC5daYlTjKzZCImCIQLA==:cTfm3VbthYWMdvYBQt3Zbg==','enc:v1:MDREj/MpHdHjqf1b:rwBHoRbk26ytCQIPFVn10w==:vrgDZjp/KWBh5dMX1C1fv9lU07WMsEnpBszSB3cEOlwJlGi6UtybOhH398K+mVF6ljTxHa4NdW/gGsifzvdfBP9zIc2c',57,'class',1,NULL,'2026-05-28 02:34:03','2026-05-28 07:22:45'),(178,67,'general','enc:v1:is6q5vVr+AcB/zHO:fkYns/qDgvtilFYVWXC1Bg==:8If8wuXsGJp+WFWsX1+4Jw==','enc:v1:pR9tBLMn/TldDhaP:ryXqiLeM2vCvz38rQu/GpQ==:kt7SCKniechYpOGoqMAtiDmfCx9vP9lg1Dd5jnh3VyvkNPGEHL21Wz33LatY460IIz6WKOWYRaqk0Rtr1ptWJGEUJDxC',58,'class',1,NULL,'2026-05-28 02:37:53','2026-05-28 07:22:45'),(179,1,'general','enc:v1:clV8CqZ++Ik42TtE:F+u88WgYiESQX4owvPVsxw==:9lggldjhRcER1PYc815gOOUbnGM=','enc:v1:1F1rx7D6dXaWCeyc:vzXp9kwzABC5NikzBCqYfQ==:enLS8D/cHmeXp4Qy8kSEQczU2WxDltB8QqZcYpONBM4Shtq0ejk63LH3U3QSS2ym+F43yhVCWuMbnIwUHSM86CBxSX+MZCiwF9SAgHZeDNZytglv7QbJNgUDoz7x/qzfefG8Qow=',16,'contract_request',1,'/AdminDashboard','2026-05-28 02:51:26','2026-05-28 07:16:21'),(180,69,'general','enc:v1:KY3FUznS5z/qSlfO:3FKOzyaiZ3AbkJfvi+RN/g==:jyn/CcyY7w4aLNe3dDIQlvrSgyiJBk9pNw==','enc:v1:rjri6Xigcvg+cWdk:vvqr9U4dIW2YBcvWdKp5Mg==:XSShLlr4gFaOhor+zv6KYIhPAslCSLGibAyOq5WIqRmCyypsExlHa5WSLgV6pmwy9W7qcZ/0vteTLtdm7DTzk6ADuw9OjtLZdIL5LH/wE5z8DdxQ319m/p+pg3X3Z4NScmQ=',16,'contract_request',1,'/Calendar','2026-05-28 02:51:35','2026-05-28 07:23:39'),(181,67,'general','enc:v1:whaP4Pms1TktYLfc:9NYMkc5tWZamP3UDoe1gdg==:TQJMagoy3UiPnciG5vO1qA==','enc:v1:MVx/77I9+QKeM8v9:UvWa0KIdUsFVpRszbyas0w==:/XaTHTDNIKRfa9amcDZeEOAcEk/g5BRhw6Eg6kS8YcvyFd2VBPj/qOotLryeA9IQSjJRB8OFzbSRXAAheKXqWXknEVyr',59,'class',1,NULL,'2026-05-28 02:52:13','2026-05-28 07:22:45'),(182,67,'general','enc:v1:DIDzjnseOmvvJNVA:IJWRfcxjGTF09sx6ZGSgzQ==:7fMxbVk+DAm+nPnA3X5qpA==','enc:v1:ndb7mT/QDe5aQtoO:JSW42jAfXCPfBdJxABXWPg==:4EgdavRlhRhQ9wRSvHbfzt35sFk1nlmFq2tZc/ZfJKcK63oJlsPReCxauE5uA/j5Rn+MoniuF6WnakDhMyMXcAg9Q5w9',60,'class',1,NULL,'2026-05-28 02:58:48','2026-05-28 07:22:45'),(184,69,'general','enc:v1:9qTdmJ34DKB2cJAw:WsO3rv/uWbVIvSPAoocOIg==:uuznBfIfQ72LqJb98zOMV7qNAbAhMeM68g==','enc:v1:xOGjK9hya+koyCDZ:extx6y2n1XChrQDu9YQ88g==:Whx+4nxIzdyqSfZSfgszNZp2vW34rA4PZ3Et1gW4Oov0/InJxSqZedeNMa0nt4vwxJ6F0GYEfAgXH0orVwA7naPWfDUUGct3b2nbxwM91mx5huQphbFWQXlK7VikI8OW9Gs=',17,'contract_request',1,'/Calendar','2026-05-28 03:25:42','2026-05-28 07:23:39'),(185,67,'general','enc:v1:iY5p4xbPSfb2AxVZ:zs8fMrDgzV8w7iUqSF8+1g==:iX/nBC5JDKTPdKFj4uikrw==','enc:v1:0YCSbFhzk/MrNG9v:GJzZYih3gJXijfjeXlCNlw==:ixobmbiM+Pp4xtkxuS/WgC6EPPnBNV/DEk08jSWB2ve6myfxEPDGSv+388B5ps5cYHmNnl1f5nsxmdifG4WfGIFVOPu9',1,'class',1,NULL,'2026-05-28 03:30:59','2026-05-28 07:22:45'),(186,67,'general','enc:v1:gGUP8Fiua+BYOBJc:/pwS+O8ZaptT8Sd2pSJ0dw==:8WgchrQarZs+gX5Rdqzr4g==','enc:v1:rboyFNtOiFKWBz0D:lJ6vQ2XcAJAoBf4Iybxs5w==:gXZhtyaKCHYJ0k1b1KkhADdgBWlXpHYNLFc/5PKWO5lwwXhEY4p6OGTMJfXZrD8Pgfbuc0u+tUvpsCfOxeRNUuZ0oxDP',2,'class',1,NULL,'2026-05-28 03:32:58','2026-05-28 07:22:45'),(188,69,'general','enc:v1:8td5IiZpVLzjqSyt:z9xJVYxu1F8j3/iKM4Vcnw==:1mrBtN+Dm/6AUxD4xy4LxV0XM8ui7UUgUw==','enc:v1:4XdJb0PGWcWonwHZ:gOF/NuTA2hT7FxjRXjMM7A==:JM1+9DZJ/SWRzvfeRVe/lNyZVXliVodA8DEB2GI/kU3Fdx+pkBcIe/vLvMf2TXIFGNCtNs4Bh1KnjjS6LxtIcgOpOpr8DMhrM0siRqmJl+J5P0cptQEKIpfUc+6MoEeTxjo=',18,'contract_request',1,'/Calendar','2026-05-28 03:34:45','2026-05-28 07:23:39'),(189,67,'general','enc:v1:WbC4O1qs78DZl/1p:d9FNBbJHSq3zt6q5yJ9nkw==:BsWQNcdqhgYX21MRuoirIg==','enc:v1:Oi5SzTNUfS5flNSc:UVgynazRoQ/Ox0NYmnYWBQ==:+QfaTslJ6nD4Gy8cZqiP7eWlcj4cD2asGJLStqF7jZxkGNCwX/ltLbuqmxKuG7ziqrVnjDwM9q33I26mua47MX/iWOH/',3,'class',1,NULL,'2026-05-28 03:35:08','2026-05-28 07:22:45'),(190,69,'remark','enc:v1:uVxvSyOx2q9YR+vq:0GM/l13lS3ROeA76NSqIRw==:2wbiS7gmcoPgiSaZkKGpyIyJ','enc:v1:RhtYRMVBmaRYrfke:ZwFvl5uTnMhcV7haDzCjig==:rC96CHWczaIRnLGu+dInwSfJ/LSPZehb5dEzpPxT3ami6VvPQsFs7cRDqqXuX/QsDxrzhUbZI4tnYm2hFI1z4Icfg2xRvZGIaAdUgE4EPY4SBVqG',3,'class_remarks',1,'/remarks','2026-05-28 03:43:27','2026-05-28 07:23:39'),(191,69,'remark','enc:v1:Srv8fl8P2PjXlVzq:s46dSpgC9XyKXtuhd/ak0A==:CEF2Mc88Yh2XPFQ/hNd58ELh','enc:v1:wS0KbD4RntwFIKB3:64OqBA53P9/Q61t7iOIaHA==:IDAJXacYmbMQKb7kuep7fq0ssfe/mdB85KHug5VPK3U99fXul5ZbRGdRLGPNsuLMU87JxbfOlm3tJR2Dgd4DVG5i/RLDF6ppCunC9YBGOdNMcTBB',3,'class_remarks',1,'/remarks','2026-05-28 03:43:38','2026-05-28 07:23:39'),(192,69,'announcement','enc:v1:Auc0xVlUkztaCGJG:/jyxhiyZQTOIq9+o4Rnu+A==:QedPk24KdoWLVTlaRFrNwtB5hmv75bksSbkyZg==','enc:v1:AFTUrJcn9js8chbB:s78qLN7ePg1dls87PJbC5w==:PU8u/bYWDmuchg04hySzlRaR4NMwToW8OVu+r1OA269Pr0Yb/Anbeb6wa1NnAJbV0rE1tA/ylVIqWyYoNkZ0/e96ws6k',73,'teacher_availability',1,'/Calendar','2026-05-28 07:18:18','2026-05-28 07:23:39'),(193,69,'remark','enc:v1:4d/5F0hil4ASYe9J:EQifOSxQE77iEHcyg+XcFg==:pxA54sBER8G6LFDHReLchkHz','enc:v1:WZWJP0Lt/V2Xk4wn:qY5PFOhn2fyWZGTnxtGHeg==:+nWViZ6rr+xSSS7txUDnODcvcSVRu/Ud2V8L8Bb1VI2vGChu7J3kSb2rUCaQ3TWTUAgQ4MAjrNZ5kZqyoGxIdEFTwP78f/pE1hY5kp0jt5GC6/Io',3,'class_remarks',1,'/remarks','2026-05-28 07:25:38','2026-05-28 07:25:53'),(194,69,'remark','enc:v1:vPph9NsCL8towBvp:zacZh0kKf0PL4H78tYXNGQ==:C9XNwAfoMOJk9WQEimeSJh9p','enc:v1:zim4jj0avc4moldv:lDE0Z8TZjLgSF4kFQIDuhg==:qzYzF+NyCb3Wx7pBfPv63BT65hqItpahTUrK+PYUKN+8fiqi3KRuHRicDAug1rUVmztsJmIrNL2TOiJqRAyDRH+4LufsupkJHHcScbvqNGPEHXmP',3,'class_remarks',0,'/remarks','2026-05-28 07:28:02',NULL),(195,69,'assignment','enc:v1:px7cljPTdabVcL6/:ADitxGQzXWvXzXgNRzOgGQ==:LXb3E00cYbERWw2KRls=','enc:v1:nkLfRfq+yYcckArc:AaOnlXObfCCOu5N2WEUjMA==:YpA5XqF7tFBhk0bL9rbc3ga+AGJtMFCnj0ywfhrxJCf2lNothqy+4UQpo0JIHtQ=',16,'assignment',0,'/assignmentsDropbox?assignmentId=16','2026-05-28 07:44:10',NULL),(196,67,'assignment','enc:v1:BK2Yv0Y1jay+st7v:m1V3uALMhCPkHhUzm37VDw==:LyrtF8Ms7WkjK7Jfuu/Ka633Ovw=','enc:v1:XhfizB04uyYKy3ci:uc1mC5vp1UzRP1NnpIfmyA==:VsMDuYeW68q6tPR93CaGCYYGuaMCoQu6lvfipIldDRzA7W/8v25zzvBo7rY=',16,'assignment',1,'/teacherAssignment','2026-05-28 07:44:57','2026-05-28 11:05:08'),(197,67,'general','enc:v1:3PEB5rlt2m2HtuHG:YjvoXLgFk5MzREywzdPoUw==:khipe0/UVL97pzPRXf+dCQ==','enc:v1:Zcz1gEJS6GaDMWoG:/CD+63WzPbriG+bOaApsvQ==:2F/BKytAF6eEvUMLt8KIfmc1JTA8zMLJ4fo7J0cSbwOwZnyl+KigtIyOw6sXY8GepSaxxQWtvowNPxx+O4XxnGeko4g4',4,'class',0,NULL,'2026-05-28 10:49:19',NULL),(198,67,'general','enc:v1:UBqPhrfP4nh6EsPJ:i+lfoy5Ss3LWMyw+C6b6Ig==:I+Q+5y5SnDrtnykMa59cEQ==','enc:v1:KXOkiwlaxvsBsDIi:y6wd3XjHAVcnko0HmjvQ5w==:WKEfzx7wgYOhZ59W0PqtYFmFvWjyV3sQpPhbfPsJuOKJqtrA9PkmJY2Ll/g/v/PPgtK6fz8IQxEiSf/faGI22f0bxuG2',5,'class',1,NULL,'2026-05-28 10:57:37','2026-05-28 11:05:03');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reschedule_requests`
--

DROP TABLE IF EXISTS `reschedule_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reschedule_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `requested_by_id` int NOT NULL,
  `requested_date` date NOT NULL,
  `requested_time` time NOT NULL,
  `reason` text,
  `status` enum('pending','approved','declined') DEFAULT 'pending',
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_class_id` (`class_id`),
  KEY `idx_status` (`status`),
  KEY `idx_requested_by` (`requested_by_id`),
  CONSTRAINT `reschedule_requests_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`class_id`),
  CONSTRAINT `reschedule_requests_ibfk_2` FOREIGN KEY (`requested_by_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reschedule_requests`
--

LOCK TABLES `reschedule_requests` WRITE;
/*!40000 ALTER TABLE `reschedule_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `reschedule_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_class_packages`
--

DROP TABLE IF EXISTS `student_class_packages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_class_packages` (
  `package_id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `total_classes` int NOT NULL DEFAULT '0',
  `classes_used` int DEFAULT '0',
  `classes_left` int GENERATED ALWAYS AS ((`total_classes` - `classes_used`)) STORED,
  `class_duration` int NOT NULL DEFAULT '50',
  `status` enum('active','expired','cancelled') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`package_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_status` (`status`),
  KEY `idx_packages_student_status_created` (`student_id`,`status`,`created_at`),
  CONSTRAINT `student_class_packages_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_class_packages`
--

LOCK TABLES `student_class_packages` WRITE;
/*!40000 ALTER TABLE `student_class_packages` DISABLE KEYS */;
INSERT INTO `student_class_packages` (`package_id`, `student_id`, `total_classes`, `classes_used`, `class_duration`, `status`, `created_at`, `updated_at`) VALUES (36,69,10,10,25,'expired','2026-05-27 18:19:29','2026-05-28 02:38:46'),(37,69,10,10,25,'expired','2026-05-28 02:51:35','2026-05-28 03:22:29'),(38,69,10,10,50,'expired','2026-05-28 03:25:42','2026-05-28 03:33:33'),(39,69,10,0,50,'active','2026-05-28 03:34:45','2026-05-28 03:34:45');
/*!40000 ALTER TABLE `student_class_packages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_contract_requests`
--

DROP TABLE IF EXISTS `student_contract_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_contract_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `course_id` int DEFAULT NULL,
  `requested_classes` int NOT NULL,
  `class_duration` int NOT NULL DEFAULT '50',
  `trial_notes` text,
  `ai_criteria` text,
  `status` enum('pending','approved','declined') NOT NULL DEFAULT 'pending',
  `admin_response` text,
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_student_contract_requests_student` (`student_id`),
  KEY `idx_student_contract_requests_course` (`course_id`),
  KEY `idx_student_contract_requests_status` (`status`),
  CONSTRAINT `student_contract_requests_course_fk` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`),
  CONSTRAINT `student_contract_requests_student_fk` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_contract_requests`
--

LOCK TABLES `student_contract_requests` WRITE;
/*!40000 ALTER TABLE `student_contract_requests` DISABLE KEYS */;
INSERT INTO `student_contract_requests` VALUES (16,69,8,10,25,NULL,'enc:v1:1j9e/s+3rmybeYL5:SSfKsG8wN0Cv/l1QSnSNOQ==:ZieAqkmqWAbkoPLuAmR58pFkqAfMjmroy0Z87u1f0//RIsQzsTOOFOkrFM2z1klQoEXo1fnIHoZFq+gNHFT/qjgahfvvLuuqvZn+d7+1KZIFxj4f5gkZdfd/Adahc6kJ+gVBIsRgDtq72pB0RtuG+MnRjDBHFdWgAck9klsMcCdGwWq1NSYkcOW+3xiIxR0TKvZtR8ZBKLZSYbDkuAyGrkJUrq+KW2AuwBgirf5zo2KVrR6dDLhkw0WQhqC3e+oM','approved',NULL,'2026-05-28 02:51:26','2026-05-28 02:51:35'),(17,69,8,10,50,NULL,'enc:v1:gWKROPvUKXzHQdSC:BagmvoqlYWgPnzDhnARZ0A==:OUP0d3W2kptjfm5eaUnuhfcMl4b3KTgPr9hPjVN1vehHsAGHelVkOTcahyZfHNKPloOkTs1is01iMjj6X58UEOhKDMnx9h8kjYQZK7mHVRmUIUAqKaiuYDuQ9JJs4Rxdim4Gl66PEdGMa54g9cPU63QpzV1OVeH0Ie7NqrZSllIMu6BeuGOLJbWMT/COe6OD28z0DC8cRlM4veLDky1ks1omsdJNgZsxHEEFrbwEAiHKNyM1KJgoMcTAtNPSx0aU','approved',NULL,'2026-05-28 03:25:29','2026-05-28 03:25:42'),(18,69,8,10,50,NULL,'enc:v1:oNjO2LzC/W5duXjp:xmINGfqw06NfF7wC+6gW7g==:AjXJe7T9FEAYqePcSK26GjgmvigZ3L4hZqde7NZR9LEftfm84zyhGC87rUg2gZpE3IhKvLhLDuhpksWQN0pukUhJHhHYR0n6wJh1ybYWWJv3yAAkIrY1cpmFgsITyGZyr8/wKf7XfNb1E7aodEHlbRL6QxbgSeqU8A5aoLtLP0jewWpW5zWJ1g95gPQeq2/+Xc+jfZ1Jhpl6qxFTDqd3p1Xjf3fb9vhTJyU6XS9vh/YRDoq+x4q92PICC1XoKdso','approved',NULL,'2026-05-28 03:34:24','2026-05-28 03:34:45');
/*!40000 ALTER TABLE `student_contract_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_course_progress`
--

DROP TABLE IF EXISTS `student_course_progress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_course_progress` (
  `progress_id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `book_id` int NOT NULL,
  `course_id` int NOT NULL,
  `status` enum('In Progress','Completed') NOT NULL DEFAULT 'In Progress',
  `completed_lessons` int NOT NULL DEFAULT '0',
  `total_lessons` int NOT NULL DEFAULT '0',
  `progress_percentage` int NOT NULL DEFAULT '0',
  `completed_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`progress_id`),
  UNIQUE KEY `unique_student_book_progress` (`student_id`,`book_id`),
  KEY `idx_student_course_progress_student` (`student_id`),
  KEY `idx_student_course_progress_book` (`book_id`),
  KEY `idx_student_course_progress_course` (`course_id`),
  KEY `idx_student_course_progress_status` (`status`),
  CONSTRAINT `student_course_progress_book_fk` FOREIGN KEY (`book_id`) REFERENCES `books` (`book_id`) ON DELETE CASCADE,
  CONSTRAINT `student_course_progress_course_fk` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`),
  CONSTRAINT `student_course_progress_student_fk` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_course_progress`
--

LOCK TABLES `student_course_progress` WRITE;
/*!40000 ALTER TABLE `student_course_progress` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_course_progress` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_profiles`
--

DROP TABLE IF EXISTS `student_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_profiles` (
  `student_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `proficiency_level` enum('novice-low','novice-mid','novice-high','intermediate-low','intermediate-mid','intermediate-high','advanced') DEFAULT 'novice-low',
  `assigned_teacher_id` int DEFAULT NULL,
  `trial_notes` text,
  `course_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_assigned_teacher_id` (`assigned_teacher_id`),
  KEY `idx_course_id` (`course_id`),
  CONSTRAINT `student_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `student_profiles_ibfk_2` FOREIGN KEY (`assigned_teacher_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `student_profiles_ibfk_3` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_profiles`
--

LOCK TABLES `student_profiles` WRITE;
/*!40000 ALTER TABLE `student_profiles` DISABLE KEYS */;
INSERT INTO `student_profiles` VALUES (24,69,'advanced',67,'enc:v1:S8gmymfj32Bjr8rh:ulr8fhhk/gzybqKbf0+zCA==:em+vWQEwC8x3VuIs4AkuNLQiMYEamBluN/R2NHYR6i5ki+jNpVS00a+LbUtvmT0hbmeQPELtiPG1ZT4gUEBRoyJ7bJde6m5njCRuab30Fko876hmDQZ8HDrAs653dNMly7zN8Ff7/H7G9miNo1LYexCt5AhcRM/K3f+H6SR2wHLBXcJSbGolM563U15K5awvzZu5Sgk7MaEIX0vMp/PIoVWFG5m7Xe9dqAyXj8oQrCqw1wo0uAE93087A41D6qO67Zqht9zPHiBfivosNaTsyTEEOmRbsUxuaRx2uVlWRzG7Svs6mfQxI8n1dmz07Bzwdtfg1xbJv08tigEBb81giiMHg7gSf73HJUZ/wzlGrTPcYhCffSa8MW1OHCY8llAfQjK76z4aTneUWUhh+pj5LC+AK1KZbdi6+UsnzUAqTNlUo+l1+l9aXJOOiymNXuJwKbNhXnaNw06Y8gkgBS4w+O/vr6AjDi3yv8vpaT2RYXrThwI+x7vf5uaCaYeO3FBNC13fdaZJrWQALh7OHyLpntRUEdVt0DMGLyuzQSoBsM98LcwznLNA7IODYkIqhdhAARadbtXd8aOPaYztkOSHsi5FsR/NtBp6sTZDeWpubx94miyF31MhrfCmZXmWJwhs8tTwcwEnEHTKRDQd7fh0QO36LT39EHZ0TJlZ8ShIdDNpLfUTorx/pYQcRLu7rbYABqpVYFPZtsLY8Nkz1RQds/bdVGtnJj1NG+o3CaD6fPZqHPw9D+Xa8deilbKNjedkLj9Bo6Ygakxj59+oTjY+3XUTFC/7KBMNZi/vRDQ++XY0igZG5t4437YOwv888Axj7ybXdJZbxlSWsmWBn9MaHtOGr1fNIPgSLLLHyeLrjth1mIxiaLKS8VTY0OKdf+AtHKT4FUa8VW325rPhAwSFSp7/+4b0T7E7mp8XJrcRxneoaD32ZKuwLtAEn+l25SuWuwkKTzB7936rhldgX/EOqs0zqIE3i26alR/SE+8xoZVr4mrYBZqYZpwLmou0gmG8hFuuGDmBt+l+kd+3MSP8KD17C1qB20Rqz7t2N8DvsayLBSOniaH7zhdAzkyKqHMkxQw/UgQ18gYS7twTS0+Xm/Xc1m11VkxW/OHdju+uY0pP9Oit0b2M7x1hWc0v1yBQYCtWjzEKD10TyNtJ6QN8BOUCCXNN81ynwGTQNtkow5gADIf/FIYQyBbhLcdqra/uHKRrpUbrmis=',8,'2026-05-27 18:19:29','2026-05-28 03:41:50');
/*!40000 ALTER TABLE `student_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_availability`
--

DROP TABLE IF EXISTS `teacher_availability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_availability` (
  `availability_id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` int NOT NULL,
  `available_date` date NOT NULL,
  `status` enum('available','unavailable') DEFAULT 'available',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `break_start` time DEFAULT NULL,
  `break_end` time DEFAULT NULL,
  PRIMARY KEY (`availability_id`),
  UNIQUE KEY `unique_teacher_date` (`teacher_id`,`available_date`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_date` (`available_date`),
  KEY `idx_teacher_date_time` (`teacher_id`,`available_date`,`start_time`),
  CONSTRAINT `teacher_availability_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_availability`
--

LOCK TABLES `teacher_availability` WRITE;
/*!40000 ALTER TABLE `teacher_availability` DISABLE KEYS */;
INSERT INTO `teacher_availability` VALUES (71,67,'2026-05-28','available',NULL,'2026-05-27 18:53:15','2026-05-28 02:33:39','11:00:00','20:00:00',NULL,NULL),(73,67,'2026-05-29','available',NULL,'2026-05-28 07:18:18','2026-05-28 07:18:18','07:00:00','17:00:00',NULL,NULL);
/*!40000 ALTER TABLE `teacher_availability` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_courses`
--

DROP TABLE IF EXISTS `teacher_courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_courses` (
  `teacher_id` int NOT NULL,
  `course_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`teacher_id`,`course_id`),
  KEY `idx_teacher_courses_course` (`course_id`),
  CONSTRAINT `teacher_courses_course_fk` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`) ON DELETE CASCADE,
  CONSTRAINT `teacher_courses_teacher_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_courses`
--

LOCK TABLES `teacher_courses` WRITE;
/*!40000 ALTER TABLE `teacher_courses` DISABLE KEYS */;
INSERT INTO `teacher_courses` VALUES (67,2,'2026-05-27 18:14:04'),(67,3,'2026-05-27 18:14:04'),(67,8,'2026-05-27 18:14:04'),(68,1,'2026-05-27 18:17:11'),(68,2,'2026-05-27 18:17:11'),(68,7,'2026-05-27 18:17:11');
/*!40000 ALTER TABLE `teacher_courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_profiles`
--

DROP TABLE IF EXISTS `teacher_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_profiles` (
  `teacher_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `bio` text,
  `specialization` varchar(255) DEFAULT NULL,
  `experience_years` int DEFAULT NULL,
  `hourly_rate` decimal(8,2) DEFAULT NULL,
  `profile_image_url` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`teacher_id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `teacher_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_profiles`
--

LOCK TABLES `teacher_profiles` WRITE;
/*!40000 ALTER TABLE `teacher_profiles` DISABLE KEYS */;
INSERT INTO `teacher_profiles` VALUES (20,67,'AI matching profile:\nTeaching style: conversational\nTeacher strength: energetic and engaging\nBest student pace: balanced','speaking and conversation, grammar and writing, reading and vocabulary, listening and pronunciation, job interview coaching, kids and beginner english',5,NULL,'/uploads/profiles/1779906052478-034f5d24f050b66b.png','2026-05-27 18:14:04','2026-05-27 18:20:52'),(21,68,'AI matching profile:\nTeaching style: conversational\nTeacher strength: strict and focused\nBest student pace: slow','speaking and conversation, grammar and writing, listening and pronunciation, business english, job interview coaching, exam preparation',5,NULL,NULL,'2026-05-27 18:17:11','2026-05-27 18:17:11');
/*!40000 ALTER TABLE `teacher_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `contact_number` text,
  `country` varchar(100) DEFAULT NULL,
  `birth_date` text,
  `profile_image_url` varchar(500) DEFAULT NULL,
  `timezone` varchar(64) DEFAULT 'Asia/Manila',
  `role` enum('student','teacher','admin') NOT NULL DEFAULT 'student',
  `status` enum('active','suspended','archived') NOT NULL DEFAULT 'active',
  `profile_completed` tinyint(1) DEFAULT '0',
  `password_changed` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_email` (`email`) /*!80000 INVISIBLE */,
  KEY `idx_role` (`role`) /*!80000 INVISIBLE */,
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Jennifer','Santos','jen@admin.com','$2b$10$62ZHvyEP3/sAePPXabUpx.jdrfxoAGe7z1M5aIVe34b7yEyGRX0ym','enc:v1:kfQonnI3SBMDzR8R:nhH3jPqCI9krkEt1MngdQQ==:FFYEU63hY81oSO6eRw==','Philippines','enc:v1:Un91S8PM4ug+HbJR:T95XtZaC6FKJv08GzMXZrQ==:/zUXB50Om7m65g==','/uploads/profiles/1779905408963-728f7de1faaa3eb6.png','Asia/Manila','admin','active',1,1,'2026-05-27 18:08:17','2026-05-27 18:11:02'),(67,'Richard ','Santos','RichardSantos@gmail.com','$2b$10$8Jy7vkZPa8BJZdUbwfc35.YJio63lKj9Y7bgXaAa4BgIIIfSXgEdS','enc:v1:uxEmyw8PKfpZEr12:Pu1f9TKSZdgvQ8QCqZFOMA==:O1tdblYO3AbNMsu14Q==','Philippines','enc:v1:Ndjp34m/Msge5/bG:gaaD/It32VL/fOVwi5WJcQ==:bRXIBeu9IMeCYg==','/uploads/profiles/1779906052478-034f5d24f050b66b.png','Asia/Manila','teacher','active',1,1,'2026-05-27 18:14:04','2026-05-27 18:21:16'),(68,'Jun','Gascon','JunGascon@gmail.com','$2b$10$ZLgTALe.0k34yaYLHHvixOAhv3cTckDAvCgYYusZUE9XA1myVfctm',NULL,'Philippines','enc:v1:A7CdHxU2UWnXE07u:a+0G1oYtNKROEoI82AtpEQ==:2obqDTkG1sbH1g==',NULL,'Asia/Manila','teacher','active',0,0,'2026-05-27 18:17:11','2026-05-28 11:43:27'),(69,'Alex','Pacaldo','AlexPacaldo@gmail.com','$2b$10$TMf3mTDA4Dt93NianOg23eShWFIwpTMd5b2alXQ5qzd/0nEE5TeLy','enc:v1:H2/McB8av8GrXZNs:H+j+FobED6g5soAdM9taFg==:lZHQN46wCXgK1JXS7g==','Philippines','enc:v1:uTf7+7BEntv7knMN:GJyeEkpgqrwqIfEqpioIGA==:q3p33FpEAIf14w==','/uploads/profiles/1779953937622-9cbf957b96ca04b5.png','Asia/Manila','student','active',1,1,'2026-05-27 18:19:29','2026-05-28 07:51:36');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `video_sessions`
--

DROP TABLE IF EXISTS `video_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `video_sessions` (
  `session_id` int NOT NULL AUTO_INCREMENT,
  `class_id` int DEFAULT NULL,
  `teacher_id` int NOT NULL,
  `student_id` int NOT NULL,
  `teams_meeting_link` text,
  `status` enum('scheduled','in_progress','completed','cancelled') DEFAULT 'scheduled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  KEY `class_id` (`class_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `video_sessions_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`class_id`),
  CONSTRAINT `video_sessions_ibfk_2` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `video_sessions_ibfk_3` FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `video_sessions`
--

LOCK TABLES `video_sessions` WRITE;
/*!40000 ALTER TABLE `video_sessions` DISABLE KEYS */;
INSERT INTO `video_sessions` VALUES (33,1,67,69,'enc:v1:QIgbwG77UwOpxzen:Ws6rKmtcXMiF9Ojg/Nn97A==:tHQVijzoEIoVnsTT9OVDtcwIySt8LPEyu731UKO50mQxoJw7VyPqUG+9vqh+T7NnBM4IeG5+Hy3sf4IM3DJ2b/SYiO+J1yOiRoWxTq03kb/lvI+gc1fwaT8=','scheduled','2026-05-28 03:30:59','2026-05-28 03:30:59'),(34,2,67,69,'enc:v1:qoeyvT4xdwgHvs5X:RMnlghpPwEurjAXo6VpbpA==:bhtOjXM9Dbwg0xN5S9CjziFw3NJ490achx9DrivnHB9pNeHJhF6abd4tmlqw1sUCn9T2xndUjWnrnmBCEl69CRZ4RA2u/VScWrI6NR4o+VJRdq9d8g1oCQY=','scheduled','2026-05-28 03:32:58','2026-05-28 03:32:58'),(35,3,67,69,'enc:v1:RS0rd7lUfsDm8wsP:QaoXR069VQGOpx6tJDAmxg==:AKr2iYxszEeo+frTEP0IZtr/8//LCr9PDwDLltDsnFfRfFbccUEf/QUtFzG6awoiuPRTSLzGyjFOPIhNKreMMlYM9qWrXbY1GqQG1oCKwdYv75VcjdxGzTc=','scheduled','2026-05-28 03:35:08','2026-05-28 03:35:08'),(36,4,67,69,'enc:v1:mLLPjooknKCAYGDH:ZlrpEAF3EySKKJ4ITSEDDQ==:yyJ1dgtwpm+tWLitjgb11PxKVsNzLT9QiKKRHHZ7Jt5NfCQR0/LpBirgpSrptbBd/smDI96I+5IB0iGnvJXuOrjsLRkMp/KVUJOavQJIZ9x8XxDyRHk6AWE=','scheduled','2026-05-28 10:49:19','2026-05-28 10:49:19'),(37,5,67,69,'enc:v1:+DOGjmlFflFvQnEC:7yRRtHiQpNvx0xwQp+ITKA==:PuiKlhXDuPijkUFH1lnrK3bm/ffeaP6vReX74ebCTpW7uwBXfgL9w/dN/LmsOJM59b94A/ZAQix9tQvvwk3oHz4thuCqUTmWGbSyEVaw7TkiH3Cp1Vukkiw=','scheduled','2026-05-28 10:57:37','2026-05-28 10:57:37');
/*!40000 ALTER TABLE `video_sessions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-28 22:14:35
