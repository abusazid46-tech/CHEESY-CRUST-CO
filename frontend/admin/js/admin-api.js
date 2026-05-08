// Admin API Service - Updated for Admin JWT
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
                // Admin token expired, try refresh
                const refreshed = await this.refreshToken();
                if (!refreshed) {
                    this.forceLogout();
                    return;
                }
                // Retry request with new token
                options.headers = this.getHeaders();
                const retryResponse = await fetch(`${ADMIN_API_BASE}${endpoint}`, options);
                return await retryResponse.json();
            }
            
            return await response.json();
        } catch (error) {
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
            
            const data = await response.json();
            if (data.access_token) {
                this.token = data.access_token;
                localStorage.setItem('admin_token', data.access_token);
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed');
        }
        return false;
    }
    
    forceLogout() {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_refresh_token');
        localStorage.removeItem('admin_data');
        window.location.href = 'index.html';
    }
    
    // ... rest of API methods same as before ...
}

const adminApi = new AdminApiService();

// Check auth on every admin page
function requireAdminAuth() {
    const token = localStorage.getItem('admin_token');
    const adminData = JSON.parse(localStorage.getItem('admin_data') || '{}');
    
    if (!token || !adminData.email) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Logout function
async function adminLogout() {
    try {
        await adminApi.request('/admin/auth/logout', { method: 'POST' });
    } catch (error) {}
    
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_data');
    window.location.href = 'index.html';
}

// ... rest of the file (formatCurrency, formatDate, showAdminToast) same as before ...
