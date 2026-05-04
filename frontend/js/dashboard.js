// Check authentication
if (!getToken()) {
  window.location.href = 'index.html';
}

let currentSection = 'overview';

async function loadDashboard() {
  try {
    await Promise.all([
      loadWalletBalance(),
      loadReferralStats(),
      loadTransactions(),
      loadEarnings(),
      loadWithdrawals(),
      loadLeaderboard()
    ]);
  } catch (error) {
    showToast('Error loading dashboard', 'error');
  }
}

async function loadWalletBalance() {
  const response = await fetch(`${API_BASE}/wallet/balance`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const data = await response.json();
  
  if (data.success) {
    document.getElementById('walletBalance').innerHTML = formatMoney(data.balance);
    document.getElementById('totalEarnings').innerHTML = formatMoney(data.totalEarnings);
  }
}
//update the loadReferralStats function
async function loadReferralStats() {
  const response = await fetch(`${API_BASE}/referrals/stats`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const data = await response.json();
  
  if (data.success) {
    //show referral link
    const referralLink = `${window.location.origin}/index.html?ref=${data.referralCode}`;

    console.log('Referral link generated:', referralLink);  // Debug: check what's being generated
    console.log('Origin:', window.location.origin);
    console.log('Referral code:', data.referralCode);
    
    document.getElementById('referralLink').value = referralLink;
    //update stats
    document.getElementById('totalReferrals').textContent = data.totalCompleted;
    document.getElementById('pendingCount').textContent = data.totalPending;
    document.getElementById('completedCount').textContent = data.totalCompleted;
    
    // show pending referrals first
    if (data.pending.length > 0) {
      data.pending.forEach(ref => {
      tbody.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="px-4 py-3">${ref.username}</td>
          <td class="px-4 py-3">${ref.email || '-'}</td>
          <td class="px-4 py-3">
            <span class="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">
              <i class="fas fa-clock mr-1"></i> Pending Payment
              </span>
          </td>
          <td class="px-4 py-3">-</td>
          <td class="px-4 py-3 text-sm">${formatDate(ref.joined_date)}</td>
        </tr>
      `;
    });
    }
     //show completed referrals
     data.completed.forEach(ref => {
      tbody.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="px-4 py-3">${ref.username}</td>
          <td class="px-4 py-3">${ref.email || '-'}</td>
          <td class="px-4 py-3">
            <span class="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
              <i class="fas fa-check mr-1"></i> Completed
            </span>
          </td>
          <td class="px-4 py-3">${formatMoney(ref.commission)}</td>
          <td class="px-4 py-3 text-sm">${formatDate(ref.created_at)}</td>
        </tr>
      `;
    });
  }
}


async function loadTransactions() {
  const response = await fetch(`${API_BASE}/wallet/transactions`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const data = await response.json();
  
  if (data.success) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = '';
    data.transactions.slice(0, 10).forEach(tx => {
      const statusColor = tx.status === 'completed' ? 'text-green-600' : tx.status === 'pending' ? 'text-yellow-600' : 'text-red-600';
      tbody.innerHTML += `
        <tr class="border-b">
          <td class="px-4 py-2">${formatDate(tx.created_at)}</td>
          <td class="px-4 py-2 capitalize">${tx.type}</td>
          <td class="px-4 py-2 font-semibold">${formatMoney(tx.amount)}</td>
          <td class="px-4 py-2 ${statusColor} capitalize">${tx.status}</td>
        </tr>
      `;
    });
  }
}

async function loadEarnings() {
  const response = await fetch(`${API_BASE}/wallet/earnings`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const data = await response.json();
  
  if (data.success) {
    const tbody = document.getElementById('earningsTable');
    tbody.innerHTML = '';
    data.earnings.forEach(earning => {
      tbody.innerHTML += `
        <tr class="border-b">
          <td class="px-4 py-2">${formatDate(earning.created_at)}</td>
          <td class="px-4 py-2">${earning.referred_user || 'User'}</td>
          <td class="px-4 py-2 text-green-600 font-semibold">${formatMoney(earning.amount)}</td>
        </tr>
      `;
    });
  }
}

async function loadWithdrawals() {
  const response = await fetch(`${API_BASE}/wallet/withdrawals`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const data = await response.json();
  
  if (data.success) {
    const pending = data.withdrawals.filter(w => w.status === 'pending').length;
    document.getElementById('pendingWithdrawals').textContent = pending;
    
    const tbody = document.getElementById('withdrawalHistoryTable');
    tbody.innerHTML = '';
    data.withdrawals.slice(0, 10).forEach(wd => {
      const statusColor = wd.status === 'approved' ? 'text-green-600' : wd.status === 'pending' ? 'text-yellow-600' : 'text-red-600';
      tbody.innerHTML += `
        <tr class="border-b">
          <td class="px-4 py-2">${formatDate(wd.created_at)}</td>
          <td class="px-4 py-2">${formatMoney(wd.amount)}</td>
          <td class="px-4 py-2 ${statusColor} capitalize">${wd.status}</td>
        </tr>
      `;
    });
  }
}

async function loadLeaderboard() {
  const response = await fetch(`${API_BASE}/referrals/leaderboard`);
  const data = await response.json();
  
  if (data.success) {
    const container = document.getElementById('leaderboardList');
    container.innerHTML = '';
    data.leaderboard.forEach((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      container.innerHTML += `
        <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div class="flex items-center gap-3">
            <span class="text-2xl">${medal}</span>
            <div>
              <p class="font-semibold">${user.username}</p>
              <p class="text-sm text-gray-500">${user.referral_count} referrals</p>
            </div>
          </div>
          <p class="font-bold text-green-600">${formatMoney(user.total_earnings)}</p>
        </div>
      `;
    });
  }
}

async function requestWithdrawal() {
  const amount = document.getElementById('withdrawAmount').value;
  
  if (!amount || amount < 300) {
    showToast('Minimum withdrawal amount is Ksh 300', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ amount: parseFloat(amount) })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(data.message);
      document.getElementById('withdrawAmount').value = '';
      loadDashboard();
    } else {
      showToast(data.error, 'error');
    }
  } catch (error) {
    showToast('Withdrawal request failed', 'error');
  }
}

function copyReferralLink() {
  const link = document.getElementById('referralLink').value;
  copyToClipboard(link);
}

function shareReferral() {
  const link = document.getElementById('referralLink').value;
  if (navigator.share) {
    navigator.share({
      title: 'Join Refer & Earn',
      text: 'Join me on this amazing referral program and start earning!',
      url: link
    });
  } else {
    copyReferralLink();
  }
}

function showSection(section) {
  currentSection = section;
  const sections = ['overview', 'referrals', 'earnings', 'withdrawals', 'leaderboard'];
  sections.forEach(s => {
    const el = document.getElementById(`${s}Section`);
    if (el) el.classList.add('hidden');
  });
  
  document.getElementById(`${section}Section`).classList.remove('hidden');
  
  const titles = {
    overview: 'Dashboard Overview',
    referrals: 'My Referrals',
    earnings: 'Earnings History',
    withdrawals: 'Withdrawals',
    leaderboard: 'Leaderboard'
  };
  document.getElementById('sectionTitle').textContent = titles[section];
  
  // Load section-specific data
  if (section === 'referrals') loadReferralStats();
  if (section === 'earnings') loadEarnings();
  if (section === 'withdrawals') loadWithdrawals();
  if (section === 'leaderboard') loadLeaderboard();
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('active');
}

function logout() {
  removeToken();
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

// Load user name
const user = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('userName').textContent = user.username || 'User';

// Initialize
loadDashboard();