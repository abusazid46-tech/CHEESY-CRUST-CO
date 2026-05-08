// Admin Authentication - Email/Password JWT Based
const API_BASE_URL = 'https://cheesy-crust-api.onrender.com/api/v1';

// Check if already logged in
function checkAdminAuth() {
    const token = localStorage.getItem('admin_token');
    const adminData = JSON.parse(localStorage.getItem('admin_data') || '{}');
    
    if (token && adminData.email) {
        window.location.href = 'dashboard.html';
        return;
    }
}

checkAdminAuth();

// Show message
function showMessage(message, type = 'info') {
    const box = document.getElementById('messageBox');
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        info: '#cda45e'
    };
    box.innerHTML = `<span style="color: ${colors[type]};">${message}</span>`;
}

// Toggle password visibility
document.getElementById('togglePassword').addEventListener('click', function() {
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

// Handle login
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    if (!email || !password) {
        showMessage('Please fill in all fields', 'error');
        return;
    }
    
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Signing in...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        console.log('Login Response:', data);
        
        if (data.success && data.access_token) {
            // Store admin tokens
            localStorage.setItem('admin_token', data.access_token);
            localStorage.setItem('admin_refresh_token', data.refresh_token);
            localStorage.setItem('admin_data', JSON.stringify(data.admin));
            
            if (rememberMe) {
                localStorage.setItem('admin_email_remembered', email);
            }
            
            showMessage('Login successful! Redirecting...', 'success');
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            showMessage(data.detail || 'Invalid email or password', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Network error. Please check your connection.', 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Sign In';
    }
});

// Load remembered email
const rememberedEmail = localStorage.getItem('admin_email_remembered');
if (rememberedEmail) {
    document.getElementById('adminEmail').value = rememberedEmail;
    document.getElementById('rememberMe').checked = true;
}
