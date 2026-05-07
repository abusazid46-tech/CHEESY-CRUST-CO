if (!isAuthenticated()) {
    window.location.href = 'index.html';
}

let currentProfile = null;

document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    document.getElementById('profileForm')?.addEventListener('submit', saveProfile);
    document.getElementById('addAddressBtn')?.addEventListener('click', addAddress);
    document.getElementById('logoutBtn')?.addEventListener('click', event => {
        event.preventDefault();
        logoutUser('index.html');
    });

    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => switchProfileTab(tab.getAttribute('data-tab')));
    });
});

async function loadProfile() {
    try {
        currentProfile = await api.getProfile();
        localStorage.setItem(STORAGE_KEYS.userPhone, currentProfile.phone || '');
        if (currentProfile.name) localStorage.setItem(STORAGE_KEYS.userName, currentProfile.name);
        renderProfile(currentProfile);
    } catch (error) {
        showToast(error.message, 'error');
        if (!isAuthenticated()) window.location.href = 'index.html';
    }
}

function renderProfile(profile) {
    const name = profile.name || 'Customer';
    document.getElementById('profileName').innerText = name;
    document.getElementById('profilePhone').innerHTML = `<i class="fas fa-phone-alt gold-icon"></i> ${escapeHtml(profile.phone || '')}`;
    document.getElementById('profileInitials').innerText = initials(name);
    document.getElementById('editName').value = profile.name || '';
    document.getElementById('editPhone').value = profile.phone || '';
    document.getElementById('editEmail').value = profile.email || '';
    document.getElementById('editDob').value = profile.dob || '';

    if (profile.created_at) {
        document.getElementById('profileMemberSince').innerHTML =
            `<i class="fas fa-calendar-alt gold-icon"></i> Member since ${new Date(profile.created_at).getFullYear()}`;
    }
}

async function saveProfile(event) {
    event.preventDefault();
    const button = event.submitter;
    const profile = {
        name: document.getElementById('editName').value.trim() || null,
        email: document.getElementById('editEmail').value.trim() || null,
        dob: document.getElementById('editDob').value || null
    };

    setLoading(button, true, 'Saving...');
    try {
        const response = await api.updateProfile(profile);
        currentProfile = response.user || { ...currentProfile, ...profile };
        if (currentProfile.name) localStorage.setItem(STORAGE_KEYS.userName, currentProfile.name);
        renderProfile(currentProfile);
        showToast('Profile updated successfully.');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setLoading(button, false);
    }
}

function switchProfileTab(tabId) {
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.profile-tab[data-tab="${tabId}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';

    if (tabId === 'orders') loadOrderHistory();
    if (tabId === 'addresses') loadAddresses();
    if (tabId === 'reviews') loadMyReviews();
}

async function loadOrderHistory() {
    const container = document.getElementById('orderHistoryContainer');
    container.innerHTML = '<p class="text-muted text-center py-4">Loading orders...</p>';
    try {
        const response = await api.getUserOrders();
        const orders = response.orders || [];
        if (!orders.length) {
            container.innerHTML = '<p class="text-muted text-center py-4">No orders yet. <a href="index.html#menu">Order now!</a></p>';
            return;
        }
        container.innerHTML = orders.map(renderOrder).join('');
    } catch (error) {
        container.innerHTML = `<p class="text-danger text-center py-4">${escapeHtml(error.message)}</p>`;
    }
}

function renderOrder(order) {
    const orderId = order.order_number || order._id || order.id;
    const status = order.status || 'pending';
    return `
        <div class="order-history-item">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h6>Order #${escapeHtml(orderId)}</h6>
                    <small>${order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}</small>
                </div>
                <span class="status-badge status-${escapeHtml(status)}">${escapeHtml(status)}</span>
            </div>
            <div>
                ${(order.items || []).map(item => `
                    <div class="d-flex justify-content-between">
                        <span>${Number(item.quantity || 1)}x ${escapeHtml(item.name)}</span>
                        <span>${formatPrice(Number(item.price || 0) * Number(item.quantity || 1))}</span>
                    </div>
                `).join('')}
            </div>
            <hr style="border-color: #3a352e;">
            <div class="d-flex justify-content-between">
                <strong>Total</strong>
                <strong style="color: var(--gold);">${formatPrice(order.total)}</strong>
            </div>
        </div>
    `;
}

function loadAddresses() {
    const addresses = currentProfile?.addresses || [];
    const container = document.getElementById('savedAddressesContainer');
    if (!addresses.length) {
        container.innerHTML = '<p class="text-muted">No saved addresses yet.</p>';
        return;
    }
    container.innerHTML = addresses.map(addr => `
        <div class="address-item" style="background: var(--card-light); padding: 1rem; border-radius: 12px; margin-bottom: 1rem;">
            <strong>${escapeHtml(addr.label || 'Address')}</strong>
            <p class="mb-1 mt-2">${escapeHtml(addr.full)}</p>
        </div>
    `).join('');
}

function addAddress() {
    showToast('Address management is not exposed by this profile form yet.', 'info');
}

function loadMyReviews() {
    const reviews = getStoredJson('user_reviews', []);
    const container = document.getElementById('myReviewsContainer');
    if (!reviews.length) {
        container.innerHTML = '<p class="text-muted text-center py-4">No reviews yet.</p>';
        return;
    }
    container.innerHTML = reviews.map(review => `
        <div style="background: var(--card-light); padding: 1rem; border-radius: 12px; margin-bottom: 1rem;">
            <div class="d-flex justify-content-between">
                <strong>${escapeHtml(review.itemName)}</strong>
                <span style="color: var(--gold);">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
            </div>
            <p class="mt-2 mb-0">${escapeHtml(review.comment)}</p>
            <small class="text-muted">${new Date(review.date).toLocaleDateString()}</small>
        </div>
    `).join('');
}

function initials(name) {
    return String(name || 'Customer').split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2);
}
