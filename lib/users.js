import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://soxwifnrwqkbfpvzdfkl.supabase.co";
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHdpZm5yd3FrYmZwdnpkZmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NTkyNzMsImV4cCI6MjA4MDAzNTI3M30.44Jzm3XP35KPMJlE7YCZ9Yp95Y0bPJX2cCIJ2ogmYxw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentAdmin = null;

const elements = {
    userForm: document.getElementById('userForm'),
    totalUsersEl: document.getElementById('totalUsers'),
    searchInput: document.getElementById('search'),
    usersTable: document.getElementById('usersTable'),
    noUsersMessage: document.getElementById('noUsersMessage'),
    userNameEl: document.getElementById('userDisplayName'),
    userRoleEl: document.getElementById('userRole'),
    userNameEl0: document.getElementById('userName0')
};

function showToast(message, type = 'info', duration = 4000) {
    const icons = { success: 'check-circle', danger: 'exclamation-triangle', warn: 'exclamation-circle', info: 'info-circle' };
    const toast = document.createElement('div');
    toast.innerHTML = `<i class="fas fa-${icons[type]} mr-2"></i>${message}`;
    Object.assign(toast.style, {
        position: 'fixed', top: '20px', right: '20px',
        background: type === 'success' ? '#10b981' : type === 'danger' ? '#ef4444' : type === 'warn' ? '#f59e0b' : '#3b82f6',
        color: 'white', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
        zIndex: '9999', opacity: 0, transform: 'translateX(100%)', transition: 'all 0.3s ease',
        fontSize: '14px', fontWeight: 500, maxWidth: '400px', backdropFilter: 'blur(10px)'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => { 
        toast.style.opacity = '1'; 
        toast.style.transform = 'translateX(0)'; 
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

async function loadCurrentUser() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            showToast('🔐 Please log in to manage users', 'warn');
            setTimeout(() => window.location.href = '../index.html', 1500);
            return;
        }

        // Get admin info from 'users' table
        const { data: adminData, error: userError } = await supabase
            .from('users')
            .select('id, name, username, role')
            .eq('id', user.id)
            .maybeSingle();

        if (userError) throw userError;
        if (!adminData) throw new Error("Admin profile not found in 'users' table");

        currentAdmin = {
            id: user.id,                    // Important: UUID for filtering
            email: user.email,
            username: adminData.username || 'admin',
            name: adminData.name || 'Admin',
            role: adminData.role || 'admin'
        };

        // Update UI
        if (elements.userNameEl) elements.userNameEl.textContent = currentAdmin.name;
        if (elements.userRoleEl) elements.userRoleEl.textContent = currentAdmin.role.charAt(0).toUpperCase()+ currentAdmin.role.slice(1);
        if (elements.userNameEl0) elements.userNameEl0.textContent = currentAdmin.name;

        fetchCreatedUsers();
    } catch (err) {
        console.error('Load admin error:', err);
        showToast('Authentication or profile load failed', 'danger');
    }
}

async function fetchCreatedUsers(searchTerm = '') {
    if (!currentAdmin?.id) return;

    try {
        let query = supabase
            .from('userscompany')
            .select('*')
            .eq('created_by', currentAdmin.id)           // ← Only users created by this admin
            .order('created_at', { ascending: false });

        if (searchTerm.trim()) {
            query = query.or(`username1.ilike.%${searchTerm}%,email1.ilike.%${searchTerm}%,role.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        renderUsersTable(data || []);
    } catch (err) {
        console.error('Fetch users error:', err);
        showToast('Failed to load users list', 'danger');
    }
}

function renderUsersTable(users) {
    if (elements.totalUsersEl) elements.totalUsersEl.textContent = users.length;

    if (!elements.usersTable || !elements.noUsersMessage) return;

    if (users.length === 0) {
        elements.usersTable.style.display = 'none';
        elements.noUsersMessage.classList.remove('hidden');
        return;
    }

    elements.usersTable.style.display = 'table';
    elements.noUsersMessage.classList.add('hidden');
    elements.usersTable.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors group';
        row.innerHTML = `
        <td class="px-6 py-4">
            <div class="flex items-center">
                <div class="w-10 h-10 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 
                    rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-lg">
                    ${user.username1?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div class="ml-4 min-w-0 flex-1">
                    <div class="text-sm font-semibold text-gray-900 truncate" title="${user.username1}">
                        ${user.username1 || 'N/A'}
                    </div>
                    <div class="text-xs text-gray-500 truncate" title="${user.email1}">
                        ${user.email1 || 'No email'}
                    </div>
                </div>
            </div>
        </td>
        <td class="px-6 py-4">
            <span class="role-badge ${getRoleStyle(user.role)} px-3 py-1 rounded-full text-xs font-medium">
                ${user.role?.toUpperCase() || 'VIEWER'}
            </span>
        </td>
        <td class="px-6 py-4">
            <span class="status-badge bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs">
                <i class="fas fa-circle mr-1 text-xs"></i>Active
            </span>
        </td>
        <td class="px-6 py-4 text-sm text-gray-500">
            ${user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
            }) : 'N/A'}
        </td>
        <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-all">
                <button onclick="editUser('${user.id}')"
                    class="p-2.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all shadow-sm"
                    title="Edit">
                    <i class="fas fa-edit text-sm"></i>
                </button>
                <button onclick="deleteUser('${user.id}')"
                    class="p-2.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-xl transition-all shadow-sm"
                    title="Delete">
                    <i class="fas fa-trash text-sm"></i>
                </button>
            </div>
        </td>
        `;
        elements.usersTable.appendChild(row);
    });
}

function getRoleStyle(role) {
    const styles = {
        admin: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg',
        operator: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg',
        viewer: 'bg-gray-200 text-gray-800 shadow-sm'
    };
    return styles[role?.toLowerCase()] || styles.viewer;
}

/* ====================== CREATE USER ====================== */
if (elements.userForm) {
    elements.userForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username')?.value?.trim();
        const role = document.getElementById('role')?.value;

        if (!username || !role) {
            showToast('Please enter username and select a role', 'warn');
            return;
        }

        if (!currentAdmin?.id) {
            showToast('Admin session incomplete — please log in again', 'danger');
            return;
        }

        const cleanAdmin = currentAdmin.username.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/-+/g, '-');
        const cleanUser = username.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/-+/g, '-');
        const generatedEmail = `${cleanUser}@${cleanAdmin}.finalgate`;

        try {
            showToast('🟢 Creating user...', 'info');

            const { error: dbError } = await supabase.from('userscompany').insert([{
                username1: username,
                email1: generatedEmail,
                role: role,
                created_by: currentAdmin.id,           // ← Critical for isolation
                admin_username: currentAdmin.username,
                admin_domain: `${cleanAdmin}.finalgate`,
                created_at: new Date().toISOString()
            }]);

            if (dbError) throw dbError;

            showToast(`✅ "${username}" created successfully!<br><small>📧 ${generatedEmail}</small>`, 'success', 6000);
            
            elements.userForm.reset();
            fetchCreatedUsers(elements.searchInput?.value || '');

        } catch (err) {
            console.error('Insert error:', err);
            let msg = 'Failed to create user';

            if (err.code === '23505') msg = 'Username or email already exists';
            else if (err.code === '23502') msg = 'Missing required field';
            else if (err.message) msg = err.message;

            showToast(`❌ ${msg}`, 'danger', 8000);
        }
    });
}

/* ====================== SEARCH ====================== */
if (elements.searchInput) {
    elements.searchInput.addEventListener('input', debounce((e) => {
        fetchCreatedUsers(e.target.value);
    }, 300));
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/* ====================== ACTIONS ====================== */
window.editUser = async (userId) => {
    showToast('✏️ Edit feature coming soon!', 'info');
};
window.deleteUser = async (userId) => {
    showToast('🗑️ Deleting user...', 'info');
    
    try {
        const { error } = await supabase
            .from('userscompany')
            .delete()
            .eq('id', userId)
            .eq('created_by', currentAdmin.id);

        if (error) throw error;

        showToast('✅ User deleted successfully', 'success');
        fetchCreatedUsers(elements.searchInput?.value || '');
    } catch (err) {
        console.error('Delete error:', err);
        showToast('❌ Failed to delete user', 'danger');
    }
};
/* ====================== AUTH LISTENER ====================== */
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
        window.location.href = '../index.html';
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadCurrentUser();
    }
});

/* ====================== INIT ====================== */
document.addEventListener('DOMContentLoaded', () => {
    loadCurrentUser();
});