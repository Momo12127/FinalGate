// ====================== SUPABASE CLIENT ======================
const { createClient } = supabase;

const supabaseUrl = 'https://soxwifnrwqkbfpvzdfkl.supabase.co'; 
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHdpZm5yd3FrYmZwdnpkZmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NTkyNzMsImV4cCI6MjA4MDAzNTI3M30.44Jzm3XP35KPMJlE7YCZ9Yp95Y0bPJX2cCIJ2ogmYxw';

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);  

/* ====================== CONFIG ====================== */
const MOTOR_BASE_URL = 'http://10.116.10.58:5000';

/* ====================== STATE ====================== */
let products = [];
let monthlyPassed = Array(12).fill(0);
let faultCounts = {};
let currentUser = null;
let autoControlActive = false;

/* ====================== SOUNDS ====================== */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq = 440, duration = 120, type = 'sine') {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audioCtx.destination);
  g.gain.value = 0.08;
  o.start();
  setTimeout(() => o.stop(), duration);
}

function soundFor(status) {
  if (status === 'passed') playTone(880, 100, 'sine');
  else playTone(260, 220, 'triangle');
}

/* ====================== ELEMENTS ====================== */
const userNameEl = document.getElementById('userDisplayName');
const userRoleEl = document.getElementById('userRole');
const passedCountEl = document.getElementById('passedCount');
const rejectedCountEl = document.getElementById('rejectedCount');
const passRateEl = document.getElementById('passRate');
const machineStatusEl = document.getElementById('machineStatus');
const gaugeSvg = document.getElementById('gaugeSvg');
const gaugeValueEl = document.getElementById('gaugeValue');
const gaugeRpmEl = document.getElementById('gaugeRpm');
const cctvCanvas = document.getElementById('cctvCanvas');
const productsTableBody = document.getElementById('productsTable');
const filterSelect = document.getElementById('filterSelect');
const simulateBtn = document.getElementById('simulateBtn');
const connectWsBtn = document.getElementById('connectWsBtn');
const searchInput = document.getElementById('search');
const exportCsvBtn = document.getElementById('exportCsv');
const logoutBtn = document.getElementById('logoutBtn');
const rotateBtn = document.getElementById('rotateBtn');
const randomizePreview = document.getElementById('randomizePreview');
const product3d = document.getElementById('product3d');
const faultListEl = document.getElementById('faultList');

/* ====================== MOTOR CONTROL ====================== */
function updateMachineStatus(status) {
  if (!machineStatusEl) return;
  
  if (status === 'running' || status === 'Running') {
    machineStatusEl.innerText = 'Running';
    machineStatusEl.className = 'status-badge bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium';
  } else if (status === 'offline' || status === 'Offline') {
    machineStatusEl.innerText = 'Offline';
    machineStatusEl.className = 'status-badge bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium';
  } else if (status === 'emergency' || status === 'Emergency Stopped') {
    machineStatusEl.innerText = 'Emergency Stop';
    machineStatusEl.className = 'status-badge bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-bold animate-pulse';
  } else {
    machineStatusEl.innerText = status;
    machineStatusEl.className = 'status-badge bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium';
  }
}

async function startMotor() {
  try {
    const startResponse = await fetch(`${MOTOR_BASE_URL}/api/motor/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!startResponse.ok) throw new Error('Start failed');
    
    const speedResponse = await fetch(`${MOTOR_BASE_URL}/api/motor/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed: 40 })
    });
    
    if (!speedResponse.ok) throw new Error('Speed set failed');
    
    updateMachineStatus('Running');
    showToast('✅ Motor Started - Running at 40%', 'success');
    
    simulateBtn.innerText = 'Stop Auto Control';
    simulateBtn.className = 'w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold';
    
    autoControlActive = true;
    return true;
  } catch (error) {
    console.error('Motor start error:', error);
    updateMachineStatus('Offline');
    showToast('❌ Failed to start motor', 'danger');
    return false;
  }
}

