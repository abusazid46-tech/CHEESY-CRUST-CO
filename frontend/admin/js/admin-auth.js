// admin-auth.js - Complete Working Version
(function() {
    'use strict';
    
    const API_BASE = 'https://cheesy-crust-api.onrender.com';
    
    // Show message helper
    function showMessage(message, type = 'danger') {
        const messageBox = document.getElementById('messageBox');
        if (messageBox) {
            const colors = {
                success: '#28a745',
                danger: '#dc3545',
                warning: '#ffc107',
                info: '#cda45e'
            };
            const icons = {
                success: 'fa-check-circle',
                danger: 'fa-exclamation-triangle',
                warning: 'fa-exclamation-circle',
                info: 'fa-info-circle'
            };
            messageBox.innerHTML = `
                <div style="color: ${colors[type] || colors.info}; font-size: 0.9rem; padding: 8px;">
                    <i class="fas ${icons[type] || icons.info} me-2"></i>${message}
                </div>
            `;
        }
    }
    
    // Toggle password visibility
    document.addEventListener('DOMContentLoaded', function() {
        const toggleBtn = document.getElementById('togglePassword');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function() {
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
        
        // Remember me - restore saved email
        const rememberedEmail = localStorage.getItem('rememberedAdminEmail');
        if (rememberedEmail) {
            const emailInput = document.getElementById('adminEmail');
            const rememberCheckbox = document.getElementById('rememberMe');
            if (emailInput) emailInput.value = rememberedEmail;
            if (rememberCheckbox) rememberCheckbox.checked = true;
        }
        
        // Auto-focus email field
        setTimeout(() => {
            const emailInput = document.getElementById('adminEmail');
            if (emailInput) emailInput.focus();
        }, 500);
    });
    
    // Login function
    async function handleLogin(event) {
        event.preventDefault();
        console.log('=== Login Attempt Started ===');
        
        const emailInput = document.getElementById('adminEmail');
        const passwordInput = document.getElementById('adminPassword');
        const rememberCheckbox = document.getElementById('rememberMe');
        const loginBtn = document.getElementById('loginBtn');
        
        if (!emailInput || !passwordInput) {
            showMessage('Form fields not found. Please refresh the page.', 'warning');
            return;
        }
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        // Validation
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
        if (password.length < 6) {
            showMessage('Password must be at least 6 characters', 'warning');
            return;
        }
        
        // Remember me
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
        showMessage('Connecting to server...', 'info');
        
        try {
            const loginUrl = `${API_BASE}/api/v1/admin/auth/login`;
            console.log('POST:', loginUrl);
            console.log('Body:', { email, password: '***' });
            
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            console.log('Status:', response.status);
            
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                const text = await response.text();
                console.error('Invalid JSON response:', text);
                showMessage('Server returned invalid response. Please try again.', 'danger');
                return;
            }
            
            console.log('Response:', data);
            
            // Check success
            if (response.ok && data.success === true && data.access_token) {
                // STORE TOKENS WITH CORRECT KEYS
                localStorage.setItem('admin_token', data.access_token);
                localStorage.setItem('admin_refresh_token', data.refresh_token);
                
                // Store admin data
                const adminData = data.admin || {};
                localStorage.setItem('admin_data', JSON.stringify(adminData));
                
                // Verify storage
                const storedToken = localStorage.getItem('admin_token');
                console.log('Token stored successfully:', !!storedToken);
                console.log('Token preview:', storedToken?.substring(0, 30) + '...');
                
                showMessage('Login successful! Redirecting to dashboard...', 'success');
                
                // Redirect after short delay
                setTimeout(() => {
                    window.location.replace('dashboard.html');
                }, 1000);
                
            } else if (data.success === true && !data.access_token) {
                showMessage('Login succeeded but no token received. Contact support.', 'warning');
            } else {
                const errorMsg = data.detail || data.message || 'Invalid email or password';
                showMessage(errorMsg, 'danger');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            if (error.message === 'Failed to fetch') {
                showMessage('Cannot connect to server. Check your internet connection.', 'danger');
            } else {
                showMessage('Connection error: ' + error.message, 'danger');
            }
        } finally {
            // Reset button
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Sign In';
            }
        }
    }
    
    // Initialize form
    const form = document.getElementById('adminLoginForm');
    if (form) {
        form.addEventListener('submit', handleLogin);
        console.log('Login form initialized and ready');
    } else {
        console.error('Login form not found! Check HTML for id="adminLoginForm"');
    }
    
})();
