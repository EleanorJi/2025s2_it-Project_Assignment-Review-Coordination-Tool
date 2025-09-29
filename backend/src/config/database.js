const { Pool } = require('pg');

//console.log('database.js 加载时 DB_USER:', process.env.DB_USER ? '存在' : '不存在');
//console.log('database.js 加载时 DB_HOST:', process.env.DB_HOST ? '存在' : '不存在');
//console.log('database.js 加载时 DB_NAME:', process.env.DB_NAME ? '存在' : '不存在');
//console.log('database.js 加载时 DB_PASSWORD:', process.env.DB_PASSWORD ? '存在' : '不存在');
//console.log('database.js 加载时 DB_PORT:', process.env.DB_PORT ? '存在' : '不存在');

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