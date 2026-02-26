-- ============================================================================
-- JEN ACADEMIA - Comprehensive Database Schema
-- ============================================================================
-- This schema includes all tables needed for the complete e-learning system

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  contact_number VARCHAR(20),
  timezone VARCHAR(50) DEFAULT 'UTC',
  role ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student',
  status ENUM('active', 'suspended', 'archived') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  teacher_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  bio TEXT,
  specialization VARCHAR(255),
  experience_years INT,
  hourly_rate DECIMAL(8, 2),
  profile_image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_user_id (user_id)
);

-- ============================================================================
-- COURSES & ENROLLMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS courses (
  course_id INT PRIMARY KEY AUTO_INCREMENT,
  course_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  duration INT COMMENT 'Duration in hours',
  level ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_course_name (course_name)
);


-- ============================================================================
-- CALENDAR & CLASSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_availability (
  availability_id INT PRIMARY KEY AUTO_INCREMENT,
  teacher_id INT NOT NULL,
  available_date DATE NOT NULL,
  status ENUM('available', 'unavailable') DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(user_id),
  UNIQUE KEY unique_teacher_date (teacher_id, available_date),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_date (available_date)
);

CREATE TABLE IF NOT EXISTS classes (
  class_id INT PRIMARY KEY AUTO_INCREMENT,
  class_name VARCHAR(255) NOT NULL,
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration VARCHAR(50),
  class_link VARCHAR(500),
  status ENUM('scheduled', 'completed', 'cancelled') DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(user_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_student_id (student_id),
  INDEX idx_scheduled_date (scheduled_date),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS class_attendance (
  attendance_id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  student_id INT NOT NULL,
  attended BOOLEAN DEFAULT FALSE,
  join_time DATETIME,
  leave_time DATETIME,
  duration_minutes INT,
  notes TEXT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(class_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  UNIQUE KEY unique_class_student (class_id, student_id),
  INDEX idx_class_id (class_id),
  INDEX idx_attended (attended)
);

-- ============================================================================
-- CLASS PACKAGES & QUOTA
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_class_packages (
  package_id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  total_classes INT NOT NULL DEFAULT 0,
  classes_used INT DEFAULT 0,
  classes_left INT GENERATED ALWAYS AS (total_classes - classes_used) STORED,
  package_start_date DATE,
  package_end_date DATE,
  status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  INDEX idx_student_id (student_id),
  INDEX idx_status (status)
);

-- ============================================================================
-- RESCHEDULE REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reschedule_requests (
  request_id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  requested_by_id INT NOT NULL,
  requested_date DATE NOT NULL,
  requested_time TIME NOT NULL,
  reason TEXT,
  status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (class_id) REFERENCES classes(class_id),
  FOREIGN KEY (requested_by_id) REFERENCES users(user_id),
  INDEX idx_class_id (class_id),
  INDEX idx_status (status),
  INDEX idx_requested_by (requested_by_id)
);

-- ============================================================================
-- REMARKS & FEEDBACK
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_remarks (
  remark_id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  remarks TEXT NOT NULL,
  rating INT DEFAULT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(class_id),
  FOREIGN KEY (teacher_id) REFERENCES users(user_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  UNIQUE KEY unique_class_remark (class_id, teacher_id),
  INDEX idx_class_id (class_id),
  INDEX idx_student_id (student_id)
);

-- ============================================================================
-- ASSIGNMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS assignments (
  assignment_id INT PRIMARY KEY AUTO_INCREMENT,
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  course_id INT,
  title VARCHAR(255) NOT NULL,
  instructions TEXT,
  due_date DATE NOT NULL,
  due_time TIME,
  status ENUM('pending', 'submitted', 'graded', 'overdue') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(user_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  FOREIGN KEY (course_id) REFERENCES courses(course_id),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_student_id (student_id),
  INDEX idx_due_date (due_date),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  submission_id INT PRIMARY KEY AUTO_INCREMENT,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  submission_text TEXT,
  file_url VARCHAR(500),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  grade INT,
  feedback TEXT,
  graded_at TIMESTAMP NULL,
  FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  UNIQUE KEY unique_assignment_student (assignment_id, student_id),
  INDEX idx_assignment_id (assignment_id),
  INDEX idx_submitted_at (submitted_at)
);

-- ============================================================================
-- BOOKS & LESSONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS books (
  book_id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  author VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(course_id),
  INDEX idx_course_id (course_id)
);

CREATE TABLE IF NOT EXISTS lessons (
  lesson_id INT PRIMARY KEY AUTO_INCREMENT,
  book_id INT NOT NULL,
  lesson_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT,
  order_number INT,
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(book_id),
  INDEX idx_book_id (book_id),
  INDEX idx_is_published (is_published)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  progress_id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  lesson_id INT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  time_spent_minutes INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id),
  UNIQUE KEY unique_student_lesson (student_id, lesson_id),
  INDEX idx_student_id (student_id),
  INDEX idx_is_completed (is_completed)
);

-- ============================================================================
-- DROPBOX / FILE SUBMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS dropbox_submissions (
  dropbox_id INT PRIMARY KEY AUTO_INCREMENT,
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  submission_type ENUM('assignment', 'book_content', 'note', 'other') DEFAULT 'assignment',
  title VARCHAR(255),
  content TEXT,
  file_url VARCHAR(500),
  file_name VARCHAR(255),
  file_size INT COMMENT 'Size in bytes',
  notes TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(user_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_student_id (student_id),
  INDEX idx_submission_type (submission_type)
);

-- ============================================================================
-- ANNOUNCEMENTS & MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS announcements (
  announcement_id INT PRIMARY KEY AUTO_INCREMENT,
  creator_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  target_role ENUM('student', 'teacher', 'admin', 'all') DEFAULT 'all',
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(user_id),
  INDEX idx_creator_id (creator_id),
  INDEX idx_is_published (is_published)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id INT PRIMARY KEY AUTO_INCREMENT,
  sender_id INT NOT NULL,
  recipient_id INT NOT NULL,
  subject VARCHAR(255),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  FOREIGN KEY (sender_id) REFERENCES users(user_id),
  FOREIGN KEY (recipient_id) REFERENCES users(user_id),
  INDEX idx_recipient_id (recipient_id),
  INDEX idx_is_read (is_read),
  INDEX idx_sent_at (sent_at)
);

-- ============================================================================
-- VIDEO CALLS / SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_sessions (
  session_id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT,
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  teams_meeting_link VARCHAR(500),
  status ENUM('scheduled', 'in_progress', 'completed', 'cancelled') DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(class_id),
  FOREIGN KEY (teacher_id) REFERENCES users(user_id),
  FOREIGN KEY (student_id) REFERENCES users(user_id),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_student_id (student_id),
  INDEX idx_status (status)
);

-- ============================================================================
-- ADMIN & SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_logs (
  log_id INT PRIMARY KEY AUTO_INCREMENT,
  admin_id INT NOT NULL,
  action VARCHAR(255) NOT NULL,
  target_table VARCHAR(100),
  target_id INT,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(user_id),
  INDEX idx_admin_id (admin_id),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(255) NOT NULL UNIQUE,
  setting_value TEXT,
  description VARCHAR(500),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_setting_key (setting_key)
);

-- ============================================================================
-- SAMPLE DATA (Optional) - Uncomment to insert
-- ============================================================================

-- INSERT INTO courses (course_name, description, level) VALUES
-- ('Business English', 'Learn professional English for business', 'intermediate'),
-- ('IELTS Preparation', 'Comprehensive IELTS exam preparation', 'advanced'),
-- ('Travel English', 'Practical English for travelers', 'beginner'),
-- ('OPIc Test Prep', 'Oral Proficiency Interview preparation', 'intermediate');

-- INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES
-- ('Jen', 'Teacher', 'jen@example.com', '$2a$10$...', 'teacher'),
-- ('John', 'Student', 'john@example.com', '$2a$10$...', 'student'),
-- ('Admin', 'User', 'admin@example.com', '$2a$10$...', 'admin');

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
