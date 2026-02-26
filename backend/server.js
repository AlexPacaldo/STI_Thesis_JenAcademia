// server.js (ESM)
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
//hi
const PORT = process.env.PORT || 3001;
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "Aj1182014";    // <- your password here
const DB_NAME = process.env.DB_NAME || "jen_academia"; // your schema

const app = express();
app.use(cors());
app.use(express.json());

// MySQL pool
export const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
function toMySQLDateTime(isoLike) {
  if (!isoLike) return null;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function resolveCourseIdByIdOrName(value) {
  if (!value) return null;
  // numeric id?
  if (/^\d+$/.test(String(value))) return parseInt(value, 10);

  // try by name
  const [rows] = await pool.query(
    "SELECT course_id FROM courses WHERE course_name = ? LIMIT 1",
    [value]
  );
  if (rows.length) return rows[0].course_id;

  // create if missing
  const [ins] = await pool.query(
    "INSERT INTO courses (course_name) VALUES (?)",
    [value]
  );
  return ins.insertId;
}

// ---------- courses ----------
app.get("/api/courses", async (_req, res) => {
  const [rows] = await pool.query("SELECT course_id, course_name FROM courses ORDER BY course_name");
  res.json({ courses: rows });
});

// ---------- month availability ----------
/**
 * GET /api/trial/availability?year=2025&month=11
 * Returns: { days: { 'YYYY-MM-DD': { disabled: bool, booked: ['09:00', ...] } } }
 */
app.get("/api/trial/availability", async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10); // 1..12

  if (!year || !month) return res.json({ days: {} });

  const start = `${year}-${pad(month)}-01 00:00:00`;
  const end = `${year}-${pad(month)}-31 23:59:59`; // safe enough

  // Pull existing trial bookings for that month
  const [rows] = await pool.query(
    `SELECT DATE(trial_datetime) as d, TIME_FORMAT(trial_datetime, '%H:%i') as t
     FROM trial_bookings
     WHERE trial_datetime BETWEEN ? AND ?
       AND status IN ('pending','approved')`,
    [start, end]
  );

  // Build per-day map of booked slots
  const map = {};
  for (const r of rows) {
    if (!map[r.d]) map[r.d] = new Set();
    map[r.d].add(r.t);
  }

  // Make response: all days enabled unless all slots are taken
  const days = {};
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const booked = Array.from(map[iso] || []);
    // consider a day "disabled" if every slot is already booked
    const disabled = booked.length >= 3; // because SLOTS has 3 default times
    days[iso] = { disabled, booked };
  }

  res.json({ days });
});

