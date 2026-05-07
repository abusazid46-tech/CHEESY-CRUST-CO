if (!isAuthenticated() || localStorage.getItem(STORAGE_KEYS.isAdmin) !== 'true') {
    showToast('Admin access requires an admin login.', 'error');
    setTimeout(() => window.location.href = 'index.html', 1200);
}

let revenueChart = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminEmail').innerText = localStorage.getItem(STORAGE_KEYS.userPhone) || 'Admin';
    document.getElementById('logoutAdmin')?.addEventListener('click', event => {
        event.preventDefault();
        logoutUser('index.html');
    });

    document.querySelectorAll('.admin-sidebar .nav-link[data-page]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            showAdminPage(link.dataset.page);
        });
    });

    document.getElementById('orderStatusFilter')?.addEventListener('change', () => loadOrders());
    document.getElementById('saveMenuItem')?.addEventListener('click', saveMenuItem);
    loadDashboard();
});

function showAdminPage(page) {
    document.querySelectorAll('.admin-sidebar .nav-link[data-page]').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });
    ['dashboard', 'orders', 'menu', 'reservations', 'revenue'].forEach(name => {
        document.getElementById(`${name}Page`).style.display = name === page ? 'block' : 'none';
    });
    document.getElementById('pageTitle').innerText = page[0].toUpperCase() + page.slice(1);

    if (page === 'dashboard') loadDashboard();
    if (page === 'orders') loadOrders();
    if (page === 'menu') loadMenuAdmin();
    if (page === 'reservations') loadReservations();
    if (page === 'revenue') loadRevenue();
}

