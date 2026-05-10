// backend/routes/wallet.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const pool = require('../config/db');
const { b2cPayment } = require('../utils/b2c');
const router = express.Router();

// ============================================
// WALLET BALANCE
// ============================================

// Get wallet balance - returns real calculated balance
router.get('/balance', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT wallet_balance, total_earnings, total_withdrawn FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const walletBalance = parseFloat(result.rows[0]?.wallet_balance || 0);
    const totalEarnings = parseFloat(result.rows[0]?.total_earnings || 0);
    const totalWithdrawn = parseFloat(result.rows[0]?.total_withdrawn || 0);
    
    // Verify the calculated balance matches (for debugging)
    const calculatedBalance = totalEarnings - totalWithdrawn;
    
    if (Math.abs(walletBalance - calculatedBalance) > 0.01) {
      console.warn(`Balance mismatch for user ${req.user.id}: DB=${walletBalance}, Calculated=${calculatedBalance}`);
      // Optionally fix it
      await pool.query(
        'UPDATE users SET wallet_balance = $1 WHERE id = $2',
        [calculatedBalance, req.user.id]
      );
    }
    
    res.json({
      success: true,
      balance: walletBalance,
      totalEarnings: totalEarnings,
      totalWithdrawn: totalWithdrawn
    });
  } catch (err) {
    console.error('Balance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// TRANSACTION HISTORY
// ============================================

router.get('/transactions', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, amount, status, description, created_at 
       FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      transactions: result.rows
    });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// EARNINGS HISTORY
// ============================================

router.get('/earnings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.username as referred_user 
       FROM earnings e
       JOIN referrals r ON e.referral_id = r.id
       JOIN users u ON r.referred_id = u.id
       WHERE e.user_id = $1
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      earnings: result.rows
    });
  } catch (err) {
    console.error('Earnings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// WITHDRAWAL HISTORY
// ============================================

router.get('/withdrawals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM withdrawals 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      withdrawals: result.rows
    });
  } catch (err) {
    console.error('Withdrawals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTOMATED WITHDRAWAL (No Admin Approval)
// ============================================

// backend/routes/wallet.js - Corrected withdrawal function

router.post('/withdraw', authenticate, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  // Validation
  if (!amount || amount < 300) {
    return res.status(400).json({ error: 'Minimum withdrawal amount is Ksh 300' });
  }

  if (amount > 50000) {
    return res.status(400).json({ error: 'Maximum withdrawal amount is Ksh 50,000' });
  }

  try {
    await pool.query('BEGIN');
    
    // Get user current balances
    const userResult = await pool.query(
      'SELECT wallet_balance, total_earnings, total_withdrawn, phone, username FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    
    const currentWalletBalance = parseFloat(userResult.rows[0]?.wallet_balance || 0);
    const totalEarnings = parseFloat(userResult.rows[0]?.total_earnings || 0);
    const totalWithdrawn = parseFloat(userResult.rows[0]?.total_withdrawn || 0);
    const userPhone = userResult.rows[0]?.phone;
    const username = userResult.rows[0]?.username;
    
    if (!userPhone) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ error: 'No phone number registered. Please update your profile.' });
    }
    
    if (currentWalletBalance < amount) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ error: `Insufficient balance. Available: Ksh ${currentWalletBalance}` });
    }
    
    // Calculate new balances
    const newWalletBalance = currentWalletBalance - amount;
    const newTotalWithdrawn = totalWithdrawn + amount;
    
    // Create withdrawal record
    const withdrawalResult = await pool.query(
      `INSERT INTO withdrawals (user_id, amount, phone, status) 
       VALUES ($1, $2, $3, 'processing')
       RETURNING id`,
      [userId, amount, userPhone]
    );
    
    const withdrawalId = withdrawalResult.rows[0].id;
    
    // Update user balances
    await pool.query(
      `UPDATE users 
       SET wallet_balance = $1,
           total_withdrawn = $2
       WHERE id = $3`,
      [newWalletBalance, newTotalWithdrawn, userId]
    );
    
    // Record transaction
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status, description) 
       VALUES ($1, 'withdrawal', $2, 'processing', 'Processing withdrawal to ${userPhone}')`,
      [userId, amount]
    );
    
    await pool.query('COMMIT');
    
    console.log(`📤 Processing withdrawal for ${username}: Ksh ${amount}`);
    console.log(`   Previous: Earnings: ${totalEarnings}, Withdrawn: ${totalWithdrawn}, Balance: ${currentWalletBalance}`);
    console.log(`   New: Balance: ${newWalletBalance}, Total Withdrawn: ${newTotalWithdrawn}`);
    
    // Process B2C payment
    try {
      const b2cResult = await b2cPayment(userPhone, amount, withdrawalId, userId);
      
      if (b2cResult && b2cResult.success) {
        // Update withdrawal as completed
        await pool.query(
          `UPDATE withdrawals 
           SET status = 'completed',
               transaction_id = $1,
               mpesa_conversation_id = $2,
               processed_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [b2cResult.conversationId, b2cResult.originatorConversationId, withdrawalId]
        );
        
        // Update transaction
        await pool.query(
          `UPDATE transactions 
           SET status = 'completed',
               description = $1,
               mpesa_receipt = $2
           WHERE user_id = $3 AND type = 'withdrawal' AND status = 'processing'
           ORDER BY created_at DESC LIMIT 1`,
          [`Withdrawal of Ksh ${amount} sent to ${userPhone}. Ref: ${b2cResult.conversationId}`, 
           b2cResult.conversationId, userId]
        );
        
        console.log(`✅ Withdrawal completed! Ksh ${amount} sent to ${userPhone}`);
        
        res.json({ 
          success: true, 
          message: `Ksh ${amount} has been sent to ${userPhone} successfully!`,
          transactionId: b2cResult.conversationId,
          withdrawalId: withdrawalId,
          newBalance: newWalletBalance
        });
      } else {
        throw new Error('B2C payment failed');
      }
      
    } catch (b2cError) {
      console.error('B2C error:', b2cError.message);
      
      // Refund the amount - reverse the changes
      await pool.query('BEGIN');
      await pool.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance + $1,
             total_withdrawn = total_withdrawn - $1
         WHERE id = $2`,
        [amount, userId]
      );
      await pool.query(
        `UPDATE withdrawals 
         SET status = 'failed', 
             rejection_reason = $1
         WHERE id = $2`,
        [b2cError.message, withdrawalId]
      );
      await pool.query(
        `UPDATE transactions 
         SET status = 'failed', 
             description = 'Withdrawal failed - amount refunded'
         WHERE user_id = $1 AND type = 'withdrawal' AND status = 'processing'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      await pool.query('COMMIT');
      
      // Get updated balance
      const refundResult = await pool.query(
        'SELECT wallet_balance FROM users WHERE id = $1',
        [userId]
      );
      const refundedBalance = refundResult.rows[0]?.wallet_balance || 0;
      
      res.status(500).json({ 
        error: b2cError.message,
        refunded: true,
        message: 'Withdrawal failed. Amount has been refunded to your wallet.',
        newBalance: refundedBalance
      });
    }
    
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Withdrawal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CANCEL WITHDRAWAL
// ============================================