// ---------- (existing) login kept the same ----------
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Look up the user by email
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, email, password_hash, role
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    // Compare password with bcrypt
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Success — return a trimmed user object for the frontend
    res.json({
      message: "Login successful",
      user: {
        id: user.user_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



//ACCOUNT
app.get("/api/users/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, email, contact_number AS contact, timezone, role
       FROM users
       WHERE user_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const u = rows[0];
    res.json({
      user: {
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        contact: u.contact,
        timezone: u.timezone,
        role: u.role,
      },
    });
  } catch (err) {
    console.error("GET /api/users/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.put("/api/users/:id", async (req, res) => {
  try {
    const { firstName, lastName, email, contact, timezone } = req.body;

    await pool.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, email = ?, contact_number = ?, timezone = ?
       WHERE user_id = ?`,
      [firstName, lastName, email, contact, timezone, req.params.id]
    );

    res.json({ message: "Profile updated successfully!" });
  } catch (err) {
    console.error("PUT /api/users/:id error:", err);
    res.status(500).json({ message: "Could not update profile" });
  }
});

app.put("/api/users/:id/password", async (req, res) => {
  try {
    const { current, next } = req.body;
    const userId = req.params.id;

    // Fetch current hash
    const [rows] = await pool.query(
      "SELECT password_hash FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const user = rows[0];
    const match = await bcrypt.compare(current, user.password_hash);
    if (!match)
      return res.status(401).json({ message: "Current password incorrect" });

    // Hash new password
    const newHash = await bcrypt.hash(next, 10);
    await pool.query(
      "UPDATE users SET password_hash = ? WHERE user_id = ?",
      [newHash, userId]
    );

    res.json({ message: "Password updated successfully!" });
  } catch (err) {
    console.error("PUT /api/users/:id/password error:", err);
    res.status(500).json({ message: "Could not change password" });
  }
});

//ADMIN

//Create Teacher Account
app.post("/api/admin/users", async (req, res) => {
  try {
    const { firstName, lastName, email, password, contact, role = "teacher" } = req.body;

    const [exist] = await pool.query("SELECT user_id FROM users WHERE email = ?", [email]);
    if (exist.length) return res.status(409).json({ message: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);

    const [ins] = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, contact_number, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [email, hash, firstName, lastName, contact, role]);

    const userId = ins.insertId;
    
    // Only create teacher profile if role is teacher
    if (role === "teacher") {
      await pool.query(`INSERT INTO teacher_profiles (user_id, bio) VALUES (?, '')`, [userId]);
    }

    res.json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created`, userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating user" });
  }
});

// NOTE: the old archived-based endpoint was removed; use the status-aware version below

// ==================== ADMIN ENDPOINTS ====================

// Get users with optional role and status filtering
app.get("/api/admin/users", async (req, res) => {
  try {
    const { role, status } = req.query;
    let query = "SELECT user_id, first_name, last_name, email, role, status FROM users WHERE 1=1";
    const params = [];

    if (role) {
      query += " AND role = ?";
      params.push(role);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY first_name ASC";
    const [users] = await pool.query(query, params);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Update user status (active, suspended, archived)
app.put("/api/users/:userId/status", async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validate status value
    const validStatuses = ["active", "suspended", "archived"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const [result] = await pool.query(
      "UPDATE users SET status = ? WHERE user_id = ?",
      [status, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: `User status updated to ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user status" });
  }
});

// ==================== CALENDAR ENDPOINTS ====================

// Get teacher availability for a month
app.get("/api/calendar/teacher-availability", async (req, res) => {
  try {
    const { teacher_id, year, month } = req.query;
    
    if (!teacher_id || !year || !month) {
      return res.status(400).json({ message: "Missing teacher_id, year, or month" });
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

    const [rows] = await pool.query(
      `SELECT available_date, status FROM teacher_availability 
       WHERE teacher_id = ? AND available_date BETWEEN ? AND ?
       ORDER BY available_date`,
      [teacher_id, startDate, endDate]
    );

    const availability = {};
    rows.forEach(row => {
      availability[row.available_date] = row.status;
    });

    res.json({ availability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching availability" });
  }
});

// Set teacher availability for a date
app.post("/api/calendar/teacher-availability", async (req, res) => {
  try {
    const { teacher_id, available_date, status } = req.body;
    
    if (!teacher_id || !available_date || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await pool.query(
      `INSERT INTO teacher_availability (teacher_id, available_date, status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?`,
      [teacher_id, available_date, status, status]
    );

    res.json({ message: "Availability updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating availability" });
  }
});

// Get all classes for a specific date
app.get("/api/calendar/classes-by-date", async (req, res) => {
  try {
    const { scheduled_date, student_id, teacher_id } = req.query;

    let query = `SELECT c.*,
                       stu.first_name as student_name,
                       stu.email as student_email,
                       tea.first_name as teacher_name,
                       tea.email as teacher_email
                 FROM classes c
                 JOIN users stu ON c.student_id = stu.user_id
                 JOIN users tea ON c.teacher_id = tea.user_id
                 WHERE c.scheduled_date = ?`;
    const params = [scheduled_date];

    if (student_id) {
      query += ` AND c.student_id = ?`;
      params.push(student_id);
    }
    if (teacher_id) {
      query += ` AND c.teacher_id = ?`;
      params.push(teacher_id);
    }

    const [rows] = await pool.query(query, params);
    res.json({ classes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching classes" });
  }
});

// Create a new class
app.post("/api/calendar/class", async (req, res) => {
  try {
    const { class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link } = req.body;

    if (!class_name || !teacher_id || !student_id || !scheduled_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [result] = await pool.query(
      `INSERT INTO classes (class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [class_name, teacher_id, student_id, scheduled_date, start_time, end_time, duration, class_link]
    );

    res.status(201).json({ class_id: result.insertId, message: "Class created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating class" });
  }
});

// Get student class package
app.get("/api/calendar/student-package/:student_id", async (req, res) => {
  try {
    const { student_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM student_class_packages WHERE student_id = ? AND status = 'active'`,
      [student_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No active package found" });
    }

    res.json({ package: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching package" });
  }
});

// Request class reschedule
app.post("/api/calendar/reschedule-request", async (req, res) => {
  try {
    const { class_id, requested_by_id, requested_date, requested_time, reason } = req.body;

    if (!class_id || !requested_by_id || !requested_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [result] = await pool.query(
      `INSERT INTO reschedule_requests (class_id, requested_by_id, requested_date, requested_time, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [class_id, requested_by_id, requested_date, requested_time, reason]
    );

    res.status(201).json({ id: result.insertId, message: "Reschedule request sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating reschedule request" });
  }
});

// --- admin management of reschedule requests ---
app.get("/api/admin/reschedule-requests", async (req, res) => {
  try {
    // optionally filter by status via query param
    const { status } = req.query;
    let query = `SELECT rr.*, c.class_name, c.scheduled_date, c.start_time,
                        req.first_name AS requester_first, req.last_name AS requester_last,
                        stu.first_name AS student_first, stu.last_name AS student_last,
                        tea.first_name AS teacher_first, tea.last_name AS teacher_last
                 FROM reschedule_requests rr
                 JOIN classes c ON rr.class_id = c.class_id
                 JOIN users req ON rr.requested_by_id = req.user_id
                 LEFT JOIN users stu ON c.student_id = stu.user_id
                 LEFT JOIN users tea ON c.teacher_id = tea.user_id`;
    const params = [];
    if (status) {
      query += ` WHERE rr.status = ?`;
      params.push(status);
    }

    const [rows] = await pool.query(query, params);
    res.json({ requests: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching reschedule requests" });
  }
});

app.put("/api/admin/reschedule-requests/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ["pending", "approved", "declined"];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const resolvedAt = status === "pending" ? null : new Date();
    await pool.query(
      `UPDATE reschedule_requests SET status = ?, resolved_at = ? WHERE request_id = ?`,
      [status, resolvedAt, req.params.id]
    );
    res.json({ message: "Request updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating request" });
  }
});

// Submit class remarks
app.post("/api/calendar/remarks", async (req, res) => {
  try {
    const { class_id, teacher_id, student_id, remarks, rating } = req.body;

    if (!class_id || !teacher_id || !student_id || !remarks) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await pool.query(
      `INSERT INTO class_remarks (class_id, teacher_id, student_id, remarks, rating)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE remarks = ?, rating = ?`,
      [class_id, teacher_id, student_id, remarks, rating, remarks, rating]
    );

    res.json({ message: "Remarks saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving remarks" });
  }
});

// Get class remarks
app.get("/api/calendar/remarks/:class_id", async (req, res) => {
  try {
    const { class_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM class_remarks WHERE class_id = ?`,
      [class_id]
    );

    res.json({ remarks: rows.length ? rows[0] : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching remarks" });
  }
});

// ==================== VIDEO SESSIONS (MS TEAMS) ====================

// Create a video session with Teams meeting link
app.post("/api/video-sessions", async (req, res) => {
  try {
    const { class_id, teacher_id, student_id, teams_meeting_link } = req.body;

    if (!teacher_id || !student_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [result] = await pool.query(
      `INSERT INTO video_sessions (class_id, teacher_id, student_id, teams_meeting_link)
       VALUES (?, ?, ?, ?)`,
      [class_id, teacher_id, student_id, teams_meeting_link]
    );

    res.status(201).json({ id: result.insertId, message: "Video session created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating video session" });
  }
});

// Get video session by class ID
app.get("/api/video-sessions/:class_id", async (req, res) => {
  try {
    const { class_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM video_sessions WHERE class_id = ?`,
      [class_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No video session found" });
    }

    res.json({ session: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching video session" });
  }
});

// Update Teams meeting link for a session
app.put("/api/video-sessions/:session_id", async (req, res) => {
  try {
    const { session_id } = req.params;
    const { teams_meeting_link, status } = req.body;

    let query = "UPDATE video_sessions SET ";
    const params = [];

    if (teams_meeting_link) {
      query += "teams_meeting_link = ?, ";
      params.push(teams_meeting_link);
    }
    if (status) {
      query += "status = ?, ";
      params.push(status);
    }

    query = query.slice(0, -2); // Remove trailing ", "
    query += " WHERE session_id = ?";
    params.push(session_id);

    await pool.query(query, params);

    res.json({ message: "Video session updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating video session" });
  }
});

// Get all video sessions for a user
app.get("/api/video-sessions/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM video_sessions 
       WHERE teacher_id = ? OR student_id = ?
       ORDER BY created_at DESC`,
      [user_id, user_id]
    );

    res.json({ sessions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching video sessions" });
  }
});

// ==================== NOTIFICATIONS ====================

// Get all unread notifications for a user
app.get("/api/notifications/unread/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM notifications 
       WHERE recipient_id = ? AND is_read = FALSE
       ORDER BY priority DESC, created_at DESC`,
      [user_id]
    );

    res.json({ unread: rows, count: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching unread notifications" });
  }
});

// Get all notifications for a user (paginated)
app.get("/api/notifications/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT * FROM notifications 
       WHERE recipient_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [user_id, limit, offset]
    );

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM notifications WHERE recipient_id = ?`,
      [user_id]
    );

    res.json({ 
      notifications: rows, 
      total: countResult[0].total,
      page,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
});

// Create a new notification
app.post("/api/notifications", async (req, res) => {
  try {
    const { recipient_id, sender_id, title, message, type, related_table, related_id, action_url, priority } = req.body;

    if (!recipient_id || !title || !message) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [result] = await pool.query(
      `INSERT INTO notifications (recipient_id, sender_id, title, message, type, related_table, related_id, action_url, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipient_id, sender_id || null, title, message, type || 'system', related_table || null, related_id || null, action_url || null, priority || 'normal']
    );

    res.status(201).json({ id: result.insertId, message: "Notification created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating notification" });
  }
});

// Mark notification as read
app.put("/api/notifications/:notification_id/read", async (req, res) => {
  try {
    const { notification_id } = req.params;

    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE notification_id = ?`,
      [notification_id]
    );

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error marking notification as read" });
  }
});

// Mark all notifications as read for a user
app.put("/api/notifications/:user_id/read-all", async (req, res) => {
  try {
    const { user_id } = req.params;

    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE recipient_id = ? AND is_read = FALSE`,
      [user_id]
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error marking notifications as read" });
  }
});

// Delete a notification
app.delete("/api/notifications/:notification_id", async (req, res) => {
  try {
    const { notification_id } = req.params;

    await pool.query(
      `DELETE FROM notifications WHERE notification_id = ?`,
      [notification_id]
    );

    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting notification" });
  }
});

// Get user notification preferences
app.get("/api/notification-preferences/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = ?`,
      [user_id]
    );

    if (!rows.length) {
      // Create default preferences if they don't exist
      await pool.query(
        `INSERT INTO notification_preferences (user_id) VALUES (?)`,
        [user_id]
      );
      const [newRows] = await pool.query(
        `SELECT * FROM notification_preferences WHERE user_id = ?`,
        [user_id]
      );
      return res.json({ preferences: newRows[0] });
    }

    res.json({ preferences: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching preferences" });
  }
});

// Update user notification preferences
app.put("/api/notification-preferences/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const { class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end } = req.body;

    await pool.query(
      `INSERT INTO notification_preferences (user_id, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       class_reminders = ?, assignment_notifications = ?, remark_notifications = ?, reschedule_notifications = ?, enrollment_notifications = ?, email_on_notification = ?, do_not_disturb_start = ?, do_not_disturb_end = ?`,
      [user_id, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end, class_reminders, assignment_notifications, remark_notifications, reschedule_notifications, enrollment_notifications, email_on_notification, do_not_disturb_start, do_not_disturb_end]
    );

    res.json({ message: "Preferences updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating preferences" });
  }
});

app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));
