// ==================== ADMIN CRM SYSTEM ====================

// Check admin authentication
function checkAdminAuth() {
    const token = localStorage.getItem('auth_token');
    const isAdmin = localStorage.getItem('is_admin') === 'true';
    
    if (!token || !isAdmin) {
        // Try demo mode
        if (localStorage.getItem('admin_demo_mode') === 'true') {
            return true;
        }
        showAdminLogin();
        return false;
    }
    return true;
}

// Show admin login
function showAdminLogin() {
    document.getElementById('mainContent').innerHTML = `
        <div class="row justify-content-center mt-5">
            <div class="col-md-5">
                <div class="stat-card text-center p-5">
                    <img src="https://i.ibb.co/1JQyJGfH/logo.png" width="80" style="border-radius: 50%; margin-bottom: 20px;">
                    <h3 style="color: var(--gold);">Admin Login</h3>
                    <p class="text-muted mb-4">Enter admin credentials</p>
                    <div class="mb-3">
                        <input type="text" class="form-control mb-3" id="adminPhone" placeholder="Admin Phone" value="+917002012345">
                        <input type="password" class="form-control mb-3" id="adminPassword" placeholder="Password" value="admin123">
                    </div>
                    <button class="btn btn-gold w-100" onclick="adminLogin()">Sign In</button>
                    <button class="btn btn-outline-gold w-100 mt-2" onclick="enableDemoMode()">Demo Mode</button>
                </div>
            </div>
        </div>
    `;
}

// Admin login handler
async function adminLogin() {
    const phone = document.getElementById('adminPhone').value;
    
    try {
        // Try backend login
        await api.sendOTP(phone);
        const otp = prompt('Enter OTP (demo: 123456):');
        const response = await api.verifyOTP(phone, otp);
        
        if (response.is_admin) {
            localStorage.setItem('is_admin', 'true');
            showToast('Admin logged in successfully!', 'success');
            switchSection('dashboard');
        } else {
            showToast('Not an admin account', 'error');
        }
    } catch (error) {
        // Demo fallback
        enableDemoMode();
    }
}

// Enable demo mode
function enableDemoMode() {
    localStorage.setItem('admin_demo_mode', 'true');
    localStorage.setItem('auth_token', 'demo_admin_token');
    localStorage.setItem('is_admin', 'true');
    localStorage.setItem('user_name', 'Admin');
    localStorage.setItem('user_phone', '+917002012345');
    showToast('Demo mode enabled', 'success');
    switchSection('dashboard');
}

// ==================== SECTION SWITCHING ====================

let currentSection = 'dashboard';
let salesChart = null;

function switchSection(section) {
    currentSection = section;
    
    // Update sidebar active
    document.querySelectorAll('.sidebar-menu .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-section') === section) {
            link.classList.add('active');
        }
    });
    
    // Load section content
    switch (section) {
        case 'dashboard': loadDashboard(); break;
        case 'orders': loadOrders(); break;
        case 'menu': loadMenuManagement(); break;
        case 'reservations': loadReservations(); break;
        case 'customers': loadCustomers(); break;
        case 'reviews': loadReviews(); break;
        case 'analytics': loadAnalytics(); break;
    }
}

// ==================== DASHBOARD ====================

