import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://soxwifnrwqkbfpvzdfkl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHdpZm5yd3FrYmZwdnpkZmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NTkyNzMsImV4cCI6MjA4MDAzNTI3M30.44Jzm3XP35KPMJlE7YCZ9Yp95Y0bPJX2cCIJ2ogmYxw';

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

let currentUser = null;
let selectedStandardId = null;
let standards = [];
let activeStandardId = null;

const els = {
    userNameEl: document.getElementById('userDisplayName'),
    userRoleEl: document.getElementById('userRole')
};

// ==============================
// Initialize
// ==============================
document.addEventListener('DOMContentLoaded', async () => {
    const userLoaded = await loadCurrentUser();
    if (!userLoaded) return;

    await loadStandards();
    setupEventListeners();
});

// ==============================
// Load Current User
// ==============================
async function loadCurrentUser() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user?.id) {
            window.location.href = '../index.html';
            return false;
        }

        const user = session.user;

        const { data: companyUser } = await supabaseClient
            .from('userscompany')
            .select('username1, role, email1')
            .eq('email1', user.email)
            .maybeSingle();

        currentUser = companyUser
            ? {
                id: user.id,
                email: companyUser.email1,
                name: companyUser.username1,
                role: companyUser.role || 'viewer'
              }
            : {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || 'Admin',
                role: 'admin'
              };

        if (els.userNameEl) els.userNameEl.textContent = currentUser.name;
        if (els.userRoleEl) els.userRoleEl.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

        applyRolePermissions(currentUser.role);
        return true;
    } catch (err) {
        console.error('Auth error:', err);
        window.location.href = '../index.html';
        return false;
    }
}

function applyRolePermissions(role) {
    if (role !== 'admin') {
        const adminElements = document.querySelectorAll('.delete-btn, #deleteSelectedBtn, #saveStandardBtn, #setActiveBtn');
        adminElements.forEach(el => {
            if (el) el.style.display = 'none';
        });

        // Disable form for non-admins
        const formInputs = ['#productIdInput', '#descriptionInput', '#imageInput'];
        formInputs.forEach(selector => {
            const input = document.querySelector(selector);
            if (input) input.disabled = true;
        });
    }
}

// ==============================
// Event Listeners
// ==============================
function setupEventListeners() {
    const saveBtn = document.getElementById('saveStandardBtn');
    const imageInput = document.getElementById('imageInput');
    const productInput = document.getElementById('productIdInput');

    if (saveBtn) saveBtn.addEventListener('click', saveStandard);
    if (imageInput) imageInput.addEventListener('change', previewImage);
    if (productInput) productInput.addEventListener('input', toggleSaveButton);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', filterStandards);

    document.getElementById('clearSelectionBtn')?.addEventListener('click', clearSelection);
    document.getElementById('deleteSelectedBtn')?.addEventListener('click', deleteSelectedStandard);
    document.getElementById('setActiveBtn')?.addEventListener('click', setActiveStandard);

    const standardsGrid = document.getElementById('standardsGrid');
    if (standardsGrid) standardsGrid.addEventListener('click', handleGridInteraction);

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '../index.html';
    });
}

// ==============================
// Load Standards (User Isolated)
// ==============================
async function loadStandards() {
    if (!currentUser?.id) return;

    try {
        const { data, error } = await supabaseClient
            .from('standard_reference')
            .select('*')
            .eq('created_by', currentUser.id)        // ← Only this user's standards
            .order('created_at', { ascending: false });

        if (error) throw error;

        standards = data || [];
        activeStandardId = standards.find(s => s.is_active)?.id || null;

        renderStandards();
    } catch (err) {
        console.error('Error loading standards:', err);
        showError('Failed to load standards');
    }
}

// ==============================
// Render Standards Grid
// ==============================
function renderStandards(filteredList = null) {
    const grid = document.getElementById('standardsGrid');
    if (!grid) return;

    const list = filteredList || standards;

    if (!list.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images text-4xl mb-4 text-gray-400"></i>
                <h3 class="text-lg font-semibold text-gray-500 mb-2">No standards yet</h3>
                <p class="text-gray-400">Add your first standard reference using the form above</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = list.map(standard => {
        const isSelected = selectedStandardId === standard.id;
        const isActive = standard.is_active;

        return `
            <div class="standard-card card p-4 relative 
                        ${isSelected ? 'selected ring-4 ring-green-200 ring-opacity-50' : ''} 
                        ${isActive ? 'active-standard' : ''}" 
                 data-id="${standard.id}">
                
                ${currentUser?.role === 'admin' ? `
                    <button class="delete-btn absolute top-3 right-3 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-all" 
                            onclick="deleteStandard('${standard.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
                
                <div class="w-full h-32 bg-gray-100 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
                    ${standard.image_url ? 
                        `<img src="${standard.image_url}" alt="${standard.description}" 
                              class="w-full h-full object-cover"
                              onerror="this.parentElement.innerHTML='<i class=\'fas fa-image text-gray-400 text-2xl\'></i>'">` :
                        `<i class="fas fa-image text-gray-400 text-2xl"></i>`
                    }
                </div>
                
                <div class="font-semibold text-sm line-clamp-2 mb-1">${standard.description}</div>
                <div class="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">${standard.product_id}</div>
                <div class="text-xs text-gray-500 mt-1">
                    ${new Date(standard.created_at).toLocaleDateString()}
                    ${isActive ? ' <span class="text-orange-600 font-bold">★ ACTIVE</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ==============================
// Grid Click Handler
// ==============================
window.handleGridInteraction = function(e) {
    const card = e.target.closest('.standard-card');
    const deleteBtn = e.target.closest('.delete-btn');

    if (deleteBtn) {
        e.stopPropagation();
        return;
    }

    if (card) {
        selectStandard(card.dataset.id);
    }
};
window.deleteStandard = async function(id) {
    if (!currentUser?.id) return;

    const standard = standards.find(s => s.id === id);
    showNotification(`🗑️ Deleting "${standard?.description || 'Standard'}"...`, 'info');

    try {
        const { error } = await supabaseClient
            .from('standard_reference')
            .delete()
            .eq('id', id)
            .eq('created_by', currentUser.id);

        if (error) throw error;

        await loadStandards();
        if (selectedStandardId === id) clearSelection();

        showNotification('✅ Standard deleted successfully', 'success');
    } catch (err) {
        console.error('Delete error:', err);
        showNotification('❌ Failed to delete: ' + (err.message || 'Unknown error'), 'error');
    }
};

// ==============================
// Selection & Activate
// ==============================
function selectStandard(id) {
    document.querySelectorAll('.standard-card').forEach(c => c.classList.remove('selected'));

    selectedStandardId = id;
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) card.classList.add('selected');

    const selectedStandard = standards.find(s => s.id === id);
    if (selectedStandard) {
        updateSelectedInfo(selectedStandard);
        setActiveStandard();        // Auto-activate when selected
    }
}

function updateSelectedInfo(standard) {
    document.getElementById('selectedProductId').textContent = standard.product_id || '';
    document.getElementById('selectedDescription').textContent = standard.description || '';
    document.getElementById('selectedImage').src = standard.image_url || '';

    const setActiveBtn = document.getElementById('setActiveBtn');
    if (setActiveBtn) {
        if (standard.is_active) {
            setActiveBtn.innerHTML = '✅ <strong>ACTIVE STANDARD</strong>';
            setActiveBtn.disabled = true;
        } else {
            setActiveBtn.innerHTML = '⚡ Set as Active Standard';
            setActiveBtn.disabled = false;
        }
    }
}

function clearSelection() {
    selectedStandardId = null;
    document.querySelectorAll('.standard-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('selectedInfo').classList.add('hidden');
}

async function deleteSelectedStandard() {
    if (selectedStandardId) await window.deleteStandard(selectedStandardId);
}

async function setActiveStandard() {
    if (!selectedStandardId || !currentUser?.id) return;

    try {
        // Deactivate all user's standards
        await supabaseClient
            .from('standard_reference')
            .update({ is_active: false })
            .eq('created_by', currentUser.id);

        // Activate the selected one
        const { error } = await supabaseClient
            .from('standard_reference')
            .update({ is_active: true })
            .eq('id', selectedStandardId)
            .eq('created_by', currentUser.id);

        if (error) throw error;

        await loadStandards();
        showNotification('🎯 Active standard updated', 'success');

    } catch (err) {
        console.error('Activate error:', err);
        showNotification('❌ Failed to update active standard', 'error');
    }
}

// ==============================
// Filter & Form Helpers
// ==============================
function filterStandards() {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const filtered = standards.filter(s =>
        (s.product_id || '').toLowerCase().includes(query) ||
        (s.description || '').toLowerCase().includes(query)
    );
    renderStandards(filtered);
}

function previewImage() {
    const file = document.getElementById('imageInput')?.files[0];
    const preview = document.getElementById('imagePreview');
    if (!preview || !file) return;

    const reader = new FileReader();
    reader.onload = e => {
        preview.querySelector('img').src = e.target.result;
        preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    toggleSaveButton();
}

function toggleSaveButton() {
    const productId = document.getElementById('productIdInput')?.value.trim();
    const saveBtn = document.getElementById('saveStandardBtn');
    if (saveBtn) saveBtn.disabled = !productId || currentUser?.role !== 'admin';
}

// ==============================
// Save Standard (with created_by)
// ==============================
async function saveStandard() {
    if (currentUser?.role !== 'admin') return;

    const productId = document.getElementById('productIdInput').value.trim();
    const description = document.getElementById('descriptionInput').value.trim();
    const file = document.getElementById('imageInput').files[0];

    if (!productId) return showNotification('❌ Product ID is required', 'error');

    try {
        let imageUrl = '';

        if (file) {
            const timestamp = Date.now();
            const safeName = `standard_${productId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}.jpg`;
            const filePath = `standards/${safeName}`;

            const { error: uploadError } = await supabaseClient.storage
                .from('product-images')
                .upload(filePath, file, { upsert: true, contentType: 'image/jpeg' });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabaseClient.storage.from('product-images').getPublicUrl(filePath);
            imageUrl = urlData.publicUrl;
        }

        const { error: dbError } = await supabaseClient
            .from('standard_reference')
            .upsert([{
                product_id: productId,
                description: description || `${productId} Reference`,
                image_url: imageUrl,
                is_active: standards.length === 0,   // Auto activate first one
                created_by: currentUser.id           // ← Critical for isolation
            }], { onConflict: 'product_id' });

        if (dbError) throw dbError;

        await loadStandards();
        resetForm();
        showNotification('✅ Standard saved successfully!', 'success');

    } catch (err) {
        console.error('Save error:', err);
        showNotification('❌ ' + (err.message || 'Failed to save standard'), 'error');
    }
}

function resetForm() {
    ['productIdInput', 'descriptionInput', 'imageInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('imagePreview')?.classList.add('hidden');
    toggleSaveButton();
}

// ==============================
// Notifications
// ==============================
function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl text-white font-medium max-w-sm ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showError(message) {
    const grid = document.getElementById('standardsGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="text-center py-12 text-red-500">
                <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                <div class="text-lg font-bold mb-4">${message}</div>
                <button onclick="location.reload()" class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600">
                    🔄 Reload Page
                </button>
            </div>`;
    }
}