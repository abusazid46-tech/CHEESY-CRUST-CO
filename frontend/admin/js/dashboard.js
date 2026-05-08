// Dashboard Logic
requireAdminAuth();

let salesChart = null;

// Load dashboard data
async function loadDashboard() {
    try {
        const data = await adminApi.getDashboard();
        
        if (data.success) {
            const stats = data.stats;
            document.getElementById('totalOrders').innerText = stats.total_orders || 0;
            document.getElementById('totalRevenue').innerHTML = formatCurrency(stats.total_revenue || 0);
            document.getElementById('totalCustomers').innerText = stats.total_users || 0;
            document.getElementById('todayOrders').innerText = stats.today_orders || 0;
            
            // Render recent orders
            renderRecentOrders(data.recent_orders || []);
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        showAdminToast('Failed to load dashboard data', 'error');
    }
}

// Load sales chart
async function loadSalesChart() {
    try {
        const data = await adminApi.getSalesSummary('week');
        
        if (data.success && data.sales_data) {
            const labels = data.sales_data.map(d => d._id);
            const values = data.sales_data.map(d => d.revenue);
            const orders = data.sales_data.map(d => d.orders);
            
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
                    }, {
                        label: 'Orders',
                        data: orders,
                        borderColor: '#17a2b8',
                        borderWidth: 2,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            labels: { color: '#bbb' }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#888' },
                            grid: { color: 'rgba(205,164,94,0.05)' }
                        },
                        y: {
                            ticks: { color: '#888', callback: v => '₹' + v },
                            grid: { color: 'rgba(205,164,94,0.05)' }
                        },
                        y1: {
                            position: 'right',
                            ticks: { color: '#888' },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Chart error:', error);
    }
}

// Render recent orders table
function renderRecentOrders(orders) {
    const tbody = document.getElementById('recentOrdersTable');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No orders yet</td></tr>';
        return;
    }
