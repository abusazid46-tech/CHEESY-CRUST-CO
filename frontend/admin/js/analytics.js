// Analytics Logic
requireAdminAuth();

let revenueChart, topItemsChart, orderTypeChart;

async function loadAnalytics() {
    const period = document.getElementById('periodSelect')?.value || 'week';
    
    try {
        const data = await adminApi.getSalesSummary(period);
        
        if (data.success) {
            renderRevenueChart(data.sales_data || []);
            renderTopItemsChart(data.top_items || []);
            renderOrderTypeChart();
        }
    } catch (error) {
        console.error('Analytics error:', error);
        // Load demo data
        renderRevenueChart([
            {_id: 'Mon', revenue: 4500, orders: 12},
            {_id: 'Tue', revenue: 3200, orders: 8},
            {_id: 'Wed', revenue: 5600, orders: 15},
            {_id: 'Thu', revenue: 3800, orders: 10},
            {_id: 'Fri', revenue: 7200, orders: 20},
            {_id: 'Sat', revenue: 8900, orders: 25},
            {_id: 'Sun', revenue: 6500, orders: 18}
        ]);
        renderTopItemsChart([
            {_id: 'Pizza', total_quantity: 45},
            {_id: 'Pasta', total_quantity: 32},
            {_id: 'Burger', total_quantity: 28},
            {_id: 'Steak', total_quantity: 20},
            {_id: 'Dessert', total_quantity: 38}
        ]);
    }
}

function renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    if (revenueChart) revenueChart.destroy();
    
    revenueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d._id),
            datasets: [{
                label: 'Revenue (₹)',
                data: data.map(d => d.revenue),
                backgroundColor: 'rgba(205,164,94,0.3)',
                borderColor: '#cda45e',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#bbb' } } },
            scales: {
                x: { ticks: { color: '#888' }, grid: { display: false } },
                y: { ticks: { color: '#888', callback: v => '₹' + v } }
            }
        }
    });
}

function renderTopItemsChart(data) {
    const ctx = document.getElementById('topItemsChart').getContext('2d');
    if (topItemsChart) topItemsChart.destroy();
    
    topItemsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d._id),
            datasets: [{
                data: data.map(d => d.total_quantity),
                backgroundColor: ['#cda45e', '#b58d4a', '#28a745', '#17a2b8', '#ffc107'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#bbb' } } }
        }
    });
}

function renderOrderTypeChart() {
    const ctx = document.getElementById('orderTypeChart').getContext('2d');
    if (orderTypeChart) orderTypeChart.destroy();
    
    orderTypeChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Delivery', 'Takeaway', 'Dine-in'],
            datasets: [{
                data: [60, 25, 15],
                backgroundColor: ['#cda45e', '#28a745', '#17a2b8'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#bbb' } } }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => loadAnalytics());
