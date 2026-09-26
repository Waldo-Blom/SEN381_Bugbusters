// Followed: https://www.theodinproject.com/lessons/nodejs-using-postgresql
const { Pool } = require('pg');

const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port:     process.env.DB_PORT,
});

const query = (text, params) => pool.query(text, params);

// Verify the database is reachable. Called once from server.js at startup.
const testConnection = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('PostgreSQL connected');
  } finally {
    client.release();
  }
};


 // Shutdown - loses all pool connections.

const closePool = () => pool.end();

module.exports = { query, testConnection, closePool, pool };