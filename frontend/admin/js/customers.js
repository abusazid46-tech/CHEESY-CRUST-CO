// Customer Management Logic
requireAdminAuth();

let customerPage = 1;
let customerSearchTimer = null;

async function loadCustomers(page = 1) {
    customerPage = page;
    const search = document.getElementById('searchCustomer')?.value.trim() || '';

    try {
        const [customers, stats] = await Promise.all([
            adminApi.getCustomers(page, search),
            adminApi.getCustomerStats()
        ]);

        if (customers.success) {
            renderCustomersTable(customers.users || []);
            renderCustomerPagination(customers.total || 0, customers.page || page, customers.total_pages || 1);
        }

        if (stats.success) {
            const statData = stats.stats || {};
            document.getElementById('totalCust').innerText = statData.total || 0;
            document.getElementById('activeCust').innerText = statData.active || 0;
            document.getElementById('newCust').innerText = statData.with_orders || 0;
        }
    } catch (error) {
        console.error('Customers error:', error);
        showAdminToast('Failed to load customers', 'error');
    }
}

function renderCustomersTable(customers) {
    const tbody = document.getElementById('customersTable');

    if (!customers.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No customers found</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map((customer, index) => `
        <tr>
            <td>${(customerPage - 1) * 20 + index + 1}</td>
            <td><strong>${customer.name || 'Customer'}</strong></td>
            <td>${customer.phone || 'N/A'}</td>
            <td>${customer.email || 'N/A'}</td>
            <td>${customer.order_count || '-'}</td>
            <td>${formatDate(customer.created_at)}</td>
            <td>
                <button class="btn-icon" onclick="viewCustomer('${customer._id}')" title="View" style="width:32px;height:32px;">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderCustomerPagination(total, page, totalPages) {
    const div = document.getElementById('custPagination');
    div.innerHTML = `
        <span class="text-muted">Page ${page} of ${totalPages} (${total} customers)</span>
        <div>
            <button class="btn-outline me-2" onclick="loadCustomers(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            <button class="btn-outline" onclick="loadCustomers(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
}

async function viewCustomer(userId) {
    try {
        const [orders, reservations] = await Promise.all([
            adminApi.getCustomerOrders(userId),
            adminApi.getCustomerReservations(userId)
        ]);

        let modalEl = document.getElementById('customerDetailModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'customerDetailModal';
            modalEl.className = 'modal fade';
            modalEl.innerHTML = `
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content" style="background:#1a1814;color:#fff;border:1px solid rgba(205,164,94,0.3);">
                        <div class="modal-header" style="border-color:#3a352e;">
                            <h5 class="modal-title" style="color:var(--gold);">Customer Activity</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="customerDetailContent"></div>
                    </div>
                </div>`;
            document.body.appendChild(modalEl);
        }

        document.getElementById('customerDetailContent').innerHTML = `
            <h6 style="color:var(--gold);">Recent Orders</h6>
            ${(orders.orders || []).length ? (orders.orders || []).slice(0, 10).map(order => `
                <div class="d-flex justify-content-between py-2 border-bottom" style="border-color:#3a352e!important;">
                    <span>#${order.order_number}</span>
                    <span>${formatCurrency(order.total)} - ${order.status}</span>
                </div>`).join('') : '<p class="text-muted">No orders found.</p>'}
            <h6 class="mt-4" style="color:var(--gold);">Reservations</h6>
            ${(reservations.reservations || []).length ? (reservations.reservations || []).slice(0, 10).map(res => `
                <div class="d-flex justify-content-between py-2 border-bottom" style="border-color:#3a352e!important;">
                    <span>${res.date} ${res.time}</span>
                    <span>${res.guests} guests - ${res.status}</span>
                </div>`).join('') : '<p class="text-muted">No reservations found.</p>'}
        `;

        new bootstrap.Modal(modalEl).show();
    } catch (error) {
        showAdminToast('Failed to load customer activity', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCustomers();
    document.getElementById('searchCustomer')?.addEventListener('input', () => {
        clearTimeout(customerSearchTimer);
        customerSearchTimer = setTimeout(() => loadCustomers(1), 300);
    });
});
