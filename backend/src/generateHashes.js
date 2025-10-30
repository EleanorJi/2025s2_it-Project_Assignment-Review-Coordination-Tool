// generateHashes.js
const { hashPassword } = require('./utils/passwordUtils');

async function generateHashes() {
  console.log('Generating bcrypt hashes for "12345678":');
  console.log('========================================');

  for (let i = 0; i < 8; i++) {
    const hashed = await hashPassword('12345678');
    console.log(`Hash ${i + 1}: ${hashed}`);
  }
}

generateHashes();