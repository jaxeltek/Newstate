// backend/routes/payments.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { stkPush, formatPhoneNumber, queryTransactionStatus } = require('../utils/mpesa');
const pool = require('../config/db');
const router = express.Router();
const settingsService = require('../services/settingsService');

// Send STK Push for activation payment

   
   
router.post('/activate', authenticate, async (req, res) => {
  const { phone, amount = 300 } = req.body;
  const userId = req.user.id;

  console.log('\n========================================');
  console.log('📱 ACTIVATION PAYMENT REQUEST');
  console.log('User ID:', userId);
  console.log('Phone received:', phone);
  console.log('Amount:', amount);
  console.log('========================================\n');

  try {
    // Check if user exists and not activated
    const userResult = await pool.query(
      'SELECT id, username, registration_paid FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    if (user.registration_paid) {
      return res.status(400).json({ error: 'Account already activated' });
    }

    // Validate phone number
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const formattedPhone = formatPhoneNumber(phone);
    const accountRef = `ACT_${userId}_${Date.now()}`;
    
    console.log('📤 Sending STK Push to:', formattedPhone);
    console.log('💰 Amount:', amount);

    // Send STK Push via M-PESA
    const response = await stkPush(formattedPhone, amount, accountRef, 'Account Activation');
    
    // Check if STK Push was initiated successfully
    if (response.ResponseCode !== '0') {
      throw new Error(response.ResponseDescription || 'STK Push initiation failed');
    }

    // Save transaction record
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status, checkout_request_id, description) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, 'activation', amount, 'pending', response.CheckoutRequestID, 'Account activation payment via M-PESA']
    );

    console.log('✅ Transaction saved with ID:', response.CheckoutRequestID);
    console.log('📱 STK Push sent successfully!\n');

    res.json({
      success: true,
      message: 'STK Push sent! Check your phone for M-PESA prompt.',
      checkoutRequestId: response.CheckoutRequestID,
      responseCode: response.ResponseCode
    });
    
  } catch (error) {
    console.error('❌ Activation payment error:', error.message);
    res.status(500).json({ 
      error: error.message || 'Payment initiation failed'
    });
  }
});

// M-PESA Callback URL (where Safaricom sends payment confirmation)
router.post('/callback', async (req, res) => {
  console.log('\n📞 M-PESA Callback received');
  console.log('Callback body:', JSON.stringify(req.body, null, 2));
  
  try {
    const callbackData = req.body;
    const stkCallback = callbackData.Body?.stkCallback;
    
    if (!stkCallback) {
      console.log('No stkCallback in request');
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    console.log(`Callback for ${checkoutRequestId}: ResultCode=${resultCode}, ResultDesc=${resultDesc}`);

    if (resultCode === 0) {
      // Payment successful
      const items = stkCallback.CallbackMetadata?.Item || [];
      
      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
      const amount = parseFloat(items.find(i => i.Name === 'Amount')?.Value);
      const phone = items.find(i => i.Name === 'PhoneNumber')?.Value;
      const transactionDate = items.find(i => i.Name === 'TransactionDate')?.Value;

      console.log(`✅ Payment successful! Receipt: ${receipt}, Amount: ${amount}`);

      // Find pending transaction
      const txResult = await pool.query(
        'SELECT * FROM transactions WHERE checkout_request_id = $1 AND status = $2',
        [checkoutRequestId, 'pending']
      );

      if (txResult.rows.length > 0) {
        const transaction = txResult.rows[0];
        const userId = transaction.user_id;
        
        // Update transaction
        await pool.query(
          `UPDATE transactions 
           SET status = $1, mpesa_receipt = $2, description = $3 
           WHERE id = $4`,
          ['completed', receipt, `Payment completed on ${transactionDate}`, transaction.id]
        );

        // Activate user account
        await pool.query(
          `UPDATE users 
           SET registration_paid = true, 
               is_active = true, 
               payment_date = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [userId]
        );

        console.log(`✅ User ${userId} activated successfully`);

        // Check if user was referred and credit referrer
        const userResult = await pool.query(
          `SELECT u.referred_by, r.id as referral_id
           FROM users u
           LEFT JOIN referrals r ON r.referred_id = u.id AND r.status = 'pending'
           WHERE u.id = $1`,
          [userId]
        );

        const referrerId = userResult.rows[0]?.referred_by;
        const referralId = userResult.rows[0]?.referral_id;

        if (referrerId && referralId) {
          const commission = 120; // Ksh 120 commission
          
          // Update referrer's wallet
          await pool.query(
            `UPDATE users 
             SET wallet_balance = wallet_balance + $1, 
                 total_earnings = total_earnings + $1 
             WHERE id = $2`,
            [commission, referrerId]
          );

          // Update referral record
          await pool.query(
            `UPDATE referrals 
             SET status = 'completed', 
                 commission = $1, 
                 payment_status = 'completed',
                 payment_date = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [commission, referralId]
          );
          // Record earnings
          await pool.query(
         `INSERT INTO earnings (user_id, referral_id, amount, type) 
          VALUES ($1, $2, $3, 'commission')`,
          [referrerId, referralId, commission]
  );

          console.log(`💰 Commission credited: Ksh ${commission} to referrer ${referrerId}`);
        }
      } else {
        console.log(`No pending transaction found for ${checkoutRequestId}`);
      }
    } else {
      // Payment failed
      console.log(`❌ Payment failed: ${resultDesc}`);
      
      await pool.query(
        `UPDATE transactions 
         SET status = $1, description = $2 
         WHERE checkout_request_id = $3 AND status = $4`,
        ['failed', `Payment failed: ${resultDesc}`, checkoutRequestId, 'pending']
      );
    }

    // Always acknowledge receipt of callback
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    
  } catch (err) {
    console.error('❌ Callback processing error:', err);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});

// Check transaction status
router.get('/status/:checkoutRequestId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE checkout_request_id = $1 AND user_id = $2',
      [req.params.checkoutRequestId, req.user.id]
    );
    
    if (result.rows.length > 0) {
      res.json({ success: true, transaction: result.rows[0] });
    } else {
      // Query Safaricom for status
      const status = await queryTransactionStatus(req.params.checkoutRequestId);
      res.json({ success: true, transaction: null, mpesaStatus: status });
    }
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;