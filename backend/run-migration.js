#!/usr/bin/env node

const encryptExistingPasswords = require('./src/migrations/encrypt_existing_passwords');

console.log('Running password encryption migration...');
console.log('WARNING: This will encrypt all existing passwords in the database.');
console.log('Make sure you have a backup before proceeding.');
console.log('');

// Prompt user for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Do you want to continue? (yes/no): ', async (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    try {
      await encryptExistingPasswords();
      console.log('Migration completed successfully!');
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  } else {
    console.log('Migration cancelled.');
  }
  
  rl.close();
  process.exit(0);
});
