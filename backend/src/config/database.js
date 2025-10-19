const { Pool } = require('pg');

//console.log('database.js loading DB_USER:', process.env.DB_USER ? 'exists' : 'not found');
//console.log('database.js loading DB_HOST:', process.env.DB_HOST ? 'exists' : 'not found');
//console.log('database.js loading DB_NAME:', process.env.DB_NAME ? 'exists' : 'not found');
//console.log('database.js loading DB_PASSWORD:', process.env.DB_PASSWORD ? 'exists' : 'not found');
//console.log('database.js loading DB_PORT:', process.env.DB_PORT ? 'exists' : 'not found');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  pool: pool,
};