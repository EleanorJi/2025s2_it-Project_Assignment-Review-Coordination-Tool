// test/setup.js - Jest 测试环境设置
process.env.NODE_ENV = 'test';
process.env.DB_USER = 'postgres';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'test_database';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_PORT = '5432';

console.log('🧪 测试环境配置完成');
console.log('数据库:', process.env.DB_NAME);