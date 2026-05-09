// Dashboard Logic
if (!localStorage.getItem('admin_token')) {
    window.location.href = 'index.html';
}

let salesChart = null;

async function verifyAdminAccess() {
    const token = localStorage.getItem('admin_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    try {
        const response = await fetch(`${ADMIN_API_BASE}/admin/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        const data = await response.json();
        if (data.admin) {
            localStorage.setItem('admin_data', JSON.stringify(data.admin));
        }
    } catch (error) {
        console.log('Auth check skipped - network may be slow');
    }
}

async function loadDashboard() {
    try {
        const data = await adminApi.getDashboard();
        if (data.success) {
            const stats = data.stats;
            document.getElementById('totalOrders').innerText = stats.total_orders || 0;
            document.getElementById('totalRevenue').innerHTML = formatCurrency(stats.total_revenue || 0);
            document.getElementById('totalCustomers').innerText = stats.total_users || 0;
            document.getElementById('todayOrders').innerText = stats.today_orders || 0;
            renderRecentOrders(data.recent_orders || []);
        }
    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

async function loadSalesChart() {
    try {
        const data = await adminApi.getSalesSummary('week');
        if (data.success && data.sales_data) {
            const labels = data.sales_data.map(d => d._id);
            const values = data.sales_data.map(d => d.revenue);
            const ctx = document.getElementById('salesChart').getContext('2d');
            if (salesChart) salesChart.destroy();
            salesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Revenue (₹)',
                        data: values,
                        borderColor: '#cda45e',
                        backgroundColor: 'rgba(205,164,94,0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { labels: { color: '#bbb' } } },
                    scales: {
                        x: { ticks: { color: '#888' }, grid: { color: 'rgba(205,164,94,0.05)' } },
                        y: { ticks: { color: '#888', callback: v => '₹' + v }, grid: { color: 'rgba(205,164,94,0.05)' } }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Chart error:', error);
    }
}

function renderRecentOrders(orders) {
    const tbody = document.getElementById('recentOrdersTable');
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No orders yet</td></tr>';
        return;
    }
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td><a href="orders.html?id=${order._id}" style="color: var(--gold);">#${order.order_number || 'N/A'}</a></td>
            <td>${order.user_phone || 'N/A'}</td>
            <td>${order.items?.length || 0} items</td>
            <td>${formatCurrency(order.total)}</td>
            <td><span class="badge-status badge-${order.status || 'pending'}">${order.status || 'pending'}</span></td>
            <td>${formatDate(order.created_at)}</td>
        </tr>
    `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    await verifyAdminAccess();
    loadDashboard();
    loadSalesChart();
    setInterval(loadDashboard, 60000);
});
