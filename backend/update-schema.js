import fs from 'fs';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Aj1182014',
  database: 'jen_academia',
  waitForConnections: true,
  connectionLimit: 10,
});

async function updateSchema() {
  try {
    const connection = await pool.getConnection();
    
    // Drop old notifications table if it exists (to replace with new schema)
    console.log('Dropping old notifications table...');
    await connection.query('DROP TABLE IF EXISTS notifications');
    
    const schemaSQL = fs.readFileSync('./schema.sql', 'utf8');
    
    // Split by semicolon and filter out empty statements
    const statements = schemaSQL.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));
    
    for (const statement of statements) {
      if (statement) {
        console.log(`Executing: ${statement.substring(0, 80)}...`);
        await connection.query(statement);
      }
    }
    
    connection.release();
    console.log('✓ Database schema updated successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error updating schema:', err.message);
    process.exit(1);
  }
}

updateSchema();
