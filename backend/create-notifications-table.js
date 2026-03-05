import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Aj1182014',
  database: 'jen_academia',
  waitForConnections: true,
  connectionLimit: 10,
});

async function createNotificationsTable() {
  try {
    const connection = await pool.getConnection();
    
    const sql = `CREATE TABLE IF NOT EXISTS notifications (
      notification_id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      type ENUM('reschedule', 'assignment', 'remark', 'announcement', 'class_reminder', 'general') DEFAULT 'general',
      title VARCHAR(255),
      message TEXT NOT NULL,
      related_id INT COMMENT 'ID of related entity',
      related_type VARCHAR(50) COMMENT 'Type of related entity',
      is_read BOOLEAN DEFAULT FALSE,
      action_url VARCHAR(500) COMMENT 'Optional URL',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      INDEX idx_user_id (user_id),
      INDEX idx_is_read (is_read),
      INDEX idx_type (type),
      INDEX idx_created_at (created_at)
    )`;
    
    await connection.query(sql);
    console.log('✓ notifications table created successfully!');
    
    // Verify the table
    const [columns] = await connection.query('DESCRIBE notifications');
    console.log('\nTable structure:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''}`);
    });
    
    connection.release();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createNotificationsTable();
