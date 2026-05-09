// admin-auth.js - With CORRECT API endpoints from OpenAPI spec
(function() {
    'use strict';
    
    // ========== CORRECT API CONFIGURATION ==========
    const API_BASE = 'https://cheesy-crust-api.onrender.com';
    const API_VERSION = '/api/v1';
    const API_URL = `${API_BASE}${API_VERSION}`;
    
    const ENDPOINTS = {
        health: `${API_BASE}/health`,
        login: `${API_URL}/admin/auth/login`,
        logout: `${API_URL}/admin/auth/logout`,
        profile: `${API_URL}/admin/auth/me`,
        dashboard: `${API_URL}/admin/dashboard`
    };
    
    console.log('🔧 API Base:', API_BASE);
    console.log('🔧 API URL:', API_URL);
    console.log('🔧 Login URL:', ENDPOINTS.login);
    
    // ========== UTILITY FUNCTIONS ==========
    function showMessage(message, type = 'danger') {
        console.log(`[${type}] ${message}`);
        
        const messageBox = document.getElementById('messageBox');
        if (messageBox) {
            messageBox.innerHTML = `
                <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                    ${message}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
        }
    }
    
    // Toggle password visibility
    const togglePasswordBtn = document.getElementById('togglePassword');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', function() {
            const passwordInput = document.getElementById('adminPassword');
            const icon = this.querySelector('i');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    }
    
    // Remember me functionality
    document.addEventListener('DOMContentLoaded', function() {
        const rememberedEmail = localStorage.getItem('rememberedAdminEmail');
        if (rememberedEmail) {
            const emailInput = document.getElementById('adminEmail');
            const rememberCheckbox = document.getElementById('rememberMe');
            if (emailInput) emailInput.value = rememberedEmail;
            if (rememberCheckbox) rememberCheckbox.checked = true;
        }
    });
    
    // ========== API HELPER ==========
    async function apiCall(endpoint, options = {}) {
        const token = localStorage.getItem('adminToken');
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(endpoint, {
            ...options,
            headers,
            mode: 'cors',
            credentials: 'include'
        });
        
        return response;
    }
    
    // ========== LOGIN HANDLER ==========
    async function handleLogin(event) {
        event.preventDefault();
        console.log('📝 Login attempt started');
        
        // Get form elements
        const emailInput = document.getElementById('adminEmail');
        const passwordInput = document.getElementById('adminPassword');
        const rememberCheckbox = document.getElementById('rememberMe');
        const loginBtn = document.getElementById('loginBtn');
        
        // Validate elements exist
        if (!emailInput || !passwordInput) {
            showMessage('Login form fields not found. Please refresh the page.', 'warning');
            return;
        }
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        // Validate inputs
        if (!email) {
            showMessage('Please enter your email address', 'warning');
            emailInput.focus();
            return;
        }
        
        if (!password) {
            showMessage('Please enter your password', 'warning');
            passwordInput.focus();
            return;
        }
        
        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showMessage('Please enter a valid email address', 'warning');
            emailInput.focus();
            return;
        }
        
        // Handle Remember Me
        if (rememberCheckbox && rememberCheckbox.checked) {
            localStorage.setItem('rememberedAdminEmail', email);
        } else {
            localStorage.removeItem('rememberedAdminEmail');
        }
        
        // Show loading state
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';
        }
        
        try {
            console.log('📡 POST:', ENDPOINTS.login);
            console.log('📦 Body:', { email, password: '***' });
            
            const response = await apiCall(ENDPOINTS.login, {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            
            console.log('📨 Status:', response.status);
            
            // Parse response
            let data;
            try {
                data = await response.json();
                console.log('📋 Response:', data);
            } catch (e) {
                console.error('Failed to parse response:', e);
                throw new Error('Invalid server response');
            }
            
            if (response.ok && data.success !== false) {
                console.log('✅ Login successful');
                
                // Store authentication data based on your API response structure
                // From OpenAPI: AdminLoginResponse has access_token, refresh_token, admin
                if (data.access_token) {
                    localStorage.setItem('adminToken', data.access_token);
                    console.log('🔑 Access token stored');
                }
                
                if (data.refresh_token) {
                    localStorage.setItem('adminRefreshToken', data.refresh_token);
                    console.log('🔑 Refresh token stored');
                }
                
                if (data.admin) {
                    localStorage.setItem('adminData', JSON.stringify(data.admin));
                    console.log('👤 Admin data stored:', data.admin.name || data.admin.email);
                }
                
                showMessage(data.message || 'Login successful! Redirecting...', 'success');
                
                // Redirect to dashboard
                const redirectUrl = '/admin/dashboard.html';
                console.log('🔄 Redirecting to:', redirectUrl);
                
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1000);
                
            } else {
                // Handle error
                const errorMsg = data.detail || data.message || 'Invalid credentials';
                console.error('❌ Login failed:', errorMsg);
                
                if (response.status === 401) {
                    showMessage('Invalid email or password', 'danger');
                } else if (response.status === 403) {
                    showMessage('Account is disabled. Contact support.', 'danger');
                } else if (response.status === 429) {
                    showMessage('Too many attempts. Please try again later.', 'warning');
                } else if (response.status === 422) {
                    // Validation error
                    const details = data.detail;
                    if (Array.isArray(details)) {
                        const messages = details.map(d => d.msg).join(', ');
                        showMessage(`Validation error: ${messages}`, 'warning');
                    } else {
                        showMessage(`Validation error: ${JSON.stringify(details)}`, 'warning');
                    }
                } else {
                    showMessage(errorMsg, 'danger');
                }
            }
            
        } catch (error) {
            console.error('💥 Login error:', error);
            
            if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                showMessage(`
                    <strong>Server Connection Failed</strong><br>
                    <small>Cannot reach: ${API_BASE}</small><br>
                    <small>Please check your internet connection and try again.</small>
                `, 'danger');
            } else {
                showMessage(`Login failed: ${error.message}`, 'danger');
            }
        } finally {
            // Reset button state
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Sign In';
            }
        }
    }
    
    // ========== CHECK AUTH STATUS ==========
    async function checkAuthStatus() {
        const token = localStorage.getItem('adminToken');
        if (!token) return false;
        
        try {
            const response = await apiCall(ENDPOINTS.profile, {
                method: 'GET'
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Already authenticated as:', data.email || data.name);
                return true;
            } else if (response.status === 401) {
                // Token expired
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminRefreshToken');
                localStorage.removeItem('adminData');
                return false;
            }
        } catch (error) {
            console.log('Auth check failed:', error);
            return false;
        }
        
        return false;
    }
    
    // ========== INITIALIZATION ==========
    async function init() {
        console.log('🚀 Admin Auth initializing...');
        console.log('🌐 API Base:', API_BASE);
        console.log('🔗 Login Endpoint:', ENDPOINTS.login);
        
        // Check if already authenticated
        const isAuthenticated = await checkAuthStatus();
        if (isAuthenticated) {
            console.log('✅ Already logged in, redirecting to dashboard...');
            window.location.href = '/admin/dashboard.html';
            return;
        }
        
        // Find form
        const form = document.getElementById('adminLoginForm');
        if (form) {
            console.log('✅ Admin login form found');
            form.addEventListener('submit', handleLogin);
        } else {
            console.error('❌ Login form not found!');
            showMessage('Page error: Login form not found. Please refresh.', 'warning');
            return;
        }
        
        // Test API connection
        console.log('🔍 Testing API connection...');
        try {
            const response = await fetch(ENDPOINTS.health, { 
                method: 'GET',
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ API is reachable:', data);
                showMessage('Connected to server successfully!', 'success');
            } else {
                console.warn('⚠️ Health check returned status:', response.status);
            }
        } catch (error) {
            console.warn('⚠️ Health check failed:', error.message);
            console.log('💡 This might be OK if health endpoint is not configured');
        }
        
        console.log('✅ Initialization complete');
        console.log('💡 API Documentation:', `${API_BASE}/docs`);
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
