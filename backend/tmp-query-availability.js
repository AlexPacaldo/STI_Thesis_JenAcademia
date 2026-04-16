const mysql = require('mysql2/promise');
(async () => {
  try {
    const pool = await mysql.createPool({
      host: 'localhost',
      user: 'root',
      password: 'Aj1182014',
      database: 'jen_academia',
      waitForConnections: true,
      connectionLimit: 10,
    });
    const [rows] = await pool.query("SELECT * FROM teacher_availability WHERE available_date = '2026-04-18'");
    console.log(JSON.stringify(rows, null, 2));
    await pool.end();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();