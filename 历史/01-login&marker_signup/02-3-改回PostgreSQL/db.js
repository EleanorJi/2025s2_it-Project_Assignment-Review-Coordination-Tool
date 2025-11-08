// db.js - 数据库连接配置
const { Pool } = require('pg');

// 创建连接池（Pooling），这是最佳实践
const pool = new Pool({
  user: 'your_username', // ← 替换成队友给你的用户名
  host: 'localhost',     // ← 替换成数据库主机地址
  database: 'grading_system', // ← 替换成数据库名
  password: 'your_password', // ← 替换成密码
  port: 5432,            // Postgres默认端口
});

// 验证数据库连接是否成功
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// 导出一个简单的查询方法
module.exports = {
  query: (text, params) => pool.query(text, params),
};