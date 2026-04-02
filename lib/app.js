// Supabase Client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://soxwifnrwqkbfpvzdfkl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHdpZm5yd3FrYmZwdnpkZmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NTkyNzMsImV4cCI6MjA4MDAzNTI3M30.44Jzm3XP35KPMJlE7YCZ9Yp95Y0bPJX2cCIJ2ogmYxw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// State
let currentUser = null;
let stats = { accepted: 0, rejected: 0, total: 0, passRate: 0 };
let standardsData = [];
let currentProduct = null;
let lineChart = null;

// Exact selectors
const elements = {
  acceptedEl: document.getElementById('acceptedCount'),
  rejectedEl: document.getElementById('rejectedCount'),
  totalEl: document.getElementById('totalCount'),
  motorStatusCard: document.getElementById('motorStatusCard'),
  motorStatusDisplay: document.getElementById('motorStatusDisplay'),
  userNameEl: document.getElementById('userDisplayName'),
  userRoleEl: document.getElementById('userRole'),
  lineChartEl: document.getElementById('lineChart'),
  standardsTbody: document.getElementById('standardsTbody'),
  currentProductName: document.getElementById('currentProductName'),
  productStatus: document.getElementById('productStatus'),
  productPassRate: document.getElementById('productPassRate'),
  product3DPreview: document.getElementById('product3DPreview'),
  productionBtn: document.getElementById('productionBtn'),
  searchInput: document.querySelector('input[placeholder*="Search"]'),
  logoutBtn: document.getElementById('logoutBtn'),
  usersCount: document.getElementById('usersCount')  // added for safety
};

// ── AUTH & USER DISPLAY ──────────────────────────────────────
async function loadCurrentUser() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user?.id) {
      window.location.href = "../index.html";
      return false;
    }

    const user = session.user;

    const { data: companyUser } = await supabase
      .from("userscompany")
      .select("username1, role, email1")
      .eq("email1", user.email)
      .maybeSingle();

    currentUser = companyUser
      ? { 
          id: user.id,
          email: companyUser.email1, 
          name: companyUser.username1, 
          role: companyUser.role || "viewer" 
        }
      : { 
          id: user.id,
          email: user.email, 
          name: user.user_metadata?.name || "Admin", 
          role: "admin" 
        };

    if (elements.userNameEl) elements.userNameEl.textContent = currentUser.name;
    if (elements.userRoleEl) elements.userRoleEl.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

    applyRolePermissions(currentUser.role);
    return true;
  } catch (err) {
    console.error("Auth error:", err);
    window.location.href = "../index.html";
    return false;
  }
}

function applyRolePermissions(role) {
  if (role === 'viewer') {
    document.querySelectorAll('button:not(#logoutBtn)').forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    });
  }
}

// ── STATS (Only current user's data) ─────────────────────
async function fetchQualityStats() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('product_quality_logs')
      .select('decision, created_at')
      .eq('created_by', currentUser.id)   // ← Only this user's data
      .gte('created_at', thirtyDaysAgo);

    if (error || !data?.length) {
      useFallbackData();
      return;
    }

    const accepted = data.filter(l => l.decision === 'ACCEPTED').length;
    const rejected = data.filter(l => l.decision === 'REJECTED').length;

    stats = {
      accepted,
      rejected,
      total: data.length,
      passRate: data.length ? (accepted / data.length) * 100 : 0
    };

    updateStatsUI();
  } catch (err) {
    console.error('Stats error:', err);
    useFallbackData();
  }
}

function updateStatsUI() {
  if (elements.acceptedEl) elements.acceptedEl.textContent = stats.accepted.toLocaleString();
  if (elements.rejectedEl) elements.rejectedEl.textContent = stats.rejected.toLocaleString();
  if (elements.totalEl) elements.totalEl.textContent = stats.total.toLocaleString();
}

// ── MOTOR STATUS (Only recent activity from this user) ───────
async function fetchMotorStatus() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: recentLogs, error } = await supabase
      .from('product_quality_logs')
      .select('created_at')
      .eq('created_by', currentUser.id)   // ← Only this user's logs
      .gte('created_at', fiveMinutesAgo)
      .limit(1);

    const isRunning = !error && recentLogs?.length > 0;

    if (elements.motorStatusDisplay) {
      if (isRunning) {
        elements.motorStatusDisplay.innerHTML = `<i class="fas fa-play-circle text-lg"></i><span>Running</span>`;
        elements.motorStatusDisplay.className = 'motor-status motor-on';
      } else {
        elements.motorStatusDisplay.innerHTML = `<i class="fas fa-power-off text-lg"></i><span>Turned Off</span>`;
        elements.motorStatusDisplay.className = 'motor-status motor-off';
      }
    }
  } catch (err) {
    console.error('Motor status error:', err);
    if (elements.motorStatusDisplay) {
      elements.motorStatusDisplay.innerHTML = `<i class="fas fa-power-off text-lg"></i><span>Turned Off</span>`;
      elements.motorStatusDisplay.className = 'motor-status motor-off';
    }
  }
}