async function emergencyStop() {
  try {
    await fetch(`${MOTOR_BASE_URL}/api/motor/estop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    updateMachineStatus('emergency');
    showToast('🚨 EMERGENCY STOP', 'danger');
    
    simulateBtn.innerText = 'Turn on auto control';
    simulateBtn.className = 'w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700';
    
    autoControlActive = false;
    return true;
  } catch (error) {
    console.error('E-stop error:', error);
    updateMachineStatus('Offline');
    showToast('❌ E-stop failed', 'danger');
    return false;
  }
}

async function stopMotor() {
  try {
    await fetch(`${MOTOR_BASE_URL}/api/motor/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    updateMachineStatus('Offline');
    showToast('⏹️ Motor Stopped', 'info');
    
    simulateBtn.innerText = 'Turn on auto control';
    simulateBtn.className = 'w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700';
    
    autoControlActive = false;
    return true;
  } catch (error) {
    console.error('Stop error:', error);
    showToast('❌ Stop failed', 'danger');
    return false;
  }
}

/* ====================== AUTH ====================== */
async function loadCurrentUser() {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
      window.location.href = '../index.html';
      return false;
    }

    currentUser = {
      id: user.id,                    // UUID needed for filtering
      email: user.email,
      username: user.user_metadata?.username,
      role: user.user_metadata?.role || 'admin',
      name: user.user_metadata?.name || user.email.split('@')[0]
    };
    
    if (userNameEl) userNameEl.textContent = currentUser.name || 'User';
    if (userRoleEl) userRoleEl.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    
    return true;
  } catch (err) {
    console.error("Auth error:", err);
    window.location.href = '../index.html';
    return false;
  }
}

/* ====================== DATA FETCHING (User Isolated) ====================== */
async function fetchProducts() {
  if (!currentUser?.id) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('product_quality_logs')
      .select('*')
      .eq('created_by', currentUser.id)        // ← Only this user's logs
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Error fetching products:', error);
      showToast('Error loading products: ' + error.message, 'danger');
      return;
    }

    products = data.map(log => ({
      id: log.product_id,
      name: log.product_id,
      status: log.decision?.toLowerCase() === 'accepted' ? 'passed' : 'rejected',
      fault: log.reason || '-',
      time: log.created_at,
      batch: log.batch_number,
      image_url: log.image_url,
      standard_id: log.standard_id,
      specsMatch: log.analysis_time_ms ? `${Math.round(100 - (log.analysis_time_ms / 10))}%` : 'N/A'
    })).reverse();

    computeMonthlyStats();
    refreshAll();
  } catch (error) {
    console.error('Fetch products error:', error);
    showToast('Failed to load data', 'danger');
  }
}

async function fetchMotorData() {
  if (!currentUser?.id) return;
  
  try {
    const { data } = await supabaseClient
      .from('motors')
      .select('status')
      .eq('created_by', currentUser.id)        // ← Only this user's motor records
      .order('created_at', { ascending: false })
      .limit(1);

    if (data?.[0]?.status === 'recorded' && !autoControlActive) {
      updateMachineStatus('Running');
    }
  } catch (error) {
    console.error('Motor data error:', error);
  }
}

function computeMonthlyStats() {
  monthlyPassed = Array(12).fill(0);
  faultCounts = {};
  
  products.forEach(p => {
    const date = new Date(p.time);
    const month = date.getMonth();
    
    if (p.status === 'passed') {
      monthlyPassed[month]++;
    } else if (p.fault && p.fault !== '-') {
      faultCounts[p.fault] = (faultCounts[p.fault] || 0) + 1;
    }
  });
}

/* ====================== CHARTS ====================== */
let lineChart, barChart, pieChart;

function initCharts() {
  const lineCtx = document.getElementById('lineChart')?.getContext('2d');
  const barCtx = document.getElementById('barChart')?.getContext('2d');
  const pieCtx = document.getElementById('pieChart')?.getContext('2d');
  
  if (lineCtx) {
    lineChart = new Chart(lineCtx, {
      type: 'line',
      data: { 
        labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], 
        datasets: [{
          label: 'Passed', 
          data: monthlyPassed, 
          borderColor: '#4f46e5', 
          backgroundColor: 'rgba(79,70,229,0.15)',
          tension: 0.3, 
          fill: true
        }] 
      },
      options: { responsive: true, animation: { duration: 700 }, plugins:{legend:{display:false}} }
    });
  }

  if (barCtx) {
    barChart = new Chart(barCtx, {
      type: 'bar',
      data: { 
        labels: ['Passed','Rejected'], 
        datasets: [{ 
          label: 'Count', 
          data: [0,0], 
          backgroundColor: ['#10b981','#ef4444'] 
        }] 
      },
      options: { responsive: true, animation: { duration: 700 }, plugins:{legend:{display:false}} }
    });
  }

  if (pieCtx) {
    pieChart = new Chart(pieCtx, {
      type: 'pie',
      data: { 
        labels: [], 
        datasets: [{ 
          data: [], 
          backgroundColor: ['#f97316','#ef4444','#f59e0b','#60a5fa','#34d399'] 
        }] 
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, animation: { duration: 600 } }
    });
  }
}

