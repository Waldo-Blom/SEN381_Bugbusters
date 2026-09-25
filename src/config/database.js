// src/config/database.js
const { CivicConnect } = require('pg');
require('dotenv').config();

const db = new CivicConnect({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

module.exports = {
  query: (text, params) => db.query(text, params),
};