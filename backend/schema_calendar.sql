-- Calendar Tables for jen_academia
-- Run these commands in your MySQL database to set up the calendar system

-- ==================== CLASSES TABLE ====================
-- Stores all scheduled classes
CREATE TABLE IF NOT EXISTS classes (
  id INT PRIMARY KEY AUTO_INCREMENT,
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
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_student_id (student_id),
  INDEX idx_scheduled_date (scheduled_date),
  INDEX idx_status (status)
);

-- ==================== TEACHER AVAILABILITY TABLE ====================
-- Stores teacher availability per day
CREATE TABLE IF NOT EXISTS teacher_availability (
  id INT PRIMARY KEY AUTO_INCREMENT,
  teacher_id INT NOT NULL,
  available_date DATE NOT NULL,
  status ENUM('available', 'unavailable') DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  UNIQUE KEY unique_teacher_date (teacher_id, available_date),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_date (available_date)
);

-- ==================== STUDENT CLASS PACKAGES TABLE ====================
-- Tracks how many classes each student has purchased/used
CREATE TABLE IF NOT EXISTS student_class_packages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  total_classes INT NOT NULL DEFAULT 0,
  classes_used INT DEFAULT 0,
  classes_left INT GENERATED ALWAYS AS (total_classes - classes_used) STORED,
  package_start_date DATE,
  package_end_date DATE,
  status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id),
  INDEX idx_student_id (student_id),
  INDEX idx_status (status)
);

-- ==================== CLASS RESCHEDULE REQUESTS TABLE ====================
-- Tracks class reschedule requests
CREATE TABLE IF NOT EXISTS reschedule_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  requested_by_id INT NOT NULL,
  requested_date DATE NOT NULL,
  requested_time TIME NOT NULL,
  reason TEXT,
  status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (requested_by_id) REFERENCES users(id),
  INDEX idx_class_id (class_id),
  INDEX idx_status (status)
);

-- ==================== CLASS REMARKS TABLE ====================
-- Stores remarks/feedback from teachers for students after class
CREATE TABLE IF NOT EXISTS class_remarks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  remarks TEXT NOT NULL,
  rating INT DEFAULT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  INDEX idx_class_id (class_id),
  INDEX idx_student_id (student_id),
  UNIQUE KEY unique_class_remark (class_id, teacher_id)
);

-- ==================== CLASS ATTENDANCE TABLE ====================
-- Tracks attendance for each class
CREATE TABLE IF NOT EXISTS class_attendance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  student_id INT NOT NULL,
  attended BOOLEAN DEFAULT FALSE,
  join_time DATETIME,
  leave_time DATETIME,
  notes TEXT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  UNIQUE KEY unique_class_student (class_id, student_id),
  INDEX idx_class_id (class_id),
  INDEX idx_attended (attended)
);

-- ==================== SAMPLE DATA (Optional) ====================
-- Uncomment to insert sample data

-- INSERT INTO teacher_availability (teacher_id, available_date, status) VALUES
-- (2, '2026-02-17', 'available'),
-- (2, '2026-02-18', 'unavailable'),
-- (2, '2026-02-19', 'available');

-- INSERT INTO student_class_packages (student_id, total_classes, classes_used, package_start_date, package_end_date) VALUES
-- (1, 20, 5, '2026-01-01', '2026-12-31');

-- INSERT INTO classes (class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link, status) VALUES
-- ('Mathematics 101', 2, 1, '2026-02-17', '09:00:00', '10:30:00', '1h 30m', 'https://zoom.us/j/1234567890', 'scheduled'),
-- ('Physics Lab', 2, 1, '2026-02-17', '11:00:00', '13:00:00', '2h', 'https://zoom.us/j/0987654321', 'scheduled');
