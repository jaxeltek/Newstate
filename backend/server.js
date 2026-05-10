const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./config/db');

dotenv.config();

const app = express();

// CORS configuration
app.use(cors({
  origin: true, // Allow all origins for testing
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running', timestamp: new Date().toISOString() });
});

// ============ ROUTES ============
console.log('\n📦 Loading routes...');

// Import routes
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const referralRoutes = require('./routes/referrals');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');

// Use routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/settings', require('./routes/settings'));

console.log('✅ All routes mounted');
console.log('   - /api/auth');
console.log('   - /api/payments');
console.log('   - /api/referrals');
console.log('   - /api/wallet');
console.log('   - /api/admin');
console.log('   - /api/settings');
// 404 handler
app.use('*', (req, res) => {
  console.log(`❌ 404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.url,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await pool.query('SELECT NOW()');
    console.log('\n✅ PostgreSQL connected');
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 Test: http://localhost:${PORT}/api/health\n`);
    });
  } catch (err) {
    console.error('❌ Database error:', err.message);
    process.exit(1);
  }
}

startServer();