// ── CURRENT PRODUCT PREVIEW (Only this user's active product) ─
async function updateCurrentProductPreview() {
  try {
    // Step 1: Get the active standard product for this user
    const { data: activeProduct, error } = await supabase
      .from('standard_reference')
      .select('product_id, description, image_url, is_active')
      .eq('created_by', currentUser.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !activeProduct) {
      showNoProductPreview();
      return;
    }

    // Step 2: Fetch quality logs for this specific active product to compute real pass rate
    const { data: logs, error: logsError } = await supabase
      .from('product_quality_logs')
      .select('decision')
      .eq('created_by', currentUser.id)
      .eq('product_id', activeProduct.product_id);

    let passRateText = 'N/A';
    if (!logsError && logs && logs.length > 0) {
      const accepted = logs.filter(l =>
        l.decision === 'ACCEPTED' || l.decision === 'accepted'
      ).length;
      const rate = ((accepted / logs.length) * 100).toFixed(1);
      passRateText = rate + '%';
    } else if (!logsError && logs && logs.length === 0) {
      passRateText = 'No data yet';
    }

    // Step 3: Update the UI
    if (elements.currentProductName) elements.currentProductName.textContent = activeProduct.product_id;
    if (elements.productStatus) {
      elements.productStatus.textContent = 'Active';
      elements.productStatus.className = 'text-green-600 font-medium';
    }
    if (elements.productPassRate) {
      elements.productPassRate.textContent = passRateText;
      // Color the pass rate: green >=90%, yellow >=75%, red <75%
      const numericRate = parseFloat(passRateText);
      if (!isNaN(numericRate)) {
        elements.productPassRate.className = numericRate >= 90
          ? 'font-semibold text-green-600'
          : numericRate >= 75
            ? 'font-semibold text-yellow-600'
            : 'font-semibold text-red-600';
      } else {
        elements.productPassRate.className = 'font-semibold text-gray-500';
      }
    }

    if (elements.product3DPreview) {
      if (activeProduct.image_url) {
        elements.product3DPreview.innerHTML = `
          <img src="${activeProduct.image_url}" 
               class="w-full h-full object-contain rounded-xl border border-gray-200" 
               alt="Product Image"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="w-full h-full flex items-center justify-center text-4xl hidden">📦</div>`;
      } else {
        elements.product3DPreview.innerHTML = `<div class="w-full h-full flex items-center justify-center text-4xl">📦</div>`;
      }
    }
  } catch (err) {
    console.error('Preview error:', err);
    showNoProductPreview();
  }
}

function showNoProductPreview() {
  if (elements.currentProductName) elements.currentProductName.textContent = 'No Active Product';
  if (elements.productStatus) {
    elements.productStatus.textContent = 'Inactive';
    elements.productStatus.className = 'font-medium text-gray-400';
  }
  if (elements.productPassRate) {
    elements.productPassRate.textContent = '—';
    elements.productPassRate.className = 'font-semibold text-gray-400';
  }
  if (elements.product3DPreview) {
    elements.product3DPreview.innerHTML = `<div class="w-full h-full flex items-center justify-center text-4xl text-gray-400">📦</div>`;
  }
}

