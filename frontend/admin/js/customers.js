// Customer CRM Logic
requireAdminAuth();

let custPage = 1;

async function loadCustomers(page = 1) {
    custPage = page;
    const search = document.getElementById('searchCustomer')?.value || '';
    
    try {
        const data = await adminApi.getCustomers(page, search);
        
        if (data.success) {
            document.getElementById('totalCust').innerText = data.total;
            document.getElementById('activeCust').innerText = Math.floor(data.total * 0.7);
            document.getElementById('newCust').innerText = Math.floor(data.total * 0.2);
            renderCustomersTable(data.users);
            renderCustPagination(data.total, data.page, data.total_pages);
        }
    } catch (error) {
        console.error('Customers error:', error);
        showAdminToast('Failed to load customers', 'error');
    }
}

function renderCustomersTable(users) {
    const tbody = document.getElementById('customersTable');
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No customers found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map((user, index) => `
        <tr>
            <td>${(custPage - 1) * 20 + index + 1}</td>
            <td><strong>${user.name || 'N/A'}</strong></td>
            <td>${user.phone}</td>
            <td>${user.email || 'N/A'}</td>
            <td><span class="badge-status badge-confirmed">${user.order_count || 0} orders</span></td>
            <td>${formatDate(user.created_at)}</td>
            <td>
                <button class="btn-icon" onclick="viewCustomerDetail('${user._id}')" title="View" style="width: 32px; height: 32px;">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderCustPagination(total, page, totalPages) {
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

// Search
document.getElementById('searchCustomer')?.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') loadCustomers(1);
});

document.addEventListener('DOMContentLoaded', () => loadCustomers());
