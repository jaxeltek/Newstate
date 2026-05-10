// backend/routes/admin.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const pool = require('../config/db');
const router = express.Router();

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Apply admin check to all admin routes
router.use(authenticate, isAdmin);

// ============================================
// DASHBOARD STATS - Main Overview
// ============================================
router.get('/stats', async (req, res) => {
  try {
    // Get total registered users (all time)
    const totalUsersResult = await pool.query('SELECT COUNT(*) FROM users');
    
    // Get active users (registration_paid = true)
    const activeUsersResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE registration_paid = true'
    );
    
    // Get pending users (registered but not paid)
    const pendingUsersResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE registration_paid = false'
    );
    
    // Get total referrals completed
    const totalReferralsResult = await pool.query(
      "SELECT COUNT(*) FROM referrals WHERE status = 'completed'"
    );
    
    // Get pending referrals (registered but not paid)
    const pendingReferralsResult = await pool.query(
      "SELECT COUNT(*) FROM referrals WHERE status = 'pending'"
    );
    
    // Get total earnings (all commissions paid out)
    const totalEarningsResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM earnings'
    );
    
    // Get total money collected from activation fees
    const totalCollectedResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = \'activation\' AND status = \'completed\''
    );
    
    // Get pending withdrawals
    const pendingWithdrawalsResult = await pool.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE status = 'pending'"
    );
    
    // Get approved withdrawals (paid out)
    const approvedWithdrawalsResult = await pool.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE status = 'completed'"
    );
    
    // Get total money in user wallets (unwithdrawn earnings)
    const walletBalanceResult = await pool.query(
      'SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users'
    );
    
    // Platform balance = (total collected) - (total paid out)
    const platformBalance = totalCollectedResult.rows[0].total - approvedWithdrawalsResult.rows[0].total;
    
    res.json({
      success: true,
      stats: {
        users: {
          total: parseInt(totalUsersResult.rows[0].count),
          active: parseInt(activeUsersResult.rows[0].count),
          pending: parseInt(pendingUsersResult.rows[0].count)
        },
        referrals: {
          total: parseInt(totalReferralsResult.rows[0].count),
          pending: parseInt(pendingReferralsResult.rows[0].count)
        },
        earnings: {
          total: parseFloat(totalEarningsResult.rows[0].total),
          collected: parseFloat(totalCollectedResult.rows[0].total)
        },
        withdrawals: {
          pending: {
            count: parseInt(pendingWithdrawalsResult.rows[0].count),
            total: parseFloat(pendingWithdrawalsResult.rows[0].total)
          },
          approved: {
            count: parseInt(approvedWithdrawalsResult.rows[0].count),
            total: parseFloat(approvedWithdrawalsResult.rows[0].total)
          }
        },
        platform: {
          balance: platformBalance,
          user_wallets: parseFloat(walletBalanceResult.rows[0].total)
        }
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// USERS MANAGEMENT
// ============================================
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         id, username, email, phone, 
         registration_paid, wallet_balance, total_earnings,
         referral_code, referred_by,
         created_at, payment_date
       FROM users 
       ORDER BY created_at DESC`
    );
    
    // For each user, get their referral count
    for (let user of result.rows) {
      const referralCount = await pool.query(
        "SELECT COUNT(*) FROM referrals WHERE referrer_id = $1 AND status = 'completed'",
        [user.id]
      );
      user.referral_count = parseInt(referralCount.rows[0].count);
    }
    
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         id, username, email, phone, 
         registration_paid, wallet_balance, total_earnings,
         referral_code, referred_by, created_at, payment_date
       FROM users 
       WHERE id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's referrals
    const referrals = await pool.query(
      `SELECT r.*, u.username as referred_name
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = $1`,
      [req.params.id]
    );
    
    // Get user's transactions
    const transactions = await pool.query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );
    
    res.json({
      success: true,
      user: result.rows[0],
      referrals: referrals.rows,
      transactions: transactions.rows
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update user status (activate/deactivate)
router.put('/users/:id/status', async (req, res) => {
  const { registration_paid } = req.body;
  try {
    await pool.query(
      'UPDATE users SET registration_paid = $1 WHERE id = $2',
      [registration_paid, req.params.id]
    );
    res.json({ success: true, message: 'User status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// TRANSACTIONS MANAGEMENT
// ============================================
router.get('/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.username, u.email 
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// REFERRALS MANAGEMENT
// ============================================
router.get('/referrals', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, 
              referrer.username as referrer_name,
              referred.username as referred_name
       FROM referrals r
       JOIN users referrer ON r.referrer_id = referrer.id
       LEFT JOIN users referred ON r.referred_id = referred.id
       ORDER BY r.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, referrals: result.rows });
  } catch (err) {
    console.error('Admin referrals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// WITHDRAWALS MANAGEMENT
// ============================================
router.get('/withdrawals', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, u.username, u.email, u.phone
       FROM withdrawals w
       JOIN users u ON w.user_id = u.id
       ORDER BY w.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, withdrawals: result.rows });
  } catch (err) {
    console.error('Admin withdrawals error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/withdrawals/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, u.username, u.email, u.phone
       FROM withdrawals w
       JOIN users u ON w.user_id = u.id
       WHERE w.status = 'pending'
       ORDER BY w.created_at ASC`
    );
    res.json({ success: true, withdrawals: result.rows });
  } catch (err) {
    console.error('Admin pending withdrawals error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/withdrawals/:id/approve', async (req, res) => {
  const withdrawalId = req.params.id;
  
  try {
    await pool.query('BEGIN');
    
    // Check if withdrawal exists and is pending
    const withdrawal = await pool.query(
      'SELECT * FROM withdrawals WHERE id = $1 AND status = "pending"',
      [withdrawalId]
    );
    
    if (withdrawal.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal not found or already processed' });
    }
    
    // Update withdrawal status
    await pool.query(
      'UPDATE withdrawals SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['approved', withdrawalId]
    );
    
    // Update transaction status
    await pool.query(
      `UPDATE transactions 
       SET status = 'completed', description = 'Withdrawal approved' 
       WHERE user_id = $1 AND type = 'withdrawal' AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [withdrawal.rows[0].user_id]
    );
    
    await pool.query('COMMIT');
    
    res.json({ success: true, message: 'Withdrawal approved successfully' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Approve withdrawal error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const { reason } = req.body;
  const withdrawalId = req.params.id;
  
  try {
    await pool.query('BEGIN');
    
    const withdrawal = await pool.query(
      'SELECT * FROM withdrawals WHERE id = $1 AND status = "pending"',
      [withdrawalId]
    );
    
    if (withdrawal.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal not found or already processed' });
    }
    
    const wd = withdrawal.rows[0];
    
    // Refund the amount back to user's wallet
    await pool.query(
      'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
      [wd.amount, wd.user_id]
    );
    
    // Update withdrawal status
    await pool.query(
      'UPDATE withdrawals SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['rejected', reason || 'No reason provided', withdrawalId]
    );
    
    // Update transaction status
    await pool.query(
      `UPDATE transactions 
       SET status = 'failed', description = $1 
       WHERE user_id = $2 AND type = 'withdrawal' AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [`Withdrawal rejected: ${reason || 'No reason provided'}`, wd.user_id]
    );
    
    await pool.query('COMMIT');
    
    res.json({ success: true, message: 'Withdrawal rejected and amount refunded' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Reject withdrawal error:', err);
    res.status(500).json({ error: err.message });
  }
});
   // ============================================
// ADMIN WITHDRAWAL PROCESSING
// ============================================

// Get all withdrawals (pending, approved, rejected)
router.get('/withdrawals/all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, u.username, u.email, u.phone
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      ORDER BY w.created_at DESC
      LIMIT 200
    `);
    res.json({ success: true, withdrawals: result.rows });
  } catch (err) {
    console.error('Admin withdrawals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Process withdrawal (admin sends money to user)
router.post('/withdrawals/:id/process', async (req, res) => {
  const withdrawalId = req.params.id;
  const adminId = req.user.id;
  const { transaction_reference, notes } = req.body;
  
  try {
    await pool.query('BEGIN');
    
    // Get withdrawal details
    const withdrawal = await pool.query(
      `SELECT * FROM withdrawals WHERE id = $1 AND status = 'approved'`,
      [withdrawalId]
    );
    
    if (withdrawal.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal not found or not approved' });
    }
    
    const wd = withdrawal.rows[0];
    
    // Update withdrawal as processed
    await pool.query(
      `UPDATE withdrawals 
       SET admin_processed = true, 
           processed_by = $1, 
           transaction_id = $2,
           processed_at = CURRENT_TIMESTAMP,
           notes = $3
       WHERE id = $4`,
      [adminId, transaction_reference || `ADMIN_${Date.now()}`, notes || null, withdrawalId]
    );
    
    // Update transaction status
    await pool.query(
      `UPDATE transactions 
       SET status = 'completed', 
           description = $1,
           mpesa_receipt = $2
       WHERE user_id = $3 AND type = 'withdrawal' AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [`Withdrawal processed by admin. Reference: ${transaction_reference}`, transaction_reference, wd.user_id]
    );
    
    await pool.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Withdrawal marked as processed. Money has been sent to user.' 
    });
    
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Process withdrawal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk approve withdrawals
router.post('/withdrawals/bulk-approve', async (req, res) => {
  const { withdrawal_ids } = req.body;
  
  if (!withdrawal_ids || withdrawal_ids.length === 0) {
    return res.status(400).json({ error: 'No withdrawal IDs provided' });
  }
  
  try {
    await pool.query('BEGIN');
    
    for (const id of withdrawal_ids) {
      await pool.query(
        `UPDATE withdrawals 
         SET status = 'approved', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status = 'pending'`,
        [id]
      );
    }
    
    await pool.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `${withdrawal_ids.length} withdrawal(s) approved successfully` 
    });
    
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Bulk approve error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get withdrawal statistics
router.get('/withdrawals/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_total,
        COUNT(CASE WHEN status = 'approved' AND admin_processed = false THEN 1 END) as approved_count,
        COALESCE(SUM(CASE WHEN status = 'approved' AND admin_processed = false THEN amount ELSE 0 END), 0) as approved_total,
        COUNT(CASE WHEN status = 'approved' AND admin_processed = true THEN 1 END) as processed_count,
        COALESCE(SUM(CASE WHEN status = 'approved' AND admin_processed = true THEN amount ELSE 0 END), 0) as processed_total,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
      FROM withdrawals
    `);
    
    res.json({ success: true, stats: result.rows[0] });
  } catch (err) {
    console.error('Withdrawal stats error:', err);
    res.status(500).json({ error: err.message });
  }
});
// ============================================
// SETTINGS MANAGEMENT
// ============================================
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings ORDER BY setting_key');
    res.json({ success: true, settings: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/:key', async (req, res) => {
  const { key } = req.params;
  const { value, description } = req.body;
  
  try {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description, updated_at) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = $2, description = $3, updated_at = CURRENT_TIMESTAMP`,
      [key, value, description || null]
    );
    res.json({ success: true, message: 'Setting updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;