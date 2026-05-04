// backend/config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Required for Railway
  },
  connectionTimeoutMillis: 30000,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Railway connection error:', err.message);
  } else {
    console.log('✅ Connected to Railway PostgreSQL successfully');
    release();
  }
});

module.exports = pool;