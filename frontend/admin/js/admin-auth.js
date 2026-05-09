// admin-auth.js - Working Version
(function() {
    'use strict';
    
    const API_BASE = 'https://cheesy-crust-api.onrender.com';
    
    function showMessage(message, type = 'danger') {
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
        
        // Remember me
        const rememberedEmail = localStorage.getItem('rememberedAdminEmail');
        if (rememberedEmail) {
            const emailInput = document.getElementById('adminEmail');
            const rememberCheckbox = document.getElementById('rememberMe');
            if (emailInput) emailInput.value = rememberedEmail;
            if (rememberCheckbox) rememberCheckbox.checked = true;
        }
    });
    
    // Login function - DIRECT FETCH, no wrapper
    async function handleLogin(event) {
        event.preventDefault();
        console.log('Login attempt started');
        
        const emailInput = document.getElementById('adminEmail');
        const passwordInput = document.getElementById('adminPassword');
        const rememberCheckbox = document.getElementById('rememberMe');
        const loginBtn = document.getElementById('loginBtn');
        
        if (!emailInput || !passwordInput) {
            showMessage('Form fields not found', 'warning');
            return;
        }
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            showMessage('Please enter email and password', 'warning');
            return;
        }
        
        if (rememberCheckbox && rememberCheckbox.checked) {
            localStorage.setItem('rememberedAdminEmail', email);
        } else {
            localStorage.removeItem('rememberedAdminEmail');
        }
        
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';
        }
        
        try {
            const loginUrl = `${API_BASE}/api/v1/admin/auth/login`;
            console.log('POST:', loginUrl);
            
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            console.log('Status:', response.status);
            const data = await response.json();
            console.log('Response:', data);
            
            if (response.ok && data.success) {
                localStorage.setItem('adminToken', data.access_token);
                localStorage.setItem('adminRefreshToken', data.refresh_token);
                localStorage.setItem('adminData', JSON.stringify(data.admin));
                
                showMessage('Login successful! Redirecting...', 'success');
                
                setTimeout(() => {
                    window.location.href = '/admin/dashboard.html';
                }, 1000);
            } else {
                const errorMsg = data.message || data.detail || 'Login failed';
                showMessage(errorMsg, 'danger');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('Connection failed: ' + error.message, 'danger');
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Sign In';
            }
        }
    }
    
    // Initialize
    const form = document.getElementById('adminLoginForm');
    if (form) {
        form.addEventListener('submit', handleLogin);
        console.log('Login form initialized');
    }
})();