/* ====================== STATS & UI ====================== */
function computeStats() {
  const passed = products.filter(p => p.status === 'passed').length;
  const rejected = products.filter(p => p.status === 'rejected').length;
  const total = Math.max(1, products.length);
  const passRate = Math.round((passed / total) * 100);
  return { passed, rejected, passRate };
}

function updateKpis() {
  const s = computeStats();
  if (passedCountEl) passedCountEl.innerText = s.passed;
  if (rejectedCountEl) rejectedCountEl.innerText = s.rejected;
  if (passRateEl) passRateEl.innerText = s.passRate + '%';
}

function drawGauge(percent) {
  if (!gaugeSvg) return;
  const svg = gaugeSvg;
  const cx = 100, cy = 110, r = 60;
  const start = Math.PI;
  const end = Math.PI + (Math.PI * percent / 100);
  const largeArc = percent > 50 ? 1 : 0;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  
  svg.innerHTML = `
    <defs><linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#60a5fa"/></linearGradient></defs>
    <path d="M 40 110 A 60 60 0 1 1 160 110" stroke="#e5e7eb" stroke-width="12" fill="none" stroke-linecap="round"></path>
    <path d="${path}" stroke="url(#g1)" stroke-width="12" fill="none" stroke-linecap="round"></path>
    <circle cx="100" cy="110" r="4" fill="#fff" stroke="#ccc"></circle>
  `;
  if (gaugeValueEl) gaugeValueEl.innerText = percent + '%';
  if (gaugeRpmEl) gaugeRpmEl.innerText = Math.round(percent * 60);
}

