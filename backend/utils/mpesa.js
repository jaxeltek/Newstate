// backend/utils/mpesa.js
const axios = require('axios');
require('dotenv').config();

let accessToken = '';
let tokenExpiry = 0;

// Get OAuth token from Safaricom
const getAccessToken = async () => {
  // Check if token is still valid (with 5 minute buffer)
  if (Date.now() < tokenExpiry) {
    console.log('✅ Using cached access token');
    return accessToken;
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  
  if (!consumerKey || !consumerSecret) {
    throw new Error('M-PESA credentials missing in .env file');
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  try {
    console.log('🔄 Fetching new access token from Safaricom...');
    
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { 
        headers: { 
          Authorization: `Basic ${auth}` 
        },
        timeout: 10000
      }
    );

    accessToken = response.data.access_token;
    // Set expiry to 1 hour minus 5 minutes for safety
    tokenExpiry = Date.now() + ((response.data.expires_in - 300) * 1000);
    
    console.log('✅ M-PESA access token obtained successfully');
    console.log(`   Token expires at: ${new Date(tokenExpiry).toLocaleTimeString()}`);
    
    return accessToken;
  } catch (error) {
    console.error('❌ Error getting M-PESA token:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
      
      if (error.response.status === 401) {
        throw new Error('Invalid Consumer Key or Consumer Secret. Please check your credentials.');
      }
    } else {
      console.error('   Message:', error.message);
    }
    throw new Error('Failed to authenticate with M-PESA');
  }
};

// Format phone number to 254XXXXXXXX format (required by M-PESA API)
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  
  // Remove any non-digit characters
  let cleaned = phone.toString().replace(/\D/g, '');
  
  // Remove leading 0 or +254
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }
  
  // Validate length (should be 12 digits for 254 format)
  if (cleaned.length !== 12) {
    console.warn(`⚠️ Warning: Phone number ${cleaned} has ${cleaned.length} digits, expected 12`);
  }
  
  console.log(`📞 Phone formatted: ${phone} -> ${cleaned}`);
  return cleaned;
};

// Send STK Push to customer's phone
const stkPush = async (phone, amount, accountReference, transactionDesc = 'Payment') => {
  console.log('\n========================================');
  console.log('📤 INITIATING STK PUSH');
  console.log('========================================');
  
  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;
  
  if (!shortcode || !passkey) {
    throw new Error('M-PESA shortcode or passkey missing in .env file');
  }
  
  if (!callbackUrl) {
    throw new Error('M-PESA callback URL missing in .env file. Please set MPESA_CALLBACK_URL');
  }
  
  // Generate timestamp in format YYYYMMDDHHmmss
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  
  // Generate password (Base64 encoded string of shortcode + passkey + timestamp)
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(amount),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: accountReference.substring(0, 12),
    TransactionDesc: transactionDesc.substring(0, 13)
  };

  console.log('📋 STK Push Details:');
  console.log(`   Phone: ${phone}`);
  console.log(`   Amount: Ksh ${amount}`);
  console.log(`   Reference: ${accountReference}`);
  console.log(`   Callback URL: ${callbackUrl}`);
  console.log(`   Timestamp: ${timestamp}`);

  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      payload,
      { 
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log('📥 STK Push Response:');
    console.log(`   Response Code: ${response.data.ResponseCode}`);
    console.log(`   Response Desc: ${response.data.ResponseDescription}`);
    console.log(`   Checkout Request ID: ${response.data.CheckoutRequestID}`);
    console.log('========================================\n');
    
    return response.data;
  } catch (error) {
    console.error('❌ STK Push Error:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
      throw new Error(error.response.data?.errorMessage || 'STK Push request failed');
    } else {
      console.error(`   Message: ${error.message}`);
      throw new Error('Network error while sending STK Push');
    }
  }
};

// Query transaction status
const queryTransactionStatus = async (checkoutRequestId) => {
  console.log(`🔍 Querying transaction status for: ${checkoutRequestId}`);
  
  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId
  };

  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      payload,
      { 
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    console.log(`📊 Query Response: ${response.data.ResultCode} - ${response.data.ResultDesc}`);
    return response.data;
  } catch (error) {
    console.error('❌ Query Error:', error.response?.data || error.message);
    return null;
  }
};

module.exports = { 
  stkPush, 
  formatPhoneNumber, 
  getAccessToken,
  queryTransactionStatus 
};