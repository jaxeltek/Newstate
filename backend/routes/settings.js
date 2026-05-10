// backend/routes/settings.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const settingsService = require('../services/settingsService');
const pool = require('../config/db');
const router = express.Router();

// Get all settings (public - safe for frontend)
router.get('/public', async (req, res) => {
  try {
    // Only return non-sensitive settings
    const publicKeys = [
      'activation_fee', 
      'referral_commission', 
      'min_withdrawal',
      'site_name',
      'site_description'
    ];
    
    const settings = await settingsService.getSettings(publicKeys);
    res.json({ success: true, settings });
  } catch (err) {
    console.error('Error fetching public settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all settings (admin only)
router.get('/all', authenticate, async (req, res) => {
  try {
    // Check if user is admin (you need to add role check)
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const settings = await settingsService.getAllSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update setting (admin only)
router.put('/:key', authenticate, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { key } = req.params;
    const { value, description } = req.body;
    
    await settingsService.updateSetting(key, value, description);
    res.json({ success: true, message: 'Setting updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;