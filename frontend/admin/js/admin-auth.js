// admin-auth.js - Matched to your HTML structure
(function() {
    'use strict';
    
    // ========== CONFIGURATION ==========
    // Change this to your actual Render backend URL
    const API_URL = 'https://cheesy-crust-co.onrender.com/api';
    console.log('🔧 API URL:', API_URL);
    
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
    
    // ========== LOGIN HANDLER ==========
    async function handleLogin(event) {
        event.preventDefault();
        console.log('📝 Login attempt started');
        
        // Get form elements - matching your HTML IDs
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
            const loginUrl = `${API_URL}/admin/login`;
            console.log('📡 POST:', loginUrl);
            console.log('📦 Body:', { email, password: '***' });
            
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ email, password }),
                mode: 'cors',
                credentials: 'include'
            });
            
            console.log('📨 Status:', response.status);
            
            // Try to parse JSON response
            let data;
            try {
                data = await response.json();
                console.log('📋 Response:', data);
            } catch (e) {
                console.error('Failed to parse response:', e);
                throw new Error('Invalid server response');
            }
            
            if (response.ok) {
                console.log('✅ Login successful');
                
                // Store authentication data
                if (data.access_token || data.token) {
                    const token = data.access_token || data.token;
                    localStorage.setItem('adminToken', token);
                    console.log('🔑 Token stored');
                    
                    // Store user data if available
                    if (data.admin || data.user) {
                        const adminData = data.admin || data.user;
                        localStorage.setItem('adminData', JSON.stringify(adminData));
                        console.log('👤 Admin data stored:', adminData.name || adminData.email);
                    }
                    
                    showMessage('Login successful! Redirecting...', 'success');
                    
                    // Redirect to dashboard
                    const redirectUrl = data.redirect_url || '/admin/dashboard.html';
                    console.log('🔄 Redirecting to:', redirectUrl);
                    
                    setTimeout(() => {
                        window.location.href = redirectUrl;
                    }, 1000);
                } else {
                    showMessage('No authentication token received', 'danger');
                }
                
            } else {
                // Handle different error status codes
                const errorMsg = data.detail || data.message || 'Invalid credentials';
                console.error('❌ Login failed:', errorMsg);
                
                if (response.status === 401) {
                    showMessage('Invalid email or password', 'danger');
                } else if (response.status === 403) {
                    showMessage('Account is disabled. Contact support.', 'danger');
                } else if (response.status === 429) {
                    showMessage('Too many attempts. Please try again later.', 'warning');
                } else {
                    showMessage(errorMsg, 'danger');
                }
            }
            
        } catch (error) {
            console.error('💥 Login error:', error);
            
            if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                showMessage(`
                    <strong>Server Connection Failed</strong><br>
                    <small>Cannot reach: ${API_URL}</small><br>
                    <small>Please check:</small><br>
                    <small>1. Your internet connection</small><br>
                    <small>2. The server is running</small><br>
                    <small>3. CORS is enabled</small>
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
    
    // ========== INITIALIZATION ==========
    function init() {
        console.log('🚀 Admin Auth initializing...');
        
        // Find form using the correct ID from your HTML
        const form = document.getElementById('adminLoginForm');
        
        if (form) {
            console.log('✅ Admin login form found');
            form.addEventListener('submit', handleLogin);
        } else {
            console.error('❌ Login form not found! Looking for id="adminLoginForm"');
            showMessage('Page error: Login form not found. Please refresh.', 'warning');
            return;
        }
        
        // Test API connection
        console.log('🔍 Testing API connection...');
        fetch(`${API_URL}/health`, { 
            method: 'GET',
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        })
            .then(res => {
                if (res.ok) {
                    console.log('✅ API is reachable');
                    return res.json();
                }
                throw new Error(`Status: ${res.status}`);
            })
            .then(data => {
                console.log('✅ Health check:', data);
            })
            .catch(err => {
                console.warn('⚠️ API health check failed:', err.message);
                console.warn('Login might still work if health endpoint is not configured');
            });
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
