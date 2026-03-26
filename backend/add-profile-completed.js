import mysql from "mysql2/promise";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "Aj1182014";
const DB_NAME = process.env.DB_NAME || "jen_academia";

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

async function migrateDatabase() {
  try {
    console.log("Starting migration: Add profile_completed column to users table...");
    
    // Check if column already exists
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_completed'`
    );
    
    if (columns.length > 0) {
      console.log("✓ Column 'profile_completed' already exists");
      process.exit(0);
    }
    
    // Add the column
    await pool.query(
      `ALTER TABLE users ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE AFTER status`
    );
    
    console.log("✓ Successfully added 'profile_completed' column to users table");
    
    // Set existing users with non-empty required fields as profile_completed = true
    await pool.query(
      `UPDATE users SET profile_completed = TRUE 
       WHERE first_name != '' AND last_name != '' AND contact_number IS NOT NULL AND timezone IS NOT NULL`
    );
    
    console.log("✓ Updated existing users with complete profiles");
    
    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

migrateDatabase();