// ── STANDARDS TABLE (Only this user's products) ──────────────
async function fetchStandardsData() {
  try {
    if (!elements.standardsTbody) return;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: logs, error } = await supabase
      .from('product_quality_logs')
      .select('product_id, decision')
      .eq('created_by', currentUser.id)   // ← Only this user's data
      .gte('created_at', thirtyDaysAgo);

    if (error || !logs?.length) {
      elements.standardsTbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">No quality data available</td></tr>`;
      return;
    }

    const productStats = {};
    logs.forEach(log => {
      const product = log.product_id || 'Unknown';
      if (!productStats[product]) productStats[product] = { accepted: 0, rejected: 0, total: 0 };
      productStats[product].total++;
      if (log.decision === 'ACCEPTED') productStats[product].accepted++;
      else if (log.decision === 'REJECTED') productStats[product].rejected++;
    });

    const standards = Object.entries(productStats)
      .map(([product, st]) => ({
        product_id: product,
        accepted: st.accepted,
        rejected: st.rejected,
        total: st.total,
        passRate: st.total ? (st.accepted / st.total * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    elements.standardsTbody.innerHTML = standards.map(product => {
      const colorClass = product.passRate >= 95 ? 'bg-green-100 text-green-800' :
                        product.passRate >= 85 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800';

      return `
        <tr class="hover:bg-gray-50">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
              <div class="w-3 h-3 rounded-full ${product.passRate >= 95 ? 'bg-green-500' : product.passRate >= 85 ? 'bg-yellow-500' : 'bg-red-500'} mr-3"></div>
              ${product.product_id}
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">${product.accepted.toLocaleString()}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${product.rejected.toLocaleString()}</td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="status-badge ${colorClass} px-3 py-1 rounded-full text-sm font-medium">${product.passRate}%</span>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error('Standards error:', err);
    elements.standardsTbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">Error loading standards data</td></tr>`;
  }
}

// ── MONTHLY CHART (Only this user's accepted products) ───────
async function fetchMonthlyData() {
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const { data: logs, error } = await supabase
      .from('product_quality_logs')
      .select('created_at, decision')
      .eq('created_by', currentUser.id)   // ← Only this user's data
      .gte('created_at', oneYearAgo);

    if (error || !logs?.length || !elements.lineChartEl) {
      createFallbackChart();
      return;
    }

    const monthlyData = Array(12).fill(0);
    const now = new Date();

    logs.filter(log => log.decision === 'ACCEPTED').forEach(log => {
      const logDate = new Date(log.created_at);
      const monthsDiff = now.getFullYear() * 12 + now.getMonth() - (logDate.getFullYear() * 12 + logDate.getMonth());
      if (monthsDiff >= 0 && monthsDiff < 12) {
        monthlyData[11 - monthsDiff]++;
      }
    });

    const labels = [];
    const monthlyDataFixed = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      monthlyDataFixed.push(monthlyData[11 - i]);
    }

    createChart(labels, monthlyDataFixed);
  } catch (err) {
    console.error('Chart error:', err);
    createFallbackChart();
  }
}

// ── USERS COUNT (Already good, but improved) ─────────────────
async function fetchUsersCount() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count, error } = await supabase
      .from('userscompany')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id);

    if (error) console.error("Count error:", error);
    else if (elements.usersCount) elements.usersCount.textContent = count || 0;
  } catch (err) {
    console.error("Fetch users count error:", err);
  }
}

// Chart functions (unchanged)
function createChart(labels, data) {
  if (!elements.lineChartEl) return;
  const ctx = elements.lineChartEl.getContext('2d');
  lineChart?.destroy();
  lineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true, pointBackgroundColor: '#3b82f6', pointBorderColor: '#ffffff', pointBorderWidth: 2, pointRadius: 6 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { color: 'rgba(0,0,0,0.05)' } } } }
  });
}

function createFallbackChart() {
  createChart(Array(12).fill().map((_, i) => `M${i+1}`), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

// Events & Init (small improvements)
function setupEvents() {
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '../index.html';
    });
  }

  // Production button, search, etc. (unchanged)
  if (elements.productionBtn) {
    let isRunning = false;
    elements.productionBtn.addEventListener('click', () => {
      isRunning = !isRunning;
      elements.productionBtn.textContent = isRunning ? '🛑 Stop Production' : '▶️ Start Production';
      elements.productionBtn.className = isRunning 
        ? 'w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all'
        : 'w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all';
    });
  }

  if (elements.searchInput) {
    elements.searchInput.addEventListener('focus', () => { elements.searchInput.placeholder = 'Type to search products...'; });
    elements.searchInput.addEventListener('blur', () => {
      if (!elements.searchInput.value) elements.searchInput.placeholder = 'Search...';
    });
  }
}

function useFallbackData() {
  stats = { accepted: 0, rejected: 0, total: 0, passRate: 100 };
  updateStatsUI();
}

async function init() {
  const userLoaded = await loadCurrentUser();
  if (!userLoaded) return;

  await Promise.all([
    fetchQualityStats(),
    fetchMotorStatus(),
    updateCurrentProductPreview(),
    fetchStandardsData(),
    fetchMonthlyData(),
    fetchUsersCount()
  ]);

  setupEvents();

  setInterval(fetchMotorStatus, 30000);   // refresh motor every 30s
}

document.addEventListener('DOMContentLoaded', init);