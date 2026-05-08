
// Admin API Service
const ADMIN_API_BASE = 'https://cheesy-crust-api.onrender.com/api/v1';

class AdminApiService {
    constructor() {
        this.token = localStorage.getItem('admin_token');
    }
    
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }
    
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
                ...options,
                headers: this.getHeaders()
            });
            
            if (response.status === 401) {
                localStorage.clear();
                window.location.href = 'index.html';
                return;
            }
            
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
    
    // Dashboard
    async getDashboard() {
        return this.request('/admin/dashboard');
    }
    
    async getSalesSummary(period = 'week') {
        return this.request(`/admin/sales-summary?period=${period}`);
    }
    
    // Orders
    async getOrders(page = 1, status = '') {
        let url = `/orders/admin/all?page=${page}&per_page=20`;
        if (status) url += `&status=${status}`;
        return this.request(url);
    }
    
    async updateOrderStatus(orderId, status) {
        return this.request(`/orders/admin/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
    }
    
    // Menu
    async getMenu() {
        return this.request('/menu');
    }
    
    async createMenuItem(itemData) {
        return this.request('/menu', {
            method: 'POST',
            body: JSON.stringify(itemData)
        });
    }
    
    async updateMenuItem(itemId, itemData) {
        return this.request(`/menu/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify(itemData)
        });
    }
    
    async deleteMenuItem(itemId) {
        return this.request(`/menu/${itemId}`, {
            method: 'DELETE'
        });
    }
    
    // Reservations
    async getReservations(page = 1, date = '', status = '') {
        let url = `/reservation/admin/all?page=${page}&per_page=20`;
        if (date) url += `&date_filter=${date}`;
        if (status) url += `&status=${status}`;
        return this.request(url);
    }
    
    async updateReservationStatus(id, status) {
        return this.request(`/reservation/admin/${id}/status?status=${status}`, {
            method: 'PATCH'
        });
    }
    
    // Customers
    async getCustomers(page = 1, search = '') {
        let url = `/admin/users?page=${page}&per_page=20`;
        if (search) url += `&search=${search}`;
        return this.request(url);
    }
    
    // Reviews
    async getAllReviews(page = 1) {
        return this.request(`/reviews?page=${page}&per_page=20`);
    }
    
    async moderateReview(reviewId, action) {
        return this.request(`/reviews/${reviewId}/${action}`, {
            method: 'PATCH'
        });
    }
    
    // Offers & Promos
    async getOffers() {
        return this.request('/admin/offers');
    }
    
    async createOffer(offerData) {
        return this.request('/admin/offers', {
            method: 'POST',
            body: JSON.stringify(offerData)
        });
    }
    
    async deleteOffer(offerId) {
        return this.request(`/admin/offers/${offerId}`, {
            method: 'DELETE'
        });
    }
    
    // Settings
    async getSettings() {
        return this.request('/admin/settings');
    }
    
    async updateSettings(settingsData) {
        return this.request('/admin/settings', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
    }
}

const adminApi = new AdminApiService();

// Check auth on every admin page
function requireAdminAuth() {
    const token = localStorage.getItem('admin_token');
    const adminData = JSON.parse(localStorage.getItem('admin_data') || '{}');
    
    if (!token || !adminData.is_admin) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Logout function
function adminLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_data');
    localStorage.removeItem('admin_phone');
    window.location.href = 'index.html';
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// Show toast
function showAdminToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc3545' : '#1a1814'};
        color: ${type === 'error' ? '#fff' : '#cda45e'};
        padding: 12px 24px;
        border-radius: 12px;
        border-left: 4px solid ${type === 'error' ? '#dc3545' : '#cda45e'};
        z-index: 9999;
        font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease;
    `;
    toast.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-triangle' : 'check-circle'} me-2"></i>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
