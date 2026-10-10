
const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in your environment');
}

// Shared PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle unexpected errors on idle connections
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

// Execute parameterised SQL queries
const query = (text, params) => pool.query(text, params);

// Verify the database is reachable.
// Called once from server.js at startup.
const testConnection = async () => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT current_database() AS database_name
    `);

    console.log(
      `PostgreSQL connected to: ${result.rows[0].database_name}`
    );
  } finally {
    client.release();
  }
};

// Gracefully close database connections
const closePool = () => pool.end();

module.exports = {
  query,
  testConnection,
  closePool,
  pool
};
