// admin-auth.js
(function() {
    'use strict';
    
    // ========== CONFIGURATION ==========
    // IMPORTANT: Update this URL to match your deployed backend
    const API_URL = 'https://your-app-name.onrender.com/api';
    // For local testing: const API_URL = 'http://localhost:8000/api';
    
    console.log('API URL configured as:', API_URL);
    
    // ========== HELPER FUNCTIONS ==========
    function showError(message) {
        console.error('Error:', message);
        
        // Check if alert element exists
        const alertEl = document.getElementById('loginAlert');
        if (alertEl) {
            alertEl.textContent = message;
            alertEl.style.display = 'block';
            
            // Hide after 5 seconds
            setTimeout(() => {
                alertEl.style.display = 'none';
            }, 5000);
        } else {
            alert(message); // Fallback to browser alert
        }
    }
    
    function showSuccess(message) {
        const alertEl = document.getElementById('loginAlert');
        if (alertEl) {
            alertEl.className = 'alert alert-success';
            alertEl.textContent = message;
            alertEl.style.display = 'block';
        }
    }
    
    // ========== LOGIN HANDLER ==========
    async function handleLogin(event) {
        event.preventDefault();
        
        console.log('Login attempt started');
        
        // Get form elements
        const email = document.getElementById('email')?.value;
        const password = document.getElementById('password')?.value;
        const submitBtn = document.getElementById('loginButton');
        
        if (!email || !password) {
            showError('Please enter email and password');
            return;
        }
        
        console.log('Attempting login for:', email);
        
        // Disable button and show loading state
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
        }
        
        try {
            const loginUrl = `${API_URL}/admin/login`;
            console.log('Sending request to:', loginUrl);
            
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ 
                    email: email, 
                    password: password 
                }),
                // Add this for credentials/cookies if needed
                credentials: 'include'
            });
            
            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);
            
            // Try to parse response
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
                console.log('Response data:', data);
            } else {
                const text = await response.text();
                console.log('Response text:', text);
                throw new Error(`Unexpected response type: ${contentType}`);
            }
            
            if (response.ok) {
                showSuccess('Login successful! Redirecting...');
                
                // Store token if provided
                if (data.access_token) {
                    localStorage.setItem('adminToken', data.access_token);
                    localStorage.setItem('adminData', JSON.stringify(data.admin || data.user));
                }
                
                // Redirect after short delay
                setTimeout(() => {
                    window.location.href = data.redirect_url || '/admin/dashboard.html';
                }, 1000);
            } else {
                const errorMsg = data.detail || data.message || 'Login failed';
                showError(errorMsg);
            }
            
        } catch (error) {
            console.error('Login error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            
            if (error.message === 'Failed to fetch') {
                showError('Cannot connect to server. Please check:\n' +
                         '1. Your internet connection\n' +
                         '2. The server is running\n' +
                         '3. The API URL is correct: ' + API_URL);
            } else {
                showError('Login failed: ' + error.message);
            }
            
        } finally {
            // Re-enable button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Login';
            }
        }
    }
    
    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Admin auth initialized');
        console.log('API URL:', API_URL);
        
        // Check for existing session
        const token = localStorage.getItem('adminToken');
        if (token) {
            console.log('Existing token found');
            // Optionally verify token validity
        }
        
        // Attach login handler
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            console.log('Login form found, attaching handler');
            loginForm.addEventListener('submit', handleLogin);
        } else {
            console.error('Login form not found! Check if form id="loginForm" exists');
        }
        
        // Test API connection
        fetch(`${API_URL}/health`)
            .then(res => {
                if (res.ok) {
                    console.log('✅ API connection successful');
                } else {
                    console.warn('⚠️ API returned status:', res.status);
                }
            })
            .catch(err => {
                console.error('❌ Cannot reach API:', err.message);
                showError('Cannot connect to server. The API might be down or the URL is incorrect.');
            });
    });
    
})();