async function loadDashboard() {
    try {
        const response = await api.getDashboard();
        const stats = response.stats || {};
        document.getElementById('todayOrders').innerText = stats.today_orders || 0;
        document.getElementById('todayRevenue').innerText = formatPrice(stats.today_revenue || 0);
        document.getElementById('totalOrders').innerText = stats.total_orders || 0;
        document.getElementById('todayReservations').innerText = stats.today_reservations || 0;
        document.getElementById('pendingCount').innerText = (response.recent_orders || []).filter(o => o.status === 'pending').length;
        document.getElementById('reservationCount').innerText = stats.today_reservations || 0;
        document.getElementById('recentOrders').innerHTML = (response.recent_orders || []).map(order => `
            <tr>
                <td>${escapeHtml(order.order_number || order._id)}</td>
                <td>${formatPrice(order.total)}</td>
                <td><span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
                <td><button class="btn btn-sm btn-outline-light" onclick="showAdminPage('orders')">Open</button></td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="text-center text-muted">No recent orders</td></tr>';
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadOrders() {
    const status = document.getElementById('orderStatusFilter')?.value;
    const params = status && status !== 'all' ? { status } : {};
    const body = document.getElementById('allOrdersList');
    body.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    try {
        const response = await api.getAllOrders(params);
        const orders = response.orders || [];
        body.innerHTML = orders.map(order => `
            <tr>
                <td>${escapeHtml(order.order_number || order._id)}</td>
                <td>${escapeHtml(order.user_id || '')}</td>
                <td>${(order.items || []).map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join('<br>')}</td>
                <td>${formatPrice(order.total)}</td>
                <td>${escapeHtml(order.order_type)}</td>
                <td><span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
                <td>
                    <select class="form-select form-select-sm" onchange="changeOrderStatus('${order._id}', this.value)">
                        ${['pending','confirmed','preparing','ready','out_for_delivery','delivered','completed','cancelled'].map(s => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="text-center text-muted">No orders found</td></tr>';
    } catch (error) {
        body.innerHTML = `<tr><td colspan="7" class="text-danger text-center">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function changeOrderStatus(orderId, status) {
    try {
        await api.updateOrderStatus(orderId, status);
        showToast('Order status updated.');
        loadOrders();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadMenuAdmin() {
    const body = document.getElementById('menuItemsList');
    body.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    try {
        const response = await api.getMenu({ per_page: 100 });
        const items = response.items || [];
        body.innerHTML = items.map(item => {
            const menuItem = normalizeMenuItem(item);
            return `
                <tr>
                    <td><img src="${escapeHtml(menuItem.img)}" alt="" width="60" height="45" style="object-fit:cover;border-radius:6px;"></td>
                    <td>${escapeHtml(menuItem.name)}</td>
                    <td>${escapeHtml(menuItem.category)}</td>
                    <td>${formatPrice(menuItem.price)}</td>
                    <td>${menuItem.is_available ? 'Available' : 'Hidden'}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="deleteMenuItem('${menuItem.id}')">Delete</button></td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="6" class="text-center text-muted">No menu items found</td></tr>';
    } catch (error) {
        body.innerHTML = `<tr><td colspan="6" class="text-danger text-center">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function saveMenuItem() {
    const button = document.getElementById('saveMenuItem');
    const item = {
        name: document.getElementById('itemName').value.trim(),
        category: document.getElementById('itemCategory').value,
        price: Number(document.getElementById('itemPrice').value),
        description: document.getElementById('itemDescription').value.trim(),
        image_url: document.getElementById('itemImage').value.trim(),
        is_available: true,
        is_veg: true
    };
    setLoading(button, true, 'Saving...');
    try {
        await api.createMenuItem(item);
        bootstrap.Modal.getInstance(document.getElementById('addMenuItemModal')).hide();
        document.getElementById('addMenuItemForm').reset();
        showToast('Menu item created.');
        loadMenuAdmin();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setLoading(button, false);
    }
}

async function deleteMenuItem(itemId) {
    if (!confirm('Delete this menu item?')) return;
    try {
        await api.deleteMenuItem(itemId);
        showToast('Menu item deleted.');
        loadMenuAdmin();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadReservations() {
    const body = document.getElementById('reservationsList');
    body.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    try {
        const response = await api.getAllReservations();
        const reservations = response.reservations || [];
        body.innerHTML = reservations.map(res => `
            <tr>
                <td>${escapeHtml(res.name)}</td>
                <td>${escapeHtml(res.phone)}</td>
                <td>${escapeHtml(res.date)}</td>
                <td>${escapeHtml(res.time)}</td>
                <td>${escapeHtml(res.guests)}</td>
                <td>${formatPrice(res.preorder_total || 0)}</td>
                <td>
                    <select class="form-select form-select-sm" onchange="changeReservationStatus('${res._id}', this.value)">
                        ${['pending','confirmed','cancelled','completed','no_show'].map(s => `<option value="${s}" ${s === res.status ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="text-center text-muted">No reservations found</td></tr>';
    } catch (error) {
        body.innerHTML = `<tr><td colspan="7" class="text-danger text-center">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function changeReservationStatus(reservationId, status) {
    try {
        await api.updateReservationStatus(reservationId, status);
        showToast('Reservation status updated.');
        loadReservations();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadRevenue() {
    try {
        const response = await api.getSalesSummary('week');
        const sales = response.sales_data || [];
        const labels = sales.map(item => item._id);
        const revenue = sales.map(item => item.revenue || 0);
        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart(document.getElementById('revenueChart'), {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: 'Revenue', data: revenue, borderColor: '#cda45e', backgroundColor: 'rgba(205,164,94,0.15)' }]
            },
            options: { plugins: { legend: { labels: { color: '#fff' } } }, scales: { x: { ticks: { color: '#fff' } }, y: { ticks: { color: '#fff' } } } }
        });
        document.getElementById('revenueStats').innerHTML = (response.top_items || []).map(item => `
            <p>${escapeHtml(item._id)}: ${item.total_quantity} sold, ${formatPrice(item.total_revenue)}</p>
        `).join('') || '<p class="text-muted">No revenue data yet.</p>';
    } catch (error) {
        showToast(error.message, 'error');
    }
}