async function loadDashboard() {
    const content = document.getElementById('mainContent');
    
    // Get stats from localStorage
    const orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    const reservations = JSON.parse(localStorage.getItem('cheesy_reservations') || '[]');
    const reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
    
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const todayOrders = orders.filter(o => {
        const orderDate = new Date(o.timestamp || o.date);
        const today = new Date();
        return orderDate.toDateString() === today.toDateString();
    });
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed');
    
    content.innerHTML = `
        <div class="page-header">
            <h2><i class="fas fa-th-large gold-icon"></i> Dashboard</h2>
            <span class="text-muted">Last updated: ${new Date().toLocaleString()}</span>
        </div>
        
        <!-- Stat Cards -->
        <div class="row g-4 mb-4">
            <div class="col-md-3 col-sm-6">
                <div class="stat-card">
                    <div class="stat-icon gold"><i class="fas fa-rupee-sign"></i></div>
                    <div class="stat-value">₹${formatNumber(totalRevenue)}</div>
                    <div class="stat-label">Total Revenue</div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6">
                <div class="stat-card">
                    <div class="stat-icon green"><i class="fas fa-shopping-cart"></i></div>
                    <div class="stat-value">${orders.length}</div>
                    <div class="stat-label">Total Orders</div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6">
                <div class="stat-card">
                    <div class="stat-icon blue"><i class="fas fa-calendar-check"></i></div>
                    <div class="stat-value">${reservations.length}</div>
                    <div class="stat-label">Reservations</div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6">
                <div class="stat-card">
                    <div class="stat-icon red"><i class="fas fa-clock"></i></div>
                    <div class="stat-value">${pendingOrders.length}</div>
                    <div class="stat-label">Pending Orders</div>
                </div>
            </div>
        </div>
        
        <!-- Charts Row -->
        <div class="row g-4 mb-4">
            <div class="col-md-8">
                <div class="chart-container">
                    <h5 style="color: var(--gold); margin-bottom: 20px;">Sales Overview (Last 7 Days)</h5>
                    <canvas id="salesChart"></canvas>
                </div>
            </div>
            <div class="col-md-4">
                <div class="chart-container">
                    <h5 style="color: var(--gold); margin-bottom: 20px;">Today's Summary</h5>
                    <div style="text-align: center;">
                        <div class="stat-value" style="color: var(--gold);">${todayOrders.length}</div>
                        <div class="stat-label">Orders Today</div>
                        <hr style="border-color: #3a352e;">
                        <div class="stat-value" style="color: var(--success);">₹${formatNumber(todayOrders.reduce((s, o) => s + (o.total || 0), 0))}</div>
                        <div class="stat-label">Today's Revenue</div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Recent Orders -->
        <div class="chart-container">
            <h5 style="color: var(--gold); margin-bottom: 20px;">Recent Orders</h5>
            <div class="table-responsive">
                <table class="table admin-table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th>Total</th>
                            <th>Type</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orders.slice(-5).reverse().map(order => `
                            <tr>
                                <td><strong>${order.id || 'N/A'}</strong></td>
                                <td>${order.name || 'Guest'}</td>
                                <td>${Array.isArray(order.items) ? order.items.length : 0} items</td>
                                <td>₹${order.total || 0}</td>
                                <td><span class="badge bg-secondary">${order.order_type || 'N/A'}</span></td>
                                <td><span class="badge-status badge-${order.status || 'pending'}">${order.status || 'pending'}</span></td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" class="text-center text-muted">No orders yet</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Initialize chart
    setTimeout(initSalesChart, 500);
}

function initSalesChart() {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    if (salesChart) salesChart.destroy();
    
    const orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    const days = [];
    const revenues = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        days.push(dateStr);
        
        const dayOrders = orders.filter(o => {
            const orderDate = new Date(o.timestamp || o.date);
            return orderDate.toDateString() === date.toDateString();
        });
        revenues.push(dayOrders.reduce((sum, o) => sum + (o.total || 0), 0));
    }
    
    salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Revenue (₹)',
                data: revenues,
                backgroundColor: 'rgba(205, 164, 94, 0.5)',
                borderColor: '#cda45e',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#ddd' } }
            },
            scales: {
                x: { ticks: { color: '#999' }, grid: { color: 'rgba(205,164,94,0.1)' } },
                y: { ticks: { color: '#999' }, grid: { color: 'rgba(205,164,94,0.1)' } }
            }
        }
    });
}

// ==================== ORDERS ====================