router.post('/withdraw/cancel/:withdrawalId', authenticate, async (req, res) => {
  const withdrawalId = req.params.withdrawalId;
  const userId = req.user.id;
  
  try {
    await pool.query('BEGIN');
    
    const withdrawal = await pool.query(
      `SELECT * FROM withdrawals 
       WHERE id = $1 AND user_id = $2 AND status IN ('processing', 'pending')`,
      [withdrawalId, userId]
    );
    
    if (withdrawal.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal not found or cannot be cancelled' });
    }
    
    const wd = withdrawal.rows[0];
    
    await pool.query(
      'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
      [wd.amount, userId]
    );
    
    await pool.query(
      `UPDATE withdrawals 
       SET status = 'cancelled', 
           rejection_reason = 'Cancelled by user'
       WHERE id = $1`,
      [withdrawalId]
    );
    
    await pool.query(
      `UPDATE transactions 
       SET status = 'cancelled', 
           description = 'Withdrawal cancelled by user'
       WHERE user_id = $1 AND type = 'withdrawal' AND status IN ('processing', 'pending')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    
    await pool.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `Withdrawal of Ksh ${wd.amount} has been cancelled. Amount refunded to your wallet.` 
    });
    
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Cancel withdrawal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET SINGLE WITHDRAWAL STATUS
// ============================================

router.get('/withdraw/status/:withdrawalId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM withdrawals 
       WHERE id = $1 AND user_id = $2`,
      [req.params.withdrawalId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }
    
    res.json({ success: true, withdrawal: result.rows[0] });
  } catch (err) {
    console.error('Withdrawal status error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;