const db = require('../config/database');
const { hashPassword } = require('../utils/passwordUtils');

async function encryptExistingPasswords() {
  try {
    console.log('Starting password encryption migration...');
    
    // 获取所有用户
    const usersResult = await db.query('SELECT user_id, password_hash FROM app_user');
    const users = usersResult.rows;
    
    console.log(`Found ${users.length} users to process`);
    
    let processed = 0;
    let errors = 0;
    
    for (const user of users) {
      try {
        // 检查密码是否已经是加密的（bcrypt hash通常以$2a$、$2b$或$2y$开头）
        if (user.password_hash.startsWith('$2a$') || 
            user.password_hash.startsWith('$2b$') || 
            user.password_hash.startsWith('$2y$')) {
          console.log(`User ${user.user_id} password already encrypted, skipping...`);
          continue;
        }
        
        // 加密密码
        const hashedPassword = await hashPassword(user.password_hash);
        
        // 更新数据库
        await db.query(
          'UPDATE app_user SET password_hash = $1 WHERE user_id = $2',
          [hashedPassword, user.user_id]
        );
        
        console.log(`Encrypted password for user ${user.user_id}`);
        processed++;
        
      } catch (error) {
        console.error(`Error processing user ${user.user_id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`Migration completed. Processed: ${processed}, Errors: ${errors}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  encryptExistingPasswords()
    .then(() => {
      console.log('Password encryption migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Password encryption migration failed:', error);
      process.exit(1);
    });
}

module.exports = encryptExistingPasswords;
