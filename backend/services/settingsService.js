// backend/services/settingsService.js
const pool = require('../config/db');

class SettingsService {
  // Get a single setting value
  async getSetting(key) {
    const result = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = $1',
      [key]
    );
    return result.rows[0]?.setting_value || null;
  }

  // Get multiple settings at once
  async getSettings(keys) {
    const result = await pool.query(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1)',
      [keys]
    );
    
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    return settings;
  }

  // Get all settings
  async getAllSettings() {
    const result = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    return settings;
  }

  // Update a setting (admin only)
  async updateSetting(key, value, description = null) {
    if (description) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value, description, updated_at) 
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2, description = $3, updated_at = CURRENT_TIMESTAMP`,
        [key, value, description]
      );
    } else {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }
  }
}

module.exports = new SettingsService();