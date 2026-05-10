// frontend/js/auth.js
const API_BASE = 'http://localhost:5000/api';

// Helper functions
function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed top-20 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
    type === 'success' ? 'bg-green-500' : 'bg-red-500'
  } text-white`;
  toast.innerHTML = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Get referral code from sessionStorage (set by index.html)
function getReferralCode() {
  const code = sessionStorage.getItem('referral_code');
  console.log('📤 Retrieved referral code from sessionStorage:', code);
  return code;
}

// Clear referral code after use
function clearReferralCode() {
  sessionStorage.removeItem('referral_code');
  console.log('🗑️ Referral code cleared from sessionStorage');
}

// Switch between login and register tabs
function switchTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginTab.classList.add('bg-green-600', 'text-white');
    loginTab.classList.remove('text-gray-600');
    registerTab.classList.remove('bg-green-600', 'text-white');
    registerTab.classList.add('text-gray-600');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    registerTab.classList.add('bg-green-600', 'text-white');
    registerTab.classList.remove('text-gray-600');
    loginTab.classList.remove('bg-green-600', 'text-white');
    loginTab.classList.add('text-gray-600');
  }
}

// Handle Login
async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  
  if (!email || !password) {
    showToast('Please fill all fields', 'error');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Logging in...';
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      setToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      showToast('Login successful!');
      
      if (data.user.registration_paid === false) {
        window.location.href = 'activation.html';
      } else {
        window.location.href = 'dashboard.html';
      }
    } else {
      showToast(data.error, 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showToast('Login failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Login';
  }
}

// Handle Register - THIS IS WHERE REFERRAL CODE IS SENT
async function handleRegister() {
  const username = document.getElementById('regUsername').value;
  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;
  
  // Get referral code from sessionStorage
  const referral_code = getReferralCode();
  
  console.log('========================================');
  console.log('📝 REGISTRATION WITH REFERRAL');
  console.log('Username:', username);
  console.log('Email:', email);
  console.log('Phone:', phone);
  console.log('Referral code from session:', referral_code);
  console.log('========================================');
  
  const btn = document.getElementById('registerBtn');
  
  if (!username || !email || !phone || !password) {
    showToast('Please fill all fields', 'error');
    return;
  }
  
  const phoneRegex = /^(?:254|0)(7|1)\d{8}$/;
  if (!phoneRegex.test(phone)) {
    showToast('Please enter a valid Kenyan phone number', 'error');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating account...';
  
  try {
    const requestBody = { username, email, phone, password };
    
    // Only add referral_code if it exists and is valid
    if (referral_code && referral_code !== 'null' && referral_code !== 'undefined' && referral_code.trim() !== '') {
      requestBody.referral_code = referral_code.trim();
      console.log('✅ Adding referral_code to request:', requestBody.referral_code);
    } else {
      console.log('ℹ️ No referral code - first time user');
    }
    
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    if (data.success) {
      setToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Clear referral code after successful registration
      clearReferralCode();
      
      showToast(data.message);
      window.location.href = 'activation.html';
    } else {
      showToast(data.error, 'error');
    }
  } catch (error) {
    console.error('Registration error:', error);
    showToast('Registration failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Register';
  }
}

// Make functions global
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;