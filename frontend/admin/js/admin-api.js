// Admin API Service - Complete
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
                headers: {
                    ...this.getHeaders(),
                    ...options.headers
                }
            });
            
            // Only redirect on 401 for protected endpoints
            if (response.status === 401 && !endpoint.includes('/admin/auth/login')) {
                // Try token refresh first
                const refreshed = await this.refreshToken();
                if (!refreshed) {
                    this.forceLogout();
                    throw new Error('Session expired');
                }
                // Retry with new token
                const retryResponse = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
                    ...options,
                    headers: this.getHeaders()
                });
                if (retryResponse.status === 401) {
                    this.forceLogout();
                    throw new Error('Session expired');
                }
                return await retryResponse.json();
            }
            
            return await response.json();
        } catch (error) {
            if (error.message === 'Session expired') {
                throw error;
            }
            console.error('API Error:', error);
            throw error;
        }
    }
    
    async refreshToken() {
        const refreshToken = localStorage.getItem('admin_refresh_token');
        if (!refreshToken) return false;
        
        try {
            const response = await fetch(`${ADMIN_API_BASE}/admin/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken })
            });
            
            if (!response.ok) return false;
            
            const data = await response.json();
            if (data.access_token) {
                this.token = data.access_token;
                localStorage.setItem('admin_token', data.access_token);
                if (data.refresh_token) {
                    localStorage.setItem('admin_refresh_token', data.refresh_token);
                }
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
        }
        return false;
    }
    
    forceLogout() {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_refresh_token');
        localStorage.removeItem('admin_data');
        window.location.href = 'index.html';
    }
}
    
    // ========== DASHBOARD ==========
    async getDashboard() {
        return this.request('/admin/dashboard');
    }
    
    async getSalesSummary(period = 'week') {
        return this.request(`/admin/sales-summary?period=${period}`);
    }
    
    // ========== ORDERS ==========
    async getOrders(page = 1, status = '', perPage = 20) {
        let url = `/orders/admin/all?page=${page}&per_page=${perPage}`;
        if (status) url += `&status=${status}`;
        return this.request(url);
    }
    
    async getOrderById(orderId) {
        return this.request(`/orders/${orderId}`);
    }
    
    async updateOrderStatus(orderId, status) {
        return this.request(`/orders/admin/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
    }
    
    async getOrderStats() {
        return this.request('/admin/order-stats');
    }
    
    // ========== MENU MANAGEMENT ==========
    async getMenu(page = 1, perPage = 50) {
        return this.request(`/menu?page=${page}&per_page=${perPage}`);
    }
    
    async getMenuItemById(itemId) {
        return this.request(`/menu/${itemId}`);
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
    
    async toggleMenuItemAvailability(itemId) {
        return this.request(`/menu/${itemId}/toggle-availability`, {
            method: 'PATCH'
        });
    }
    
    async getMenuCategories() {
        return this.request('/menu/categories');
    }
    
    // ========== RESERVATIONS ==========
    async getReservations(page = 1, date = '', status = '', perPage = 20) {
        let url = `/reservation/admin/all?page=${page}&per_page=${perPage}`;
        if (date) url += `&date_filter=${date}`;
        if (status) url += `&status=${status}`;
        return this.request(url);
    }
    
    async getReservationById(id) {
        return this.request(`/reservation/${id}`);
    }
    
    async updateReservationStatus(id, status) {
        return this.request(`/reservation/admin/${id}/status?status=${status}`, {
            method: 'PATCH'
        });
    }
    
    async getReservationSlots(date, guests) {
        return this.request(`/reservation/slots/${date}?guests=${guests}`);
    }
    
    async checkReservationAvailability(date, time, guests) {
        return this.request(`/reservation/availability?date=${date}&time=${time}&guests=${guests}`);
    }
    
    // ========== CUSTOMERS ==========
    async getCustomers(page = 1, search = '', perPage = 20) {
        let url = `/admin/users?page=${page}&per_page=${perPage}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        return this.request(url);
    }
    
    async getCustomerById(userId) {
        return this.request(`/admin/users/${userId}`);
    }
    
    async getCustomerOrders(userId) {
        return this.request(`/admin/users/${userId}/orders`);
    }
    
    async getCustomerReservations(userId) {
        return this.request(`/admin/users/${userId}/reservations`);
    }
    
    async updateCustomerStatus(userId, isActive) {
        return this.request(`/admin/users/${userId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: isActive })
        });
    }
    
    async getCustomerStats() {
        return this.request('/admin/customer-stats');
    }
    
    // ========== REVIEWS ==========
    async getReviews(page = 1, perPage = 20) {
        return this.request(`/admin/reviews?page=${page}&per_page=${perPage}`);
    }
    
    async getPendingReviews() {
        return this.request('/admin/reviews/pending');
    }
    
    async approveReview(reviewId) {
        return this.request(`/admin/reviews/${reviewId}/approve`, {
            method: 'PATCH'
        });
    }
    
    async rejectReview(reviewId) {
        return this.request(`/admin/reviews/${reviewId}/reject`, {
            method: 'PATCH'
        });
    }
    
    async deleteReview(reviewId) {
        return this.request(`/admin/reviews/${reviewId}`, {
            method: 'DELETE'
        });
    }
    
    async getReviewStats() {
        return this.request('/admin/review-stats');
    }
    
    // ========== OFFERS & PROMOS ==========
    async getOffers() {
        return this.request('/admin/offers');
    }
    
    async getActiveOffers() {
        return this.request('/admin/offers/active');
    }
    
    async createOffer(offerData) {
        return this.request('/admin/offers', {
            method: 'POST',
            body: JSON.stringify(offerData)
        });
    }
    
    async updateOffer(offerId, offerData) {
        return this.request(`/admin/offers/${offerId}`, {
            method: 'PUT',
            body: JSON.stringify(offerData)
        });
    }
    
    async deleteOffer(offerId) {
        return this.request(`/admin/offers/${offerId}`, {
            method: 'DELETE'
        });
    }
    
    async toggleOfferStatus(offerId) {
        return this.request(`/admin/offers/${offerId}/toggle`, {
            method: 'PATCH'
        });
    }
    
    // ========== ANALYTICS ==========
    async getRevenueAnalytics(period = 'month') {
        return this.request(`/admin/analytics/revenue?period=${period}`);
    }
    
    async getOrderAnalytics(period = 'month') {
        return this.request(`/admin/analytics/orders?period=${period}`);
    }
    
    async getTopSellingItems(limit = 10) {
        return this.request(`/admin/analytics/top-items?limit=${limit}`);
    }
    
    async getPeakHours() {
        return this.request('/admin/analytics/peak-hours');
    }
    
    async getCustomerRetention() {
        return this.request('/admin/analytics/customer-retention');
    }
    
    async getDailyReport(date) {
        return this.request(`/admin/analytics/daily-report?date=${date}`);
    }
    
    async getMonthlyReport(month) {
        return this.request(`/admin/analytics/monthly-report?month=${month}`);
    }
    
    async exportOrdersReport(format = 'csv', startDate = '', endDate = '') {
        let url = `/admin/export/orders?format=${format}`;
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;
        return this.request(url);
    }
    
    async exportRevenueReport(format = 'csv', period = 'month') {
        return this.request(`/admin/export/revenue?format=${format}&period=${period}`);
    }
    
    // ========== SETTINGS ==========
    async getSettings() {
        return this.request('/admin/settings');
    }
    
    async updateSettings(settingsData) {
        return this.request('/admin/settings', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
    }
    
    async getBusinessHours() {
        return this.request('/admin/settings/business-hours');
    }
    
    async updateBusinessHours(hoursData) {
        return this.request('/admin/settings/business-hours', {
            method: 'PUT',
            body: JSON.stringify(hoursData)
        });
    }
    
    async getDeliverySettings() {
        return this.request('/admin/settings/delivery');
    }
    
    async updateDeliverySettings(deliveryData) {
        return this.request('/admin/settings/delivery', {
            method: 'PUT',
            body: JSON.stringify(deliveryData)
        });
    }
    
    async getNotificationSettings() {
        return this.request('/admin/settings/notifications');
    }
    
    async updateNotificationSettings(notifData) {
        return this.request('/admin/settings/notifications', {
            method: 'PUT',
            body: JSON.stringify(notifData)
        });
    }
    
    // ========== ADMIN PROFILE ==========
    async getAdminProfile() {
        return this.request('/admin/auth/me');
    }
    
    async updateAdminProfile(profileData) {
        return this.request('/admin/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }
    
    async changePassword(currentPassword, newPassword) {
        return this.request('/admin/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
    }
    
    async createAdminUser(adminData) {
        return this.request('/admin/auth/create', {
            method: 'POST',
            body: JSON.stringify(adminData)
        });
    }
    
    async getAdminUsers() {
        return this.request('/admin/auth/users');
    }
    
    // ========== NOTIFICATIONS ==========
    async getNotifications(page = 1) {
        return this.request(`/admin/notifications?page=${page}`);
    }
    
    async markNotificationRead(notifId) {
        return this.request(`/admin/notifications/${notifId}/read`, {
            method: 'PATCH'
        });
    }
    
    async markAllNotificationsRead() {
        return this.request('/admin/notifications/read-all', {
            method: 'PATCH'
        });
    }
    
    async getUnreadNotificationCount() {
        return this.request('/admin/notifications/unread-count');
    }
    
    // ========== BULK OPERATIONS ==========
    async bulkUpdateOrderStatus(orderIds, status) {
        return this.request('/admin/orders/bulk-status', {
            method: 'PATCH',
            body: JSON.stringify({ order_ids: orderIds, status })
        });
    }
    
    async bulkDeleteMenuItems(itemIds) {
        return this.request('/admin/menu/bulk-delete', {
            method: 'DELETE',
            body: JSON.stringify({ item_ids: itemIds })
        });
    }
    
    async bulkExportData(type, filters = {}) {
        return this.request(`/admin/export/${type}`, {
            method: 'POST',
            body: JSON.stringify(filters)
        });
    }
}

// Create singleton instance
const adminApi = new AdminApiService();

// ========== AUTH GUARD ==========
function requireAdminAuth() {
    const token = localStorage.getItem('admin_token');
    const adminData = JSON.parse(localStorage.getItem('admin_data') || '{}');
    
    if (!token || !adminData.email) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// ========== LOGOUT ==========
async function adminLogout() {
    try {
        await adminApi.request('/admin/auth/logout', { method: 'POST' });
    } catch (error) {
        console.log('Logout API call failed, clearing local data');
    }
    
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_data');
    localStorage.removeItem('admin_email_remembered');
    window.location.href = 'index.html';
}

// ========== UTILITY FUNCTIONS ==========
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '₹0';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function timeAgo(dateString) {
    if (!dateString) return 'N/A';
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(dateString);
}

function showAdminToast(message, type = 'success') {
    // Remove existing toasts
    const existingToast = document.querySelector('.admin-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#1a1814'};
        color: ${type === 'warning' ? '#0c0b09' : '#fff'};
        padding: 14px 24px;
        border-radius: 14px;
        border-left: 4px solid ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#cda45e'};
        z-index: 9999;
        font-weight: 500;
        font-size: 0.95rem;
        box-shadow: 0 12px 32px rgba(0,0,0,0.4);
        animation: slideInRight 0.3s ease;
        max-width: 400px;
    `;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-triangle',
        warning: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas ${icons[type] || icons.info}" style="color: ${type === 'error' ? '#fff' : type === 'warning' ? '#0c0b09' : '#cda45e'};"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; color: #888; cursor: pointer; font-size: 1.2rem; margin-left: auto;">
                &times;
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Add animation styles if not already in admin.css
if (!document.getElementById('admin-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'admin-toast-styles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(120%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// ========== PAGE LOADER ==========
function showPageLoader() {
    const loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(12,11,9,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9998;
    `;
    loader.innerHTML = `
        <div style="text-align: center;">
            <div style="width: 50px; height: 50px; border: 3px solid rgba(205,164,94,0.2); 
                        border-top: 3px solid #cda45e; border-radius: 50%; 
                        animation: spin 0.8s linear infinite; margin: 0 auto 15px;"></div>
            <p style="color: #cda45e; font-weight: 500;">Loading...</p>
        </div>
    `;
    document.body.appendChild(loader);
}

function hidePageLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) loader.remove();
}

// ========== CONFIRMATION DIALOG ==========
function showConfirmDialog(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    overlay.innerHTML = `
        <div style="background: #1a1814; border-radius: 20px; padding: 2rem; max-width: 420px; width: 90%;
                    border: 1px solid rgba(205,164,94,0.3); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <i class="fas fa-question-circle" style="font-size: 3rem; color: #cda45e;"></i>
            </div>
            <p style="color: #fff; text-align: center; margin-bottom: 2rem; font-size: 1.1rem;">${message}</p>
            <div style="display: flex; gap: 12px;">
                <button class="btn-cancel" style="flex: 1; background: transparent; border: 1px solid #3a352e; color: #bbb; 
                        padding: 12px; border-radius: 12px; cursor: pointer; font-weight: 600;">
                    Cancel
                </button>
                <button class="btn-confirm" style="flex: 1; background: linear-gradient(135deg, #cda45e, #b58d4a); 
                        border: none; color: #0c0b09; padding: 12px; border-radius: 12px; cursor: pointer; font-weight: 700;">
                    Confirm
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('.btn-cancel').addEventListener('click', () => {
        overlay.remove();
        if (onCancel) onCancel();
    });
    
    overlay.querySelector('.btn-confirm').addEventListener('click', () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
            if (onCancel) onCancel();
        }
    });
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    // Check auth on protected pages
    const protectedPages = [
        'dashboard.html', 'orders.html', 'menu-management.html',
        'reservations.html', 'customers.html', 'reviews.html',
        'offers-promos.html', 'analytics.html', 'settings.html'
    ];
    
    const currentPage = window.location.pathname.split('/').pop();
    if (protectedPages.includes(currentPage)) {
        requireAdminAuth();
    }
    
    // Set today's date for date inputs
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (!input.value) input.max = today;
    });
});

// Export for use in other scripts
window.AdminApiService = AdminApiService;
window.adminApi = adminApi;
window.requireAdminAuth = requireAdminAuth;
window.adminLogout = adminLogout;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.timeAgo = timeAgo;
window.showAdminToast = showAdminToast;
window.showPageLoader = showPageLoader;
window.hidePageLoader = hidePageLoader;
window.showConfirmDialog = showConfirmDialog;