function loadOrders() {
    const orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    
    document.getElementById('mainContent').innerHTML = `
        <div class="page-header">
            <h2><i class="fas fa-shopping-cart gold-icon"></i> Order Management</h2>
            <div class="d-flex gap-3">
                <input type="text" class="search-box" placeholder="Search orders..." oninput="filterOrders()" id="orderSearch">
                <select class="filter-select" onchange="filterOrders()" id="orderStatusFilter">
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready">Ready</option>
                    <option value="delivered">Delivered</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>
        </div>
        
        <div class="chart-container">
            <div class="table-responsive">
                <table class="table admin-table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Date</th>
                            <th>Items</th>
                            <th>Total</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="ordersTableBody">
                        ${renderOrdersTable(orders)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderOrdersTable(orders) {
    if (orders.length === 0) {
        return '<tr><td colspan="7" class="text-center text-muted py-4">No orders found</td></tr>';
    }
    
    return orders.reverse().map(order => `
        <tr>
            <td><strong>${order.id || 'N/A'}</strong></td>
            <td>${new Date(order.timestamp || order.date).toLocaleDateString()}</td>
            <td>${Array.isArray(order.items) ? order.items.map(i => `${i.name} x${i.quantity}`).join(', ') : 'N/A'}</td>
            <td><strong>₹${order.total || 0}</strong></td>
            <td><span class="badge bg-secondary">${order.order_type || 'N/A'}</span></td>
            <td>
                <select class="filter-select" onchange="updateOrderStatus('${order.id}', this.value)" style="padding: 5px 10px; font-size: 0.8rem;">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                    <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Ready</option>
                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </td>
            <td>
                <button class="btn-sm-action" onclick="viewOrderDetail('${order.id}')"><i class="fas fa-eye"></i></button>
                <button class="btn-sm-action text-danger" onclick="deleteOrder('${order.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function filterOrders() {
    const search = document.getElementById('orderSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('orderStatusFilter')?.value || 'all';
    
    let orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    
    if (status !== 'all') {
        orders = orders.filter(o => o.status === status);
    }
    if (search) {
        orders = orders.filter(o => 
            (o.id || '').toLowerCase().includes(search) ||
            (o.name || '').toLowerCase().includes(search)
        );
    }
    
    document.getElementById('ordersTableBody').innerHTML = renderOrdersTable(orders);
}

function updateOrderStatus(orderId, newStatus) {
    const orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    const order = orders.find(o => o.id === orderId);
    if (order) {
        order.status = newStatus;
        localStorage.setItem('cheesy_orders', JSON.stringify(orders));
        showToast(`Order ${orderId} status updated to ${newStatus}`, 'success');
    }
}

function viewOrderDetail(orderId) {
    const orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const modal = document.getElementById('orderDetailModal');
    modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" style="color: var(--gold);">Order #${order.id}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <p><strong>Date:</strong> ${new Date(order.timestamp || order.date).toLocaleString()}</p>
                            <p><strong>Type:</strong> ${order.order_type}</p>
                            <p><strong>Status:</strong> ${order.status}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Total:</strong> ₹${order.total}</p>
                            ${order.address ? `<p><strong>Address:</strong> ${order.address}</p>` : ''}
                        </div>
                    </div>
                    <h6 style="color: var(--gold);">Items:</h6>
                    <table class="table admin-table">
                        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
                        <tbody>
                            ${(order.items || []).map(item => `
                                <tr>
                                    <td>${item.name}</td>
                                    <td>${item.quantity}</td>
                                    <td>₹${item.price}</td>
                                    <td>₹${item.price * item.quantity}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-outline-gold" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

function deleteOrder(orderId) {
    if (confirm('Delete this order permanently?')) {
        let orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
        orders = orders.filter(o => o.id !== orderId);
        localStorage.setItem('cheesy_orders', JSON.stringify(orders));
        loadOrders();
        showToast('Order deleted', 'success');
    }
}

// ==================== MENU MANAGEMENT ====================

function loadMenuManagement() {
    // Use the FULL_MENU from main.js if available, or fallback
    const menuItems = (typeof FULL_MENU !== 'undefined') ? FULL_MENU : [
        { id: "b1", name: "Golden Cheese Croissant", category: "breakfast", price: 320, description: "Flaky layers", img: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400" },
        { id: "l1", name: "Truffle Mushroom Pasta", category: "lunch", price: 540, description: "Creamy parmesan", img: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400" },
        { id: "d1", name: "Cheesy Crust Signature", category: "dinner", price: 890, description: "Double cheese", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400" },
    ];
    
    document.getElementById('mainContent').innerHTML = `
        <div class="page-header">
            <h2><i class="fas fa-utensils gold-icon"></i> Menu Management</h2>
            <button class="btn btn-gold" onclick="showAddMenuItemModal()">
                <i class="fas fa-plus"></i> Add New Item
            </button>
        </div>
        
        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <input type="text" class="search-box w-100" placeholder="Search menu items..." oninput="filterMenuItems()" id="menuSearch">
            </div>
            <div class="col-md-3">
                <select class="filter-select w-100" onchange="filterMenuItems()" id="menuCategoryFilter">
                    <option value="all">All Categories</option>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                </select>
            </div>
        </div>
        
        <div class="chart-container">
            <div class="table-responsive">
                <table class="table admin-table">
                    <thead>
                        <tr>
                            <th>Image</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Price</th>
                            <th>Description</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="menuTableBody">
                        ${renderMenuTable(menuItems)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderMenuTable(items) {
    return items.map(item => `
        <tr>
            <td><img src="${item.img}" width="50" height="50" style="border-radius: 8px; object-fit: cover;"></td>
            <td><strong>${item.name}</strong></td>
            <td><span class="badge bg-secondary">${item.category}</span></td>
            <td><strong style="color: var(--gold);">₹${item.price}</strong></td>
            <td><small>${item.description?.substring(0, 40)}...</small></td>
            <td>
                <button class="btn-sm-action" onclick="editMenuItem('${item.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-sm-action text-danger" onclick="deleteMenuItem('${item.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function filterMenuItems() {
    const search = document.getElementById('menuSearch')?.value?.toLowerCase() || '';
    const category = document.getElementById('menuCategoryFilter')?.value || 'all';
    
    let items = (typeof FULL_MENU !== 'undefined') ? [...FULL_MENU] : [];
    
    if (category !== 'all') {
        items = items.filter(i => i.category === category);
    }
    if (search) {
        items = items.filter(i => i.name.toLowerCase().includes(search));
    }
    
    document.getElementById('menuTableBody').innerHTML = renderMenuTable(items);
}

function showAddMenuItemModal() {
    const modal = document.getElementById('menuItemModal');
    modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" style="color: var(--gold);">Add Menu Item</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">Name</label>
                            <input type="text" class="form-control" id="menuItemName">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Category</label>
                            <select class="form-control" id="menuItemCategory">
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Price (₹)</label>
                            <input type="number" class="form-control" id="menuItemPrice">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Image URL</label>
                            <input type="text" class="form-control" id="menuItemImage">
                        </div>
                        <div class="col-12">
                            <label class="form-label">Description</label>
                            <textarea class="form-control" id="menuItemDesc" rows="3"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-outline-gold" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-gold" onclick="saveMenuItem()">Save Item</button>
                </div>
            </div>
        </div>
    `;
    
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

function saveMenuItem() {
    const name = document.getElementById('menuItemName').value;
    const category = document.getElementById('menuItemCategory').value;
    const price = parseFloat(document.getElementById('menuItemPrice').value);
    const img = document.getElementById('menuItemImage').value;
    const desc = document.getElementById('menuItemDesc').value;
    
    if (!name || !price) {
        showToast('Please fill name and price', 'error');
        return;
    }
    
    const newItem = {
        id: 'm' + Date.now(),
        name,
        category,
        price,
        description: desc,
        img: img || 'https://via.placeholder.com/400'
    };
    
    if (typeof FULL_MENU !== 'undefined') {
        FULL_MENU.push(newItem);
    }
    
    bootstrap.Modal.getInstance(document.getElementById('menuItemModal')).hide();
    loadMenuManagement();
    showToast('Menu item added!', 'success');
}

function editMenuItem(id) {
    const items = (typeof FULL_MENU !== 'undefined') ? FULL_MENU : [];
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    const modal = document.getElementById('menuItemModal');
    modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" style="color: var(--gold);">Edit Menu Item</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">Name</label>
                            <input type="text" class="form-control" id="menuItemName" value="${item.name}">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Category</label>
                            <select class="form-control" id="menuItemCategory">
                                <option value="breakfast" ${item.category === 'breakfast' ? 'selected' : ''}>Breakfast</option>
                                <option value="lunch" ${item.category === 'lunch' ? 'selected' : ''}>Lunch</option>
                                <option value="dinner" ${item.category === 'dinner' ? 'selected' : ''}>Dinner</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Price (₹)</label>
                            <input type="number" class="form-control" id="menuItemPrice" value="${item.price}">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Image URL</label>
                            <input type="text" class="form-control" id="menuItemImage" value="${item.img}">
                        </div>
                        <div class="col-12">
                            <label class="form-label">Description</label>
                            <textarea class="form-control" id="menuItemDesc" rows="3">${item.description}</textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-outline-gold" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-gold" onclick="updateMenuItem('${id}')">Update</button>
                </div>
            </div>
        </div>
    `;
    
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

function updateMenuItem(id) {
    const items = (typeof FULL_MENU !== 'undefined') ? FULL_MENU : [];
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    item.name = document.getElementById('menuItemName').value;
    item.category = document.getElementById('menuItemCategory').value;
    item.price = parseFloat(document.getElementById('menuItemPrice').value);
    item.img = document.getElementById('menuItemImage').value;
    item.description = document.getElementById('menuItemDesc').value;
    
    bootstrap.Modal.getInstance(document.getElementById('menuItemModal')).hide();
    loadMenuManagement();
    showToast('Menu item updated!', 'success');
}

function deleteMenuItem(id) {
    if (confirm('Delete this menu item?')) {
        if (typeof FULL_MENU !== 'undefined') {
            const index = FULL_MENU.findIndex(i => i.id === id);
            if (index > -1) FULL_MENU.splice(index, 1);
        }
        loadMenuManagement();
        showToast('Menu item deleted', 'success');
    }
}

// ==================== RESERVATIONS ====================

function loadReservations() {
    const reservations = JSON.parse(localStorage.getItem('cheesy_reservations') || '[]');
    
    document.getElementById('mainContent').innerHTML = `
        <div class="page-header">
            <h2><i class="fas fa-calendar-check gold-icon"></i> Reservations</h2>
        </div>
        
        <div class="chart-container">
            <div class="table-responsive">
                <table class="table admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Guests</th>
                            <th>Pre-order</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reservations.length === 0 ? '<tr><td colspan="9" class="text-center text-muted py-4">No reservations</td></tr>' : 
                        reservations.reverse().map(res => `
                            <tr>
                                <td><strong>${res.id || 'N/A'}</strong></td>
                                <td>${res.name || 'N/A'}</td>
                                <td>${res.phone || 'N/A'}</td>
                                <td>${res.date || 'N/A'}</td>
                                <td>${res.time || 'N/A'}</td>
                                <td>${res.guests || 1}</td>
                                <td>${(res.preorderItems || []).length} items</td>
                                <td><span class="badge-status badge-${res.status || 'pending'}">${res.status || 'pending'}</span></td>
                                <td>
                                    <button class="btn-sm-action" onclick="updateReservationStatus('${res.id}', 'confirmed')">Confirm</button>
                                    <button class="btn-sm-action text-danger" onclick="updateReservationStatus('${res.id}', 'cancelled')">Cancel</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function updateReservationStatus(id, status) {
    const reservations = JSON.parse(localStorage.getItem('cheesy_reservations') || '[]');
    const res = reservations.find(r => r.id === parseInt(id));
    if (res) {
        res.status = status;
        localStorage.setItem('cheesy_reservations', JSON.stringify(reservations));
        loadReservations();
        showToast(`Reservation ${status}`, 'success');
    }
}

// ==================== CUSTOMERS ====================

function loadCustomers() {
    const orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    const reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
    
    // Extract unique customers from orders
    const customerMap = {};
    orders.forEach(order => {
        const phone = order.phone || 'unknown';
        if (!customerMap[phone]) {
            customerMap[phone] = {
                phone,
                name: order.name || 'Guest',
                orderCount: 0,
                totalSpent: 0,
                lastOrder: null
            };
        }
        customerMap[phone].orderCount++;
        customerMap[phone].totalSpent += (order.total || 0);
        customerMap[phone].lastOrder = order.timestamp || order.date;
    });
    
    const customers = Object.values(customerMap);
    
    document.getElementById('mainContent').innerHTML = `
        <div class="page-header">
            <h2><i class="fas fa-users gold-icon"></i> Customers</h2>
            <span class="text-muted">${customers.length} total customers</span>
        </div>
        
        <div class="row">
            ${customers.map(customer => `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="customer-card">
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div class="customer-avatar">${(customer.name || 'G')[0].toUpperCase()}</div>
                            <div>
                                <h6 style="margin: 0;">${customer.name || 'Guest'}</h6>
                                <small class="text-muted">${customer.phone}</small>
                            </div>
                        </div>
                        <div class="row text-center">
                            <div class="col-4">
                                <div style="font-size: 1.2rem; font-weight: 700;">${customer.orderCount}</div>
                                <small class="text-muted">Orders</small>
                            </div>
                            <div class="col-4">
                                <div style="font-size: 1.2rem; font-weight: 700; color: var(--gold);">₹${formatNumber(customer.totalSpent)}</div>
                                <small class="text-muted">Spent</small>
                            </div>
                            <div class="col-4">
                                <div style="font-size: 1.2rem; font-weight: 700;">${customer.lastOrder ? new Date(customer.lastOrder).toLocaleDateString() : 'N/A'}</div>
                                <small class="text-muted">Last Order</small>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('') || '<p class="text-muted text-center">No customers yet</p>'}
        </div>
    `;
}

// ==================== REVIEWS ====================

function loadReviews() {
    const reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
    
    document.getElementById('mainContent').innerHTML = `
        <div class="page-header">
            <h2><i class="fas fa-star gold-icon"></i> Reviews</h2>
            <span class="text-muted">${reviews.length} total reviews</span>
        </div>
        
        <div class="chart-container">
            <div class="table-responsive">
                <table class="table admin-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>User</th>
                            <th>Item</th>
                            <th>Rating</th>
                            <th>Review</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reviews.length === 0 ? '<tr><td colspan="6" class="text-center text-muted py-4">No reviews yet</td></tr>' :
                        reviews.reverse().map(review => `
                            <tr>
                                <td>${new Date(review.date).toLocaleDateString()}</td>
                                <td>${review.userName || 'Anonymous'}</td>
                                <td>${review.itemName || 'N/A'}</td>
                                <td style="color: var(--gold);">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</td>
                                <td><small>${review.comment?.substring(0, 50)}...</small></td>
                                <td>
                                    <button class="btn-sm-action text-danger" onclick="deleteReview(${review.id})"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function deleteReview(id) {
    if (confirm('Delete this review?')) {
        let reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
        reviews = reviews.filter(r => r.id !== id);
        localStorage.setItem('all_reviews', JSON.stringify(reviews));
        
        let userReviews = JSON.parse(localStorage.getItem('user_reviews') || '[]');
        userReviews = userReviews.filter(r => r.id !== id);
        localStorage.setItem('user_reviews', JSON.stringify(userReviews));
        
        loadReviews();
        showToast('Review deleted', 'success');
    }
}

// ==================== ANALYTICS ====================

function loadAnalytics() {
    const orders = JSON.parse(localStorage.getItem('cheesy_orders') || '[]');
    const reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
    
    // Calculate stats
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    
    // Category breakdown
    const categoryRevenue = {};
    orders.forEach(order => {
        (order.items || []).forEach(item => {
            const cat = item.category || 'other';
            categoryRevenue[cat] = (categoryRevenue[cat] || 0) + (item.price * item.quantity);
        });
    });
    
    document.getElementById('mainContent').innerHTML = `
        <div class="page-header">
            <h2><i class="fas fa-chart-bar gold-icon"></i> Analytics</h2>
        </div>
        
        <div class="row g-4 mb-4">
            <div class="col-md-3">
                <div class="stat-card text-center">
                    <div class="stat-value">${orders.length}</div>
                    <div class="stat-label">Total Orders</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card text-center">
                    <div class="stat-value" style="color: var(--gold);">₹${formatNumber(totalRevenue)}</div>
                    <div class="stat-label">Total Revenue</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card text-center">
                    <div class="stat-value">₹${formatNumber(avgOrderValue)}</div>
                    <div class="stat-label">Avg Order Value</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card text-center">
                    <div class="stat-value">${reviews.length}</div>
                    <div class="stat-label">Total Reviews</div>
                </div>
            </div>
        </div>
        
        <div class="row g-4">
            <div class="col-md-6">
                <div class="chart-container">
                    <h5 style="color: var(--gold);">Revenue by Category</h5>
                    <canvas id="categoryChart"></canvas>
                </div>
            </div>
            <div class="col-md-6">
                <div class="chart-container">
                    <h5 style="color: var(--gold);">Monthly Performance</h5>
                    <canvas id="monthlyChart"></canvas>
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        initCategoryChart(categoryRevenue);
        initMonthlyChart(orders);
    }, 500);
}

function initCategoryChart(data) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#cda45e', '#b58d4a', '#8b6914', '#daa520', '#d4af37'],
                borderColor: '#1a1814',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#ddd' } }
            }
        }
    });
}

function initMonthlyChart(orders) {
    const ctx = document.getElementById('monthlyChart');
    if (!ctx) return;
    
    const monthlyData = {};
    orders.forEach(order => {
        const date = new Date(order.timestamp || order.date);
        const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
        monthlyData[key] = (monthlyData[key] || 0) + 1;
    });
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(monthlyData),
            datasets: [{
                label: 'Orders',
                data: Object.values(monthlyData),
                borderColor: '#cda45e',
                backgroundColor: 'rgba(205,164,94,0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#ddd' } }
            },
            scales: {
                x: { ticks: { color: '#999' }, grid: { color: 'rgba(205,164,94,0.1)' } },
                y: { ticks: { color: '#999', stepSize: 1 }, grid: { color: 'rgba(205,164,94,0.1)' } }
            }
        }
    });
}

// ==================== UTILITIES ====================

function formatNumber(num) {
    return num?.toLocaleString('en-IN') || '0';
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}" style="color: var(--gold); margin-right: 10px;"></i>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    if (checkAdminAuth()) {
        switchSection('dashboard');
    }
});

// Export functions globally
window.switchSection = switchSection;
window.filterOrders = filterOrders;
window.updateOrderStatus = updateOrderStatus;
window.viewOrderDetail = viewOrderDetail;
window.deleteOrder = deleteOrder;
window.showAddMenuItemModal = showAddMenuItemModal;
window.saveMenuItem = saveMenuItem;
window.editMenuItem = editMenuItem;
window.updateMenuItem = updateMenuItem;
window.deleteMenuItem = deleteMenuItem;
window.filterMenuItems = filterMenuItems;
window.updateReservationStatus = updateReservationStatus;
window.deleteReview = deleteReview;
window.adminLogin = adminLogin;
window.enableDemoMode = enableDemoMode;
