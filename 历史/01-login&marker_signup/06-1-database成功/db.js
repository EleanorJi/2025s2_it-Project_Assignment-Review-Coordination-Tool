// db.js - 数据库连接配置
const { Pool } = require('pg');

// 创建连接池（Pooling）
const pool = new Pool({
  user: 'postgres',            // 你的 PostgreSQL 用户名
  host: 'localhost',           // 数据库主机地址
  database: 'assignment_mod',  // 数据库名，和你在 pgAdmin 里建的一致
  password: '040104',          // 你的数据库密码
  port: 5432,                  // Postgres 默认端口
});

// 验证数据库连接是否成功
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// 导出查询方法
module.exports = {
  query: (text, params) => pool.query(text, params),
};