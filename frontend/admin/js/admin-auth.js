// Admin Authentication
const API_BASE_URL = 'https://cheesy-crust-api.onrender.com/api/v1';

// Check if already logged in as admin
function checkAdminAuth() {
    const token = localStorage.getItem('admin_token');
    const adminData = JSON.parse(localStorage.getItem('admin_data') || '{}');
    
    if (token && adminData.is_admin) {
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

// Send OTP
document.getElementById('sendOtpBtn').addEventListener('click', async () => {
    const phone = document.getElementById('adminPhone').value.trim();
    
    if (!phone || phone.length < 10) {
        showMessage('Please enter a valid phone number', 'error');
        return;
    }
    
    document.getElementById('sendOtpBtn').disabled = true;
    document.getElementById('sendOtpBtn').innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Sending...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('loginStep').style.display = 'none';
            document.getElementById('otpStep').style.display = 'block';
            showMessage('OTP sent successfully! Check your phone.', 'success');
        } else {
            showMessage(data.detail || 'Failed to send OTP', 'error');
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
    } finally {
        document.getElementById('sendOtpBtn').disabled = false;
        document.getElementById('sendOtpBtn').innerHTML = '<i class="fas fa-paper-plane me-2"></i>Send OTP';
    }
});

// Verify OTP
document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
    const phone = document.getElementById('adminPhone').value.trim();
    const otp = document.getElementById('otpInput').value.trim();
    
    if (!otp || otp.length < 6) {
        showMessage('Please enter a valid OTP', 'error');
        return;
    }
    
    document.getElementById('verifyOtpBtn').disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
        });
        
        const data = await response.json();
        console.log('Verify Response:', data);  // Debug line
        
        // CHECK BOTH POSSIBLE RESPONSE FORMATS
        const token = data.access_token || data.token;
        const isAdmin = data.is_admin || data.user?.is_admin || false;
        
        if (token && isAdmin) {
            localStorage.setItem('admin_token', token);
            localStorage.setItem('admin_data', JSON.stringify(data));
            localStorage.setItem('admin_phone', phone);
            
            showMessage('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else if (token && !isAdmin) {
            showMessage('Access denied. Admin privileges required.', 'error');
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_data');
        } else {
            showMessage('Invalid OTP. Please try again.', 'error');
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
    } finally {
        document.getElementById('verifyOtpBtn').disabled = false;
    }
});

// Back button
document.getElementById('backToPhoneBtn').addEventListener('click', () => {
    document.getElementById('loginStep').style.display = 'block';
    document.getElementById('otpStep').style.display = 'none';
    document.getElementById('otpInput').value = '';
    showMessage('', 'info');
});
