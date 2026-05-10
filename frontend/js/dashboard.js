// frontend/js/dashboard.js
// Use the existing API_BASE from HTML - don't redeclare with const/let
// API_BASE is already defined in the HTML
// Fetch settings from backend
async function loadSettings() {
  try {
    const response = await fetch(`${API_BASE}/settings/public`);
    const data = await response.json();
    
    if (data.success) {
      // Store settings globally
      window.appSettings = data.settings;
      
      // Update UI with dynamic values
      const commissionEl = document.querySelector('.referral-commission');
      if (commissionEl) {
        commissionEl.textContent = `Ksh ${data.settings.referral_commission}`;
      }
      
      const activationFeeEl = document.querySelector('.activation-fee');
      if (activationFeeEl) {
        activationFeeEl.textContent = `Ksh ${data.settings.activation_fee}`;
      }
      
      return data.settings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    // Fallback to hardcoded values
    return {
      activation_fee: '300',
      referral_commission: '120',
      min_withdrawal: '300'
    };
  }
}

// Call this when pages load
loadSettings();

if (typeof API_BASE === 'undefined') {
  var API_BASE = 'http://localhost:5000/api';
}

function getToken() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
    return null;
  }
  return token;
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

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-KE') + ' ' + date.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

function formatMoney(amount) {
  return `Ksh ${parseFloat(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

async function loadWalletBalance() {
  try {
    const response = await fetch(`${API_BASE}/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Update wallet balance display
      document.getElementById('walletBalance').innerHTML = formatMoney(data.balance);
      document.getElementById('totalEarnings').innerHTML = formatMoney(data.totalEarnings);
      
      // Optionally show total withdrawn
      const withdrawnEl = document.getElementById('totalWithdrawn');
      if (withdrawnEl) {
        withdrawnEl.innerHTML = formatMoney(data.totalWithdrawn);
      }
      
      console.log(`Wallet: ${data.balance}, Earnings: ${data.totalEarnings}, Withdrawn: ${data.totalWithdrawn}`);
    }
  } catch (error) {
    console.error('Balance error:', error);
  }
}
async function loadReferralStats() {
  try {
    const response = await fetch(`${API_BASE}/referrals/stats`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    console.log('Referral data:', data);
    
    if (data.success) {
      // Update referral link
      const referralLinkInput = document.getElementById('referralLink');
      if (referralLinkInput) {
        const referralLink = `${window.location.origin}/index.html?ref=${data.referralCode}`;
        referralLinkInput.value = referralLink;
      }
      
      // Update counts
      const pendingCountEl = document.getElementById('pendingCount');
      const completedCountEl = document.getElementById('completedCount');
      const totalReferralsEl = document.getElementById('totalReferrals');
      const totalEarningsEl = document.getElementById('totalEarnings');
      
      if (pendingCountEl) pendingCountEl.textContent = data.totalPending || 0;
      if (completedCountEl) completedCountEl.textContent = data.totalCompleted || 0;
      if (totalReferralsEl) totalReferralsEl.textContent = data.totalCompleted || 0;
      if (totalEarningsEl) totalEarningsEl.textContent = formatMoney(data.totalEarned);
      
      // Update referrals table
      const tbody = document.getElementById('referralsTable');
      if (!tbody) {
        console.warn('referralsTable element not found in HTML');
        return;
      }
      
      tbody.innerHTML = '';
      
      // Show pending referrals
      if (data.pending && data.pending.length > 0) {
        data.pending.forEach(ref => {
          tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
              <td class="px-4 py-3">${ref.username || 'N/A'}</td>
              <td class="px-4 py-3">${ref.email || '-'}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">
                  Pending Payment
                </span>
              </td>
              <td class="px-4 py-3">-</td>
              <td class="px-4 py-3 text-sm">${formatDate(ref.created_at)}</td>
            </tr>
          `;
        });
      }
      
      // Show completed referrals
      if (data.completed && data.completed.length > 0) {
        data.completed.forEach(ref => {
          tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
              <td class="px-4 py-3">${ref.username || 'N/A'}</td>
              <td class="px-4 py-3">${ref.email || '-'}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                  Completed
                </span>
              </td>
              <td class="px-4 py-3 font-semibold text-green-600">${formatMoney(ref.commission)}</td>
              <td class="px-4 py-3 text-sm">${formatDate(ref.payment_date)}</td>
            </tr>
          `;
        });
      }
      
      // Show message if no referrals
      if ((!data.pending || data.pending.length === 0) && 
          (!data.completed || data.completed.length === 0)) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-8 text-gray-500">
              No referrals yet. Share your referral link to start earning!
            </td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error('Referral stats error:', error);
  }
}

async function loadTransactions() {
  try {
    const response = await fetch(`${API_BASE}/wallet/transactions`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (data.success) {
      const tbody = document.getElementById('transactionsTable');
      if (!tbody) {
        console.warn('transactionsTable element not found');
        return;
      }
      
      tbody.innerHTML = '';
      
      if (data.transactions && data.transactions.length > 0) {
        data.transactions.slice(0, 10).forEach(tx => {
          const statusColor = tx.status === 'completed' ? 'text-green-600' : 
                             tx.status === 'pending' ? 'text-yellow-600' : 'text-red-600';
          tbody.innerHTML += `
            <tr class="border-b">
              <td class="px-4 py-2">${formatDate(tx.created_at)}</td>
              <td class="px-4 py-2 capitalize">${tx.type}</td>
              <td class="px-4 py-2 font-semibold">${formatMoney(tx.amount)}</td>
              <td class="px-4 py-2 ${statusColor} capitalize">${tx.status}</td>
            </tr>
          `;
        });
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-8 text-gray-500">No transactions yet</td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error('Transactions error:', error);
  }
}

async function loadEarnings() {
  try {
    const response = await fetch(`${API_BASE}/wallet/earnings`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (data.success) {
      const tbody = document.getElementById('earningsTable');
      if (!tbody) {
        console.warn('earningsTable element not found');
        return;
      }
      
      tbody.innerHTML = '';
      
      if (data.earnings && data.earnings.length > 0) {
        data.earnings.forEach(earning => {
          tbody.innerHTML += `
            <tr class="border-b">
              <td class="px-4 py-2">${formatDate(earning.created_at)}</td>
              <td class="px-4 py-2">${earning.referred_user || 'User'}</td>
              <td class="px-4 py-2 text-green-600 font-semibold">${formatMoney(earning.amount)}</td>
            </tr>
          `;
        });
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center py-8 text-gray-500">No earnings yet</td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error('Earnings error:', error);
  }
}

async function loadWithdrawals() {
  try {
    const response = await fetch(`${API_BASE}/wallet/withdrawals`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
      const tbody = document.getElementById('withdrawalHistoryTable');
      if (tbody) {
        tbody.innerHTML = '';
        
        if (data.withdrawals && data.withdrawals.length > 0) {
          data.withdrawals.forEach(wd => {
            let statusColor = '';
            let statusText = '';
            
            switch(wd.status) {
              case 'pending':
                statusColor = 'text-yellow-600';
                statusText = 'Pending Approval';
                break;
              case 'processing':
                statusColor = 'text-blue-600';
                statusText = 'Processing...';
                break;
              case 'completed':
                statusColor = 'text-green-600';
                statusText = 'Completed';
                break;
              case 'failed':
                statusColor = 'text-red-600';
                statusText = 'Failed';
                break;
              case 'cancelled':
                statusColor = 'text-gray-600';
                statusText = 'Cancelled';
                break;
              default:
                statusColor = 'text-gray-600';
                statusText = wd.status;
            }
            
            tbody.innerHTML += `
              <tr class="border-b">
                <td class="px-4 py-2">${formatDate(wd.created_at)}</td>
                <td class="px-4 py-2 font-semibold">${formatMoney(wd.amount)}</td>
                <td class="px-4 py-2 ${statusColor} capitalize">${statusText}</td>
                ${wd.transaction_id ? `<td class="px-4 py-2 text-xs text-gray-500">${wd.transaction_id}</td>` : ''}
              </tr>
            `;
          });
        } else {
          tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-gray-500">No withdrawal requests yet</td></tr>';
        }
      }
    }
  } catch (error) {
    console.error('Withdrawals error:', error);
  }
}
async function loadLeaderboard() {
  try {
    const response = await fetch(`${API_BASE}/referrals/leaderboard`);
    const data = await response.json();
    
    if (data.success) {
      const container = document.getElementById('leaderboardList');
      if (!container) {
        console.warn('leaderboardList element not found');
        return;
      }
      
      container.innerHTML = '';
      
      if (data.leaderboard && data.leaderboard.length > 0) {
        data.leaderboard.forEach((user, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          container.innerHTML += `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-2">
              <div class="flex items-center gap-3">
                <span class="text-2xl">${medal}</span>
                <div>
                  <p class="font-semibold">${user.username}</p>
                  <p class="text-sm text-gray-500">${user.referral_count || 0} referrals</p>
                </div>
              </div>
              <p class="font-bold text-green-600">${formatMoney(user.total_earnings)}</p>
            </div>
          `;
        });
      } else {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">No leaders yet. Be the first!</p>';
      }
    }
  } catch (error) {
    console.error('Leaderboard error:', error);
  }
}

// frontend/js/dashboard.js - Add this function

async function requestWithdrawal() {
  const amountInput = document.getElementById('withdrawAmount');
  const amount = amountInput ? amountInput.value : null;
  
  if (!amount || amount < 300) {
    showToast('Minimum withdrawal amount is Ksh 300', 'error');
    return;
  }
  
  if (amount > 50000) {
    showToast('Maximum withdrawal amount is Ksh 50,000 per request', 'error');
    return;
  }
  
  const token = getToken();
  if (!token) {
    showToast('Please login first', 'error');
    window.location.href = 'index.html';
    return;
  }
  
  const button = document.getElementById('withdrawBtn');
  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
  
  try {
    const response = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount: parseFloat(amount) })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(`✅ ${data.message}`, 'success');
      if (amountInput) amountInput.value = '';
      // Refresh dashboard to show updated balance
      setTimeout(() => {
        loadDashboard();
      }, 2000);
    } else {
      showToast(`❌ ${data.error}`, 'error');
      if (data.refunded) {
        showToast('Amount has been refunded to your wallet.', 'info');
      }
    }
  } catch (error) {
    console.error('Withdrawal error:', error);
    showToast('Withdrawal failed. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

// Update loadWalletBalance to show pending processing withdrawals
async function loadWalletBalance() {
  try {
    const response = await fetch(`${API_BASE}/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
      document.getElementById('walletBalance').innerHTML = formatMoney(data.balance);
      document.getElementById('totalEarnings').innerHTML = formatMoney(data.totalEarnings);
    }
  } catch (error) {
    console.error('Balance error:', error);
  }
}
function copyReferralLink() {
  const linkInput = document.getElementById('referralLink');
  if (linkInput && linkInput.value) {
    navigator.clipboard.writeText(linkInput.value);
    showToast('Referral link copied to clipboard!');
  }
}

function shareReferral() {
  const linkInput = document.getElementById('referralLink');
  if (linkInput && linkInput.value && navigator.share) {
    navigator.share({
      title: 'Join Refer & Earn',
      text: 'Join me on this amazing referral program and start earning!',
      url: linkInput.value
    });
  } else if (linkInput && linkInput.value) {
    copyReferralLink();
  }
}

function showSection(section) {
  const sections = ['overview', 'referrals', 'earnings', 'withdrawals', 'leaderboard'];
  sections.forEach(s => {
    const el = document.getElementById(`${s}Section`);
    if (el) el.classList.add('hidden');
  });
  
  const sectionEl = document.getElementById(`${section}Section`);
  if (sectionEl) sectionEl.classList.remove('hidden');
  
  const titles = {
    overview: 'Dashboard Overview',
    referrals: 'My Referrals',
    earnings: 'Earnings History',
    withdrawals: 'Withdrawals',
    leaderboard: 'Leaderboard'
  };
  
  const titleEl = document.getElementById('sectionTitle');
  if (titleEl) titleEl.textContent = titles[section] || 'Dashboard';
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('active');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

async function loadDashboard() {
  await loadWalletBalance();
  await loadReferralStats();
  await loadTransactions();
  await loadEarnings();
  await loadWithdrawals();
  await loadLeaderboard();
}

// Load user name
const user = JSON.parse(localStorage.getItem('user') || '{}');
const userNameEl = document.getElementById('userName');
if (userNameEl) userNameEl.textContent = user.username || 'User';

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  if (!getToken()) return;
  loadDashboard();
  // Attach withdrawal button event listener
  const withdrawBtn = document.getElementById('withdrawBtn');
  if (withdrawBtn) {
    // Remove any existing listeners to avoid duplicates
    const newBtn = withdrawBtn.cloneNode(true);
    withdrawBtn.parentNode.replaceChild(newBtn, withdrawBtn);
    newBtn.addEventListener('click', requestWithdrawal);
    console.log('Withdrawal button event attached');
  } else {
    console.warn('Withdrawal button not found in DOM');
  }
});

// Make functions globally available
window.copyReferralLink = copyReferralLink;
window.shareReferral = shareReferral;
window.requestWithdrawal = requestWithdrawal;
window.showSection = showSection;
window.toggleSidebar = toggleSidebar;
window.logout = logout;