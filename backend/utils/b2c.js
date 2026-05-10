// backend/utils/b2c.js
const axios = require('axios');
require('dotenv').config();

let accessToken = '';
let tokenExpiry = 0;

// Get OAuth token from Safaricom
const getAccessToken = async () => {
  if (Date.now() < tokenExpiry) return accessToken;

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  
  if (!consumerKey || !consumerSecret) {
    throw new Error('M-PESA credentials missing in .env file');
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  try {
    console.log('🔄 Fetching new access token for B2C...');
    
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + ((response.data.expires_in - 300) * 1000);
    
    console.log('✅ B2C Access token obtained successfully');
    return accessToken;
  } catch (error) {
    console.error('❌ Error getting B2C token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with M-PESA');
  }
};

// Format phone number to 254XXXXXXXX format
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
  
  console.log(`📞 B2C Phone formatted: ${phone} -> ${cleaned}`);
  return cleaned;
};

// Send B2C payment (Business to Customer)
const b2cPayment = async (phone, amount, withdrawalId, userId) => {
  console.log('\n========================================');
  console.log('💰 INITIATING B2C PAYOUT (M-PESA Withdrawal)');
  console.log('========================================');
  console.log(`   Withdrawal ID: ${withdrawalId}`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Phone: ${phone}`);
  console.log(`   Amount: Ksh ${amount}`);
  console.log('========================================\n');
  
  const token = await getAccessToken();
  const shortcode = process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE;
  const initiatorName = process.env.MPESA_INITIATOR_NAME;
  const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL;
  
  if (!shortcode || !initiatorName || !securityCredential) {
    throw new Error('B2C credentials missing in .env file');
  }
  
  const formattedPhone = formatPhoneNumber(phone);
  
  const payload = {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: 'BusinessPayment',
    Amount: Math.round(amount),
    PartyA: shortcode,
    PartyB: formattedPhone,
    Remarks: `Withdrawal payment for user ${userId}`,
    QueueTimeOutURL: process.env.MPESA_B2C_TIMEOUT_URL,
    ResultURL: process.env.MPESA_B2C_RESULT_URL,
    Occasion: `WITHDRAWAL_${withdrawalId}`
  };
  
  console.log('📤 Sending B2C Payment Request:');
  console.log(`   PartyA (Business): ${payload.PartyA}`);
  console.log(`   PartyB (Customer): ${payload.PartyB}`);
  console.log(`   Amount: Ksh ${payload.Amount}`);
  console.log(`   Initiator: ${payload.InitiatorName}`);
  console.log(`   Command ID: ${payload.CommandID}`);
  
  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
      payload,
      { 
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log('📥 B2C Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.ResponseCode !== '0') {
      throw new Error(response.data.ResponseDescription || 'B2C payment failed');
    }
    
    return {
      success: true,
      conversationId: response.data.ConversationID,
      originatorConversationId: response.data.OriginatorConversationID,
      responseCode: response.data.ResponseCode,
      responseDescription: response.data.ResponseDescription
    };
    
  } catch (error) {
    console.error('❌ B2C Payment Error:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
      throw new Error(error.response.data?.errorMessage || 'B2C payment request failed');
    } else {
      console.error('   Message:', error.message);
      throw new Error('Network error while sending B2C payment');
    }
  }
};

// Query B2C transaction status
const queryB2CStatus = async (conversationId) => {
  console.log(`🔍 Querying B2C transaction status for: ${conversationId}`);
  
  const token = await getAccessToken();
  const initiatorName = process.env.MPESA_INITIATOR_NAME;
  const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL;
  
  const payload = {
    Initiator: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: 'BusinessPayment',
    PartyA: process.env.MPESA_B2C_SHORTCODE,
    IdentifierType: '4',
    ResultURL: process.env.MPESA_B2C_RESULT_URL,
    TimeoutURL: process.env.MPESA_B2C_TIMEOUT_URL,
    QueueTimeOutURL: process.env.MPESA_B2C_TIMEOUT_URL,
    Remarks: 'Status query',
    Occasion: 'STATUS_QUERY',
    ConversationID: conversationId
  };
  
  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/querystatus',
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    return response.data;
  } catch (error) {
    console.error('B2C status query error:', error.response?.data || error.message);
    return null;
  }
};

module.exports = { b2cPayment, formatPhoneNumber, queryB2CStatus };