/* ====================== CCTV ====================== */
(function initCctv() {
  if (!cctvCanvas) return;
  const canvas = cctvCanvas;
  const ctx = canvas.getContext('2d');
  
  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  
  let t = 0;
  function loop() {
    t += 0.02;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < 6; i++) {
      const x = (i * 40 + (t * 40) % 40);
      ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.abs(Math.sin(t + i)) * 0.06})`;
      ctx.fillRect((x % canvas.width), 0, 6, canvas.height);
    }
    
    const ox = (Math.sin(t * 1.2) + 1) / 2 * (canvas.width - 40);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(ox, canvas.height / 2 - 10, 40, 20);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(loop);
  }
  loop();
})();

/* ====================== TABLE ====================== */
function renderTable() {
  if (!productsTableBody) return;
  
  const q = (searchInput?.value || '').trim().toLowerCase();
  const filter = filterSelect?.value || 'all';
  
  const rows = products.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (!q) return true;
    return String(p.id).toLowerCase().includes(q) ||
           (p.name || '').toLowerCase().includes(q) ||
           (p.status || '').toLowerCase().includes(q) ||
           (p.fault || '').toLowerCase().includes(q) ||
           (p.batch || '').toLowerCase().includes(q);
  });

  productsTableBody.innerHTML = rows.map(p => `
    <tr class="${p._isNew ? 'table-new' : ''}" data-id="${p.id}">
      <td class="px-6 py-4 text-sm font-mono">${p.id}</td>
      <td class="px-6 py-4 text-sm font-medium">${escapeHtml(p.name)}</td>
      <td class="px-6 py-4">
        <span class="status-badge ${p.status === 'passed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
          ${p.status.toUpperCase()}
        </span>
      </td>
      <td class="px-6 py-4 text-sm ${p.specsMatch && parseFloat(p.specsMatch) > 90 ? 'text-green-600' : 'text-red-600'}">
        ${p.specsMatch || '-'}
      </td>
      <td class="px-6 py-4 text-sm text-gray-900">${escapeHtml(p.fault)}</td>
      <td class="px-6 py-4 text-right text-sm text-gray-500">${new Date(p.time).toLocaleString()}</td>
      <td class="px-6 py-4">
        <button class="text-blue-600 hover:text-blue-800 text-sm mr-2" onclick="viewProduct('${p.id}')">View</button>
        <button class="text-red-600 hover:text-red-800 text-sm" onclick="markRejected('${p.id}')" ${currentUser?.role === 'admin' ? '' : 'disabled'}>Reject</button>
      </td>
    </tr>
  `).join('');
  
  setTimeout(() => document.querySelectorAll('.table-new').forEach(el => el.classList.remove('table-new')), 1200);
}

/* ====================== PRODUCT MODAL ====================== */
window.viewProduct = async function(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return showToast('Product not found', 'warn');
  
  const modal = document.getElementById('productModal');
  const content = document.getElementById('productDetailsContent');
  
  try {
    const { data: standard } = await supabaseClient
      .from('standard_reference')
      .select('description, image_url')
      .eq('created_by', currentUser.id)
      .eq('product_id', p.standard_id || p.id)
      .single();

    content.innerHTML = `
      <div class="product-detail-row"><span class="product-detail-label">🆔 Standard ID</span><span class="product-detail-value font-bold text-lg">${p.id}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">📦 Batch</span><span class="product-detail-value">${p.batch || '-'}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">✅ Status</span><span class="product-detail-value status-${p.status}">${p.status.toUpperCase()}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">⚠️ Reason</span><span class="product-detail-value">${p.fault || 'None'}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">🕒 Timestamp</span><span class="product-detail-value">${new Date(p.time).toLocaleString()}</span></div>
      ${standard ? `<div class="product-detail-row"><span class="product-detail-label">📋 Standard description</span><span class="product-detail-value">${standard.description}</span></div>` : ''}
    `;
  } catch (e) {
    content.innerHTML = `
      <div class="product-detail-row"><span class="product-detail-label">🆔 Standard ID</span><span class="product-detail-value font-bold text-lg">${p.id}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">📦 Batch</span><span class="product-detail-value">${p.batch || '-'}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">✅ Status</span><span class="product-detail-value status-${p.status}">${p.status.toUpperCase()}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">⚠️ Reason</span><span class="product-detail-value">${p.fault || 'None'}</span></div>
      <div class="product-detail-row"><span class="product-detail-label">🕒 Timestamp</span><span class="product-detail-value">${new Date(p.time).toLocaleString()}</span></div>
    `;
  }
  
  modal.classList.add('show');
};

/* Modal close handlers */
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('productModal');
  if (!modal) return;
  
  const closeBtn = document.getElementById('closeProductModal');
  const closeProductBtn = document.getElementById('closeProductBtn');
  
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove('show');
  if (closeProductBtn) closeProductBtn.onclick = () => modal.classList.remove('show');
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('show');
  };
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
      modal.classList.remove('show');
    }
  });
});

window.markRejected = function(id) {
  if (currentUser?.role !== 'admin') return showToast('Admin only', 'warn');
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return showToast('Not found', 'warn');
  
  p.status = 'rejected';
  if (p.fault && p.fault !== '-') {
    faultCounts[p.fault] = (faultCounts[p.fault] || 0) + 1;
  }
  refreshAll();
  showToast('Marked as rejected', 'info');
};

/* ====================== REAL-TIME ====================== */
function addNewProduct(log) {
  if (log.created_by !== currentUser.id) return;   // Security check

  const item = {
    id: log.product_id,
    name: log.product_id,
    status: log.decision?.toLowerCase() === 'accepted' ? 'passed' : 'rejected',
    specsMatch: log.analysis_time_ms ? `${Math.round(100 - (log.analysis_time_ms / 10))}%` : 'N/A',
    fault: log.reason || '-',
    time: log.created_at,
    batch: log.batch_number,
    image_url: log.image_url,
    standard_id: log.standard_id,
    _isNew: true
  };

  if (!products.find(p => p.id === item.id)) {
    products.unshift(item);

    if (item.status === 'passed') {
      const m = new Date(item.time).getMonth();
      monthlyPassed[m] = (monthlyPassed[m] || 0) + 1;
    } else if (item.status === 'rejected' && item.fault && item.fault !== '-') {
      faultCounts[item.fault] = (faultCounts[item.fault] || 0) + 1;
    }

    soundFor(item.status);
    refreshAll();
  }
}

/* ====================== EXPORT ====================== */
async function exportCsv() {
  if (currentUser?.role !== 'admin') return showToast('Admin only', 'warn');
  if (products.length === 0) return showToast('No data', 'warn');
  
  const rows = [['id','name','status','specsMatch','fault','batch','time']];
  products.forEach(p => rows.push([p.id, p.name, p.status, p.specsMatch || '', p.fault || '', p.batch || '', p.time]));
  
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finalgate_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported', 'info');
}

/* ====================== 3D PREVIEW ====================== */
if (rotateBtn) {
  rotateBtn.onclick = () => {
    if (product3d) {
      product3d.classList.toggle('rotate');
      rotateBtn.innerText = product3d.classList.contains('rotate') ? 'Stop' : 'Rotate';
    }
  };
}

if (randomizePreview) {
  randomizePreview.onclick = () => {
    if (product3d) {
      const colors = ['#f59e0b', '#f97316', '#fb7185', '#60a5fa', '#34d399'];
      product3d.querySelectorAll('.layer').forEach((layer, i) => {
        layer.style.background = `linear-gradient(${i % 2 ? '90deg' : '180deg'}, ${colors[(i*2)%5]}, ${colors[(i*3)%5]})`;
      });
    }
  };
}

/* ====================== UTILS ====================== */
function showToast(text, type = 'info', timeout = 3000) {
  const toastContainer = document.getElementById('toasts');
  if (!toastContainer) return;
  
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = text;
  t.style.background = type === 'danger' ? '#dc2626' : type === 'warn' ? '#f59e0b' : '#2563eb';
  toastContainer.appendChild(t);
  setTimeout(() => t.classList.add('show'), 100);
  setTimeout(() => t.remove(), timeout);
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function refreshAll() {
  updateKpis();
  
  if (lineChart) {
    lineChart.data.datasets[0].data = monthlyPassed;
    lineChart.update('none');
  }
  if (barChart) {
    const stats = computeStats();
    barChart.data.datasets[0].data = [stats.passed, stats.rejected];
    barChart.update('none');
  }
  if (pieChart) {
    const entries = Object.entries(faultCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    pieChart.data.labels = entries.map(e => e[0]);
    pieChart.data.datasets[0].data = entries.map(e => e[1]);
    pieChart.update('none');
  }
  
  renderTable();
  
  if (faultListEl) {
    const entries = Object.entries(faultCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    faultListEl.innerHTML = entries.map(([fault, count]) => 
      `<li class="flex justify-between py-2"><span>${escapeHtml(fault)}</span><span class="font-medium">${count}</span></li>`
    ).join('') || '<li class="text-gray-500 py-2">No faults</li>';
  }

  const stats = computeStats();
  drawGauge(stats.passRate);
}

/* ====================== EVENTS ====================== */
if (simulateBtn) {
  simulateBtn.onclick = async () => {
    if (autoControlActive) await stopMotor();
    else await startMotor();
  };
}

if (connectWsBtn) {
  connectWsBtn.onclick = async () => await emergencyStop();
}

if (filterSelect) filterSelect.onchange = renderTable;
if (searchInput) searchInput.oninput = renderTable;
if (exportCsvBtn) exportCsvBtn.onclick = exportCsv;

if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = '../index.html';
  };
}

/* ====================== REAL-TIME SUBSCRIPTIONS ====================== */
supabaseClient
  .channel('product_quality_logs')
  .on('postgres_changes', 
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'product_quality_logs',
      filter: `created_by=eq.${currentUser?.id}` 
    }, 
    (payload) => {
      addNewProduct(payload.new);
      const status = payload.new.decision?.toLowerCase() === 'accepted' ? 'success' : 'warn';
      showToast(`New ${payload.new.decision?.toLowerCase()}`, status);
    }
  )
  .subscribe();

supabaseClient
  .channel('motors')
  .on('postgres_changes', 
    { 
      event: '*', 
      schema: 'public', 
      table: 'motors',
      filter: `created_by=eq.${currentUser?.id}` 
    }, 
    () => fetchMotorData()
  )
  .subscribe();

/* ====================== INITIALIZATION ====================== */
document.addEventListener('DOMContentLoaded', async () => {
  const userLoaded = await loadCurrentUser();
  if (!userLoaded) return;

  initCharts();
  
  if (simulateBtn) {
    simulateBtn.innerText = 'Turn on auto control';
    simulateBtn.className = 'w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700';
  }
  if (connectWsBtn) {
    connectWsBtn.innerText = 'Emergency Stop';
    connectWsBtn.className = 'w-full py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700';
  }
  
  autoControlActive = false;
  
  await Promise.all([fetchProducts(), fetchMotorData()]);
  updateMachineStatus('Offline');
  refreshAll();
});