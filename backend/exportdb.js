// backend/export-db.js
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');

// Try different possible PostgreSQL paths
const possiblePaths = [
  'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe',
  'C:\\Program Files (x86)\\PostgreSQL\\15\\bin\\pg_dump.exe',
  'C:\\Program Files (x86)\\PostgreSQL\\14\\bin\\pg_dump.exe',
];

let pgDumpPath = null;

for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath)) {
    pgDumpPath = testPath;
    break;
  }
}

if (!pgDumpPath) {
  console.error('❌ Could not find pg_dump.exe');
  console.log('Please install PostgreSQL or provide the correct path');
  process.exit(1);
}

console.log('✅ Found pg_dump at:', pgDumpPath);

// Ask for password
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter PostgreSQL password: ', (password) => {
  rl.close();
  
  // Use PGPASSWORD environment variable
  const command = `set PGPASSWORD=${password} && "${pgDumpPath}" -U postgres -d referral_db -h localhost > referral_db_backup.sql`;
  
  console.log('🔄 Exporting database...');
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Export failed:', error.message);
      if (error.message.includes('password')) {
        console.log('   Incorrect password. Please try again.');
      }
      return;
    }
    
    // Check if file was created
    if (fs.existsSync('referral_db_backup.sql')) {
      const stats = fs.statSync('referral_db_backup.sql');
      console.log(`✅ Database exported successfully to referral_db_backup.sql (${(stats.size / 1024).toFixed(2)} KB)`);
    } else {
      console.log('✅ Export completed, but file not found. Check for errors above.');
    }
  });
});