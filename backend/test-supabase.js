// backend/test-railway.js
require('dotenv').config();
const { Client } = require('pg');

async function testRailway() {
  console.log('\n========================================');
  console.log('🔍 TESTING RAILWAY CONNECTION');
  console.log('========================================\n');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Railway successfully!');
    
    const result = await client.query('SELECT NOW() as time, current_database() as db');
    console.log('   Time:', result.rows[0].time);
    console.log('   Database:', result.rows[0].db);
    
    await client.end();
    console.log('\n🎉 Railway is ready! Now create your tables.\n');
    
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

testRailway();