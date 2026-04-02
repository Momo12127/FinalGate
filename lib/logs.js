import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://soxwifnrwqkbfpvzdfkl.supabase.co'; 
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHdpZm5yd3FrYmZwdnpkZmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NTkyNzMsImV4cCI6MjA4MDAzNTI3M30.44Jzm3XP35KPMJlE7YCZ9Yp95Y0bPJX2cCIJ2ogmYxw';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);  

let currentUser = null;
const SERVER_URL = 'http://10.204.226.58:5000';

const state = {
    isRunning: false,
    rpm: 0,
    power: 0,
    runtime: '00:00',
    speed: 0,
    sequence: []
};

// 🛡️ SAFE ELEMENT GETTER
function getElementSafe(id) {
    const el = document.getElementById(id) || document.querySelector(`#${id}`);
    if (!el && id !== 'log-table-body') {  // ✅ Ignore log table warnings
        console.warn(`❌ Element not found: #${id}`);
    }
    return el;
}

const els = {
    rpm: getElementSafe('stat-rpm'),
    power: getElementSafe('stat-power'),
    runtime: getElementSafe('stat-runtime'),
    statusBadge: getElementSafe('status-badge'),
    logBody: getElementSafe('log-table-body'),
    seqList: getElementSafe('sequence-list'),
    speedValue: getElementSafe('val-speed'),
    startBtn: getElementSafe('btn-start'),
    estopBtn: getElementSafe('btn-estop'),
    runSeqBtn: getElementSafe('btn-run-seq'),
    addStepBtn: getElementSafe('btn-add-step'),
    userNameEl: document.getElementById('userDisplayName'),
    userRoleEl: document.getElementById('userRole')
};

// ================= AUTH =================
async function loadCurrentUser() {
  try {
    // 🔹 جلب الجلسة الحالية من Supabase
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session?.user?.email) {
      window.location.href = "../index.html";
      return false;
    }

    const user = session.user;

    // 🔹 استعلام جدول userscompany للبيانات الإضافية
    const { data: companyUser, error: userError } = await supabaseClient
      .from("userscompany")
      .select("username1, role, email1")
      .eq("email1", user.email)
      .maybeSingle();

    if (userError) {
      console.warn("Could not fetch company user data:", userError);
    }

    // 🔹 تعيين currentUser بناءً على وجود بيانات الشركة
    currentUser = companyUser
      ? { 
          email: companyUser.email1, 
          name: companyUser.username1, 
          role: companyUser.role || "viewer" 
        }
      : { 
          email: user.email, 
          name: user.user_metadata?.name || user.email.split('@')[0], 
          role: "admin" 
        };

    // 🔹 تحديث واجهة المستخدم
    if (els.userNameEl) els.userNameEl.textContent = currentUser.name;
    if (els.userRoleEl) els.userRoleEl.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

    // 🔹 تطبيق صلاحيات الدور إذا موجودة
    if (typeof applyRolePermissions === "function") {
      applyRolePermissions(currentUser.role);
    }

    // 🔹 عرض زر تسجيل الخروج إذا موجود
    if (window.logoutBtn) logoutBtn.classList.remove("hidden");

    return true;

  } catch (err) {
    console.error("Auth error:", err);
    window.location.href = "../index.html";
    return false;
  }
}
loadCurrentUser();

/* SUPABASE DATA FUNCTIONS */
async function fetchProducts() {
  try {
    const { data, error } = await supabaseClient
      .from('product_quality_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Error fetching products:', error);
      showToast('Error loading products: ' + error.message, 'danger');
      return;
    }

    // Transform data to match existing format
    products = data.map(log => ({
      id: log.product_id,
      name: log.product_id, // Use product_id as name, or join with standards
      status: log.decision.toLowerCase() === 'accepted' ? 'passed' : 'rejected',
      fault: log.reason || '-',
      time: log.created_at,
      batch: log.batch_number,
      image_url: log.image_url,
      standard_id: log.standard_id
    })).reverse(); // Reverse to show newest first

    computeMonthlyStats();
    refreshAll();
  } catch (error) {
    console.error('Fetch error:', error);
    showToast('Failed to load data', 'danger');
  }
}

// ================= SUPABASE LOGGING =================
async function logMotorData(data) {
    try {
        // 🔥 CLEAN + VALIDATE EVERYTHING
        const safeNumber = (val, def = 0) => {
            const num = Number(val);
            return isNaN(num) ? def : num;
        };

        const clamp = (val, min, max) => {
            return Math.max(min, Math.min(max, val));
        };

        const logData = {
            event_type: data.event_type || 'unknown',
            notes: data.notes || '',

            // 🔥 FIX المشكلة هنا
            motor_speed: clamp(safeNumber(data.motor_speed), 0, 100),

            motor_rpm: safeNumber(data.motor_rpm),
            motor_power: safeNumber(data.motor_power),
            runtime_seconds: safeNumber(data.runtime_seconds),

            servo_angle: data.servo_angle ?? null,
            servo_sleep_ms: data.servo_sleep_ms ?? null,

            sequence_total_steps: safeNumber(data.sequence_total_steps),

            user_id: currentUser?.id || null
        };

        // 🔥 DEBUG (مهم)

        const { error } = await supabaseClient
            .from('motors')
            .insert([logData]);

        if (error) {
            console.error('❌ Log failed:', error);
            return false;
        }

        return true;

    } catch (err) {
        console.error('💥 DB Error:', err);
        return false;
    }
}

function parseRuntime(runtimeStr) {
    const [minutes, seconds] = runtimeStr.split(':').map(Number);
    return (minutes || 0) * 60 + (seconds || 0);
}

// ================= API HELPER =================
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${SERVER_URL}${endpoint}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ================= MOTOR CONTROL =================
async function toggleMotor() {
    if (!els.startBtn) return;
    const btn = els.startBtn;
    btn.disabled = true;
    
    try {
        if (state.isRunning) {
            await apiCall('/api/motor/stop', { method: 'POST' });
            state.isRunning = false;
            await logMotorData({
                motor_speed: state.speed,
                event_type: 'motor_stop',
                notes: `Stopped at ${state.speed}%`
            });
            addLog("Motor", "Stopped", "neutral");
        } else {
            await apiCall('/api/motor/start', {
                method: 'POST',
                body: JSON.stringify({ speed: state.speed })
            });
            state.isRunning = true;
            await logMotorData({
                motor_speed: state.speed,
                event_type: 'motor_start',
                notes: `Started at ${state.speed}%`
            });
            addLog("Motor", `Started ${state.speed}%`, "success");
        }
        updateStatusBadge();
        updateStartButton();
    } catch (err) {
        addLog("API", `Error: ${err.message}`, "error");
    } finally {
        btn.disabled = false;
    }
}

async function updateSpeed(value) {
    const speed = parseInt(value) || 0;
    state.speed = speed;
    
    if (els.speedValue) {
        els.speedValue.textContent = speed;
    }
    
    document.getElementById('slider-speed')?.setAttribute('value', speed);
    
    await logMotorData({
        motor_speed: speed,
        event_type: 'speed_change',
        notes: `Speed: ${speed}%`
    });
    
    if (state.isRunning) {
        try {
            await apiCall('/api/motor/speed', {
                method: 'POST',
                body: JSON.stringify({ speed })
            });
        } catch (err) {
            console.warn('Speed update failed');
        }
    }
}

async function emergencyStop() {
    try {
        await apiCall('/api/estop', { method: 'POST' });
        state.isRunning = false;
        state.speed = 0;
        if (els.speedValue) els.speedValue.textContent = '0';
        document.getElementById('slider-speed').value = 0;
        if (els.statusBadge) {
            els.statusBadge.textContent = "EMERGENCY STOP";
            els.statusBadge.className = "badge badge-error";
        }
        await logMotorData({ event_type: 'estop', notes: 'Emergency stop' });
        addLog("🚨 EMERGENCY", "STOP!", "error");
        updateStartButton();
    } catch (err) {
        addLog("E-Stop", "Failed", "error");
    }
}

// ================= SEQUENCE CONTROL =================
async function addSequenceStep() {
    const angleInput = document.getElementById('seq-angle');
    const sleepInput = document.getElementById('seq-sleep');
    
    if (!angleInput || !sleepInput) {
        alert('Sequence inputs not found!');
        return;
    }
    
    const angle = parseInt(angleInput.value);
    const sleep = parseInt(sleepInput.value);

    if (isNaN(angle) || isNaN(sleep) || angle < 0 || angle > 360 || sleep < 0) {
        alert("Angle (0-360) & Sleep (≥0ms) required!");
        return;
    }

    try {
        const result = await apiCall('/api/sequence/add', {
            method: 'POST',
            body: JSON.stringify({ angle, sleep })
        });
        
        await logMotorData({
            servo_angle: angle,
            servo_sleep_ms: sleep,
            event_type: 'servo_move',
            notes: `${angle}°/${sleep}ms`
        });
        
        angleInput.value = sleepInput.value = "";
        await refreshSequence();
        addLog("Sequence", `+ ${angle}°/${sleep}ms`, "success");
    } catch (err) {
        addLog("Sequence", "Add failed", "error");
        console.error(err);
    }
}

async function runSequence() {
    try {
        const result = await apiCall('/api/sequence/run', { method: 'POST' });
        if (result.status === 'running') {
            if (els.runSeqBtn) {
                els.runSeqBtn.textContent = 'Running...';
                els.runSeqBtn.disabled = true;
            }
            addLog("Sequence", `Running (${result.steps})`, "success");
        }
    } catch (err) {
        addLog("Sequence", "Run failed", "error");
    }
}

async function refreshSequence() {
    try {
        const status = await apiCall('/api/sequence/status');
        if (!els.seqList) return;
        
        els.seqList.innerHTML = '';
        status.steps.forEach((step, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${step.angle}°</td>
                <td>${step.sleep}ms</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="dashboard.deleteStep(${index})">
                        Delete
                    </button>
                </td>
            `;
            els.seqList.appendChild(row);
        });
    } catch (err) {
        console.warn('Sequence refresh failed');
    }
}

async function deleteStep(stepId) {
    try {
        await apiCall(`/api/sequence/delete/${stepId}`, { method: 'DELETE' });
        await refreshSequence();
        addLog("Sequence", `Step ${stepId + 1} deleted`, "neutral");
    } catch (err) {
        addLog("Sequence", "Delete failed", "error");
    }
}

// ================= UI UPDATES =================
function updateStatusBadge() {
    if (!els.statusBadge) return;
    els.statusBadge.textContent = state.isRunning ? "RUNNING" : "STOPPED";
    els.statusBadge.className = state.isRunning ? "badge badge-success" : "badge badge-error";
}

function updateStartButton() {
    if (!els.startBtn) return;
    if (state.isRunning) {
        els.startBtn.textContent = 'Stop Motor';
        els.startBtn.className = 'btn btn-danger';
    } else {
        els.startBtn.textContent = 'Start Motor';
        els.startBtn.className = 'btn btn-primary';
    }
}

function updateStats() {
    if (els.rpm) els.rpm.textContent = Math.round(state.rpm);
    if (els.power) els.power.textContent = Math.round(state.power);
    if (els.runtime) els.runtime.textContent = state.runtime;
}

// ================= SAFE LOGGING =================
function addLog(source, message, type) {
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    const row = document.createElement('tr');
    const statusClass = type === 'error' ? 'badge-error' : 
                       type === 'success' ? 'badge-success' : 'badge-neutral';
    
    row.innerHTML = `
        <td>${time}</td>
        <td>${source}: ${message}</td>
        <td><span class="badge ${statusClass}">${type.toUpperCase()}</span></td>
    `;
    
    if (els.logBody) {
        els.logBody.insertBefore(row, els.logBody.firstChild);
        if (els.logBody.children.length > 50) {
            els.logBody.removeChild(els.logBody.lastChild);
        }
    }
}

// ================= STATUS POLLING =================
async function fetchStatus() {
    try {
        const data = await apiCall('/api/status');
        state.rpm = data.motor?.rpm || 0;
        state.power = data.motor?.power || 0;
        state.isRunning = data.motor?.running || false;
        state.speed = data.motor?.speed || 0;
        state.runtime = data.motor?.runtime || '00:00';
        
        updateStats();
        updateStatusBadge();
        updateStartButton();
        
        if (els.speedValue) els.speedValue.textContent = state.speed;
        document.getElementById('slider-speed')?.setAttribute('value', state.speed);
    } catch (err) {
        console.warn('Status fetch failed');
    }
}

// ================= EVENT LISTENERS =================
document.addEventListener('DOMContentLoaded', async function() {
    
    await loadCurrentUser();
    
    // 🛠️ RE-ATTACH EVENT LISTENERS SAFELY
    if (els.startBtn) els.startBtn.addEventListener('click', toggleMotor);
    if (els.estopBtn) els.estopBtn.addEventListener('click', emergencyStop);
    
    const slider = document.getElementById('slider-speed');
    if (slider) slider.addEventListener('input', (e) => updateSpeed(e.target.value));
    
    if (els.addStepBtn) els.addStepBtn.addEventListener('click', addSequenceStep);
    if (els.runSeqBtn) els.runSeqBtn.addEventListener('click', runSequence);
    
    // Enter key for sequence inputs
    const angleInput = document.getElementById('seq-angle');
    const sleepInput = document.getElementById('seq-sleep');
    if (angleInput) angleInput.addEventListener('keypress', (e) => e.key === 'Enter' && addSequenceStep());
    if (sleepInput) sleepInput.addEventListener('keypress', (e) => e.key === 'Enter' && addSequenceStep());
    
    // Initial load
    await fetchStatus();
    await refreshSequence();
    addLog("🚀 Dashboard", "Ready!", "success");
    
    // Auto-refresh
    setInterval(async () => {
        await fetchStatus();
        await refreshSequence();
    }, 1000);
});

window.dashboard = { deleteStep };