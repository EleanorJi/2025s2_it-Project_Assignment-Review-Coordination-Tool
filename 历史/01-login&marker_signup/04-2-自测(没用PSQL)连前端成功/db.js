// db.js - 使用SQLite进行测试
const sqlite3 = require('sqlite3').verbose();

// 创建内存数据库（每次重启清空，适合测试）
const db = new sqlite3.Database(':memory:');

// 初始化数据库表
db.serialize(() => {
  // 创建users表
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('coordinator', 'marker')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  // 创建invitations表
  db.run(`CREATE TABLE invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`);

  // 插入一个测试coordinator用户
  db.run(`INSERT INTO users (email, name, password_hash, role, status)
          VALUES ('admin@grading.com', 'admin', 'admin123', 'coordinator', 'active')`);
});

// 包装query方法，使其返回Promise
module.exports = {
  query: (text, params) => {
    return new Promise((resolve, reject) => {
      db.all(text, params, (err, rows) => {
        if (err) reject(err);
        else resolve({ rows });
      });
    });
  }
};