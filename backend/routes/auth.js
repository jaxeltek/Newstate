// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { validateRegistration, validateLogin } = require('../middleware/validate');
const router = express.Router();

// Generate unique referral code
const generateReferralCode = () => {
  return 'REF' + Math.random().toString(36).substring(2, 10).toUpperCase();
};

// Format phone number to 254 format
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  
  let cleaned = phone.toString().replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }
  
  return cleaned;
};

// Register new user
router.post('/register', validateRegistration, async (req, res) => {
  const { username, email, phone, password, referral_code } = req.body;

  console.log('\n========================================');
  console.log('📝 REGISTRATION ATTEMPT');
  console.log('========================================');
  console.log('Username:', username);
  console.log('Email:', email);
  console.log('Phone:', phone);
  console.log('Referral code received:', referral_code || 'none');
  console.log('========================================\n');

  try {
    // Format phone number
    const formattedPhone = formatPhoneNumber(phone);

    // Check existing user
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 OR username = $3',
      [email.toLowerCase(), formattedPhone, username]
    );
    
    if (existing.rows.length > 0) {
      console.log('❌ User already exists');
      return res.status(400).json({ error: 'User already exists with this email, phone, or username' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = generateReferralCode();

    // ============================================
    // CHECK REFERRAL CODE (if provided)
    // ============================================
    let referredBy = null;
    if (referral_code && referral_code.trim() !== '') {
      console.log('🔍 Checking referral code:', referral_code.trim());
      
      const refUser = await pool.query(
        'SELECT id, username FROM users WHERE referral_code = $1',
        [referral_code.trim()]
      );
      
      if (refUser.rows.length > 0) {
        referredBy = refUser.rows[0].id;
        console.log(`✅ User ${username} referred by ${refUser.rows[0].username} (ID: ${referredBy})`);
      } else {
        console.log(`⚠️ Invalid referral code attempted: ${referral_code}`);
      }
    } else {
      console.log('ℹ️ No referral code provided - first time user');
    }

    // ============================================
    // INSERT USER
    // ============================================
    const result = await pool.query(
      `INSERT INTO users (username, email, phone, password, referral_code, referred_by, is_active, registration_paid) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, username, email, phone, referral_code, is_active, registration_paid, referred_by`,
      [username, email.toLowerCase(), formattedPhone, hashedPassword, referralCode, referredBy, false, false]
    );

    console.log(`✅ User inserted with ID: ${result.rows[0].id}`);

    // ============================================
    // CREATE PENDING REFERRAL RECORD (if referred)
    // THIS IS CRITICAL - Creates the referral relationship
    // ============================================
    if (referredBy) {
      await pool.query(
        `INSERT INTO referrals (referrer_id, referred_id, status, commission, payment_status) 
         VALUES ($1, $2, 'pending', 120.00, 'pending')`,
        [referredBy, result.rows[0].id]
      );
      console.log(`✅✅✅ PENDING REFERRAL RECORD CREATED: ${referredBy} -> ${result.rows[0].id}`);
      console.log(`   Referrer will see this in "Pending Referrals" until user pays`);
    } else {
      console.log('ℹ️ No referral record created (user not referred)');
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: result.rows[0].id, email: result.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Registration completed successfully\n');

    res.json({
      success: true,
      token,
      user: result.rows[0],
      message: referredBy ? 
        'Account created successfully! You were referred by a friend. Please pay Ksh 300 to activate.' : 
        'Account created successfully. Please pay Ksh 300 to activate and start earning.'
    });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login user
router.post('/login', validateLogin, async (req, res) => {
  const { email, password } = req.body;

  console.log('\n========================================');
  console.log('🔐 LOGIN ATTEMPT');
  console.log('========================================');
  console.log('Email:', email);
  console.log('========================================\n');

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;
    
    console.log(`✅ User logged in: ${user.username} (ID: ${user.id})`);
    console.log(`   Registration paid: ${user.registration_paid}`);
    console.log(`   Role: ${user.role || 'user'}\n`);

    res.json({
      success: true,
      token,
      user: userWithoutPassword,
      requires_activation: !user.registration_paid
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Get current user info
router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      `SELECT id, username, email, phone, role, is_active, registration_paid, 
              referral_code, wallet_balance, total_earnings, referred_by, created_at 
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('❌ Get user error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Check activation status
router.get('/check-activation', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, registration_paid FROM users WHERE id = $1',
      [decoded.id]
    );
    
    res.json({
      is_activated: result.rows[0]?.registration_paid || false
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;