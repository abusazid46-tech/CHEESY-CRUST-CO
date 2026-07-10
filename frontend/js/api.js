// API Configuration
const API_BASE_URL = window.API_BASE_URL || (
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
        ? 'http://localhost:8000/api/v1'
        : 'https://whitesmoke-jay-438498.hostingersite.com/api/v1'
);

const STORAGE_KEYS = {
    token: 'auth_token',
    refreshToken: 'refresh_token',
    userPhone: 'user_phone',
    userEmail: 'user_email',
    userName: 'user_name',
    isAdmin: 'is_admin'
};

function getStoredJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
        return fallback;
    }
}

function normalizeApiError(data, status) {
    if (Array.isArray(data?.detail)) {
        return data.detail.map(item => item.msg || JSON.stringify(item)).join(', ');
    }
    return data?.detail || data?.message || `Request failed (${status})`;
}

class ApiService {
    constructor() {
        this.token = localStorage.getItem(STORAGE_KEYS.token);
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem(STORAGE_KEYS.token, token);
    }

    setSession(session) {
        if (session.access_token) this.setToken(session.access_token);
        if (session.refresh_token) localStorage.setItem(STORAGE_KEYS.refreshToken, session.refresh_token);
        if (session.phone) localStorage.setItem(STORAGE_KEYS.userPhone, session.phone);
        if (session.email) localStorage.setItem(STORAGE_KEYS.userEmail, session.email);
        if (session.name) localStorage.setItem(STORAGE_KEYS.userName, session.name);
        localStorage.setItem(STORAGE_KEYS.isAdmin, String(Boolean(session.is_admin)));
    }

    getToken() {
        this.token = localStorage.getItem(STORAGE_KEYS.token);
        return this.token;
    }

    clearToken() {
        this.token = null;
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = { ...(options.headers || {}) };
        const hasBody = options.body !== undefined && options.body !== null;

        if (hasBody && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        if (this.getToken()) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        let response;
        try {
            response = await fetch(url, { ...options, headers });
        } catch (error) {
            throw new Error('Unable to reach the server. Please try again.');
        }

        const text = await response.text();
        const data = text ? safeJsonParse(text) : null;

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                this.clearToken();
            }
            throw new Error(normalizeApiError(data, response.status));
        }

        return data;
    }

    async register({ name, email, phone, password }) {
        const response = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, phone, password })
        });
        this.setSession(response);
        return response;
    }

    async login(identifier, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });
        this.setSession(response);
        return response;
    }

    async logout() {
        try {
            await this.request('/auth/logout', { method: 'POST' });
        } finally {
            this.clearToken();
        }
    }

    async getProfile() {
        return this.request('/user/profile');
    }

    async updateProfile(profileData) {
        return this.request('/user/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }

    async getMenu(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/menu${query ? `?${query}` : ''}`);
    }

    async getMenuByCategory(category) {
        return this.request(`/menu/category/${encodeURIComponent(category)}`);
    }

    async createMenuItem(item) {
        try {
            return await this.request('/menu', {
                method: 'POST',
                body: JSON.stringify(item)
            });
        } catch (error) {
            if (!isValidationError(error)) throw error;
            return this.request('/menu', {
                method: 'POST',
                body: JSON.stringify({ request: item, payload: {} })
            });
        }
    }

    async updateMenuItem(itemId, item) {
        try {
            return await this.request(`/menu/${encodeURIComponent(itemId)}`, {
                method: 'PUT',
                body: JSON.stringify(item)
            });
        } catch (error) {
            if (!isValidationError(error)) throw error;
            return this.request(`/menu/${encodeURIComponent(itemId)}`, {
                method: 'PUT',
                body: JSON.stringify({ request: item, payload: {} })
            });
        }
    }

    async deleteMenuItem(itemId) {
        return this.request(`/menu/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    }

    async getCart() {
        return this.request('/cart');
    }

    async addToCart(itemId, quantity = 1) {
        return this.request('/cart/add', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId, quantity })
        });
    }

    async removeFromCart(itemId) {
        return this.request(`/cart/remove/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    }

    async updateCartItem(itemId, quantity) {
        return this.request('/cart/update', {
            method: 'PUT',
            body: JSON.stringify({ item_id: itemId, quantity })
        });
    }

    async clearCart() {
        return this.request('/cart/clear', { method: 'DELETE' });
    }

    async createOrder(orderData) {
        return this.request('/orders/create', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    }

    async getUserOrders() {
        return this.request('/orders/user');
    }

    async getAllOrders(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/orders/admin/all${query ? `?${query}` : ''}`);
    }

    async updateOrderStatus(orderId, status, notes = null) {
        const payload = { status, notes };
        try {
            return await this.request(`/orders/admin/${encodeURIComponent(orderId)}/status`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        } catch (error) {
            if (!isValidationError(error)) throw error;
            return this.request(`/orders/admin/${encodeURIComponent(orderId)}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ request: payload, payload: {} })
            });
        }
    }

    async createPaymentOrder(amount, orderId = null, reservationId = null) {
        return this.request('/payment/create-order', {
            method: 'POST',
            body: JSON.stringify({ amount, order_id: orderId, reservation_id: reservationId })
        });
    }

    async verifyPayment(paymentData) {
        return this.request('/payment/verify', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        });
    }

    async createReservation(reservationData) {
        return this.request('/reservation', {
            method: 'POST',
            body: JSON.stringify(normalizeReservationPayload(reservationData))
        });
    }

    async getUserReservations() {
        return this.request('/reservation/user');
    }

    async getAllReservations(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/reservation/admin/all${query ? `?${query}` : ''}`);
    }

    async updateReservationStatus(reservationId, status) {
        return this.request(`/reservation/admin/${encodeURIComponent(reservationId)}/status?status=${encodeURIComponent(status)}`, {
            method: 'PATCH'
        });
    }

    async getDashboard() {
        return this.request('/admin/dashboard');
    }

    async getSalesSummary(period = 'week') {
        return this.request(`/admin/sales-summary?period=${encodeURIComponent(period)}`);
    }
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

function isValidationError(error) {
    return /field required|validation|422/i.test(error.message || '');
}

function normalizeReservationPayload(reservationData) {
    const reservation = reservationData.reservation || reservationData;
    const preorderItems = reservation.preorder_items || reservation.preorderItems || [];
    return {
        name: String(reservation.name || '').trim(),
        phone: String(reservation.phone || '').trim(),
        date: reservation.date,
        time: reservation.time,
        guests: Number(reservation.guests),
        special_requests: reservation.special_requests || reservation.specialRequests || null,
        preorder_items: preorderItems.map(item => ({
            item_id: item.item_id || item.id,
            name: item.name,
            price: Number(item.price),
            quantity: Number(item.quantity || 1)
        }))
    };
}

function normalizeMenuItem(item) {
    return {
        id: item._id || item.id,
        name: item.name,
        category: item.category,
        price: Number(item.price || 0),
        description: item.description || '',
        img: item.image_url || item.img || 'https://via.placeholder.com/400',
        image_url: item.image_url || item.img || 'https://via.placeholder.com/400',
        is_available: item.is_available !== false,
        rating: item.rating || { avg: 0, count: 0 }
    };
}

function normalizeCartItem(item) {
    return {
        id: item.item_id || item.id || item._id,
        item_id: item.item_id || item.id || item._id,
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        img: item.image_url || item.img || 'https://via.placeholder.com/100',
        image_url: item.image_url || item.img || 'https://via.placeholder.com/100'
    };
}

function localCart() {
    return getStoredJson('local_cart', []).filter(item => isBackendItemId(item.item_id || item.id));
}

function saveLocalCart(items) {
    localStorage.setItem('local_cart', JSON.stringify(items));
}

function isBackendItemId(value) {
    return /^\d+$/.test(String(value || '')) || /^[a-f\d]{24}$/i.test(String(value || ''));
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    const icon = type === 'error' ? 'exclamation-triangle' : type === 'info' ? 'info-circle' : 'check-circle';
    toast.innerHTML = `<i class="fas fa-${icon}" style="color: var(--gold); margin-right: 8px;"></i>${escapeHtml(message)}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function setLoading(element, isLoading, label = 'Working...') {
    if (!element) return;
    if (isLoading) {
        element.dataset.originalHtml = element.innerHTML;
        element.disabled = true;
        element.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${label}`;
    } else {
        element.disabled = false;
        if (element.dataset.originalHtml) element.innerHTML = element.dataset.originalHtml;
    }
}

function isAuthenticated() {
    return Boolean(api.getToken());
}

function logoutUser(redirectTo = 'index.html') {
    api.clearToken();
    window.location.href = redirectTo;
}

function formatPrice(price) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0
    }).format(Number(price || 0));
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);
}

async function updateCartCount() {
    const badge = document.getElementById('cart-count');
    if (!badge) return;
    const count = localCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    badge.innerText = count;
}

const api = new ApiService();
