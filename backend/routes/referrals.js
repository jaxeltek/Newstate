// backend/routes/referrals.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const pool = require('../config/db');
const router = express.Router();

// Get referral stats - FROM DATABASE (Pending + Completed)
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Get user's referral code
    const userResult = await pool.query(
      'SELECT referral_code, username FROM users WHERE id = $1',
      [req.user.id]
    );
    
    // PENDING referrals (registered but NOT paid yet)
    const pendingResult = await pool.query(
      `SELECT 
         r.id, r.created_at,
         u.id as user_id, u.username, u.email, u.phone, u.created_at as joined_date
       FROM referrals r 
       JOIN users u ON r.referred_id = u.id 
       WHERE r.referrer_id = $1 
         AND r.status = 'pending'
         AND u.registration_paid = false
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    
    // COMPLETED referrals (paid)
    const completedResult = await pool.query(
      `SELECT 
         r.id, r.commission, r.payment_date,
         u.id as user_id, u.username, u.email, u.phone
       FROM referrals r 
       JOIN users u ON r.referred_id = u.id 
       WHERE r.referrer_id = $1 
         AND r.status = 'completed'
         AND u.registration_paid = true
       ORDER BY r.payment_date DESC`,
      [req.user.id]
    );
    
    // Calculate total earned
    const totalEarnedResult = await pool.query(
      `SELECT COALESCE(SUM(commission), 0) as total 
       FROM referrals 
       WHERE referrer_id = $1 AND status = 'completed'`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      referralCode: userResult.rows[0]?.referral_code,
      pending: pendingResult.rows,
      completed: completedResult.rows,
      totalPending: pendingResult.rows.length,
      totalCompleted: completedResult.rows.length,
      totalEarned: parseFloat(totalEarnedResult.rows[0]?.total || 0)
    });
  } catch (err) {
    console.error('Referral stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard - FROM DATABASE
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         u.id, u.username, u.total_earnings,
         COUNT(r.id) as referral_count
       FROM users u
       LEFT JOIN referrals r ON u.id = r.referrer_id AND r.status = 'completed'
       WHERE u.total_earnings > 0
       GROUP BY u.id, u.username, u.total_earnings
       ORDER BY u.total_earnings DESC
       LIMIT 20`
    );
    
    res.json({ success: true, leaderboard: result.rows });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;