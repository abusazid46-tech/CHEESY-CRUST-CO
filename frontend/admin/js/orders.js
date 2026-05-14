// Order Management Logic
requireAdminAuth();

let currentPage = 1;
let selectedStatus = '';

// Load orders
async function loadOrders(page = 1) {
    currentPage = page;
    selectedStatus = document.getElementById('statusFilter')?.value || '';
    
    try {
        const data = await adminApi.getOrders(page, selectedStatus);
        
        if (data.success) {
            renderOrdersTable(data.orders);
            renderPagination(data.total, data.page, data.total_pages);
        }
    } catch (error) {
        console.error('Orders error:', error);
        showAdminToast('Failed to load orders', 'error');
    }
}

// Render orders table
function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersTable');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No orders found</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td><strong style="color: var(--gold);">#${order.order_number}</strong></td>
            <td>${order.user_id?.slice(-6) || 'Guest'}</td>
            <td><span class="badge-status badge-confirmed">${order.order_type}</span></td>
            <td>${order.items?.length || 0} items</td>
            <td><strong>${formatCurrency(order.total)}</strong></td>
            <td><span class="badge-status ${order.payment_status === 'paid' ? 'badge-delivered' : 'badge-pending'}">${order.payment_status}</span></td>
            <td>
                <select class="form-select form-select-sm status-select" data-order-id="${order._id}" 
                    style="background: var(--card-light); color: #fff; border-color: #3a352e; width: 140px; font-size: 0.8rem;">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                    <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Ready</option>
                    <option value="out_for_delivery" ${order.status === 'out_for_delivery' ? 'selected' : ''}>Out for Delivery</option>
                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </td>
            <td>${formatDate(order.created_at)}</td>
            <td>
                <button class="btn-icon" onclick="viewOrderDetail('${order._id}')" title="View Details" style="width: 32px; height: 32px;">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    // Add status change listeners
    document.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const orderId = select.dataset.orderId;
            const newStatus = e.target.value;
            await updateOrderStatus(orderId, newStatus);
        });
    });
}

// Update order status
async function updateOrderStatus(orderId, status) {
    try {
        const data = await adminApi.updateOrderStatus(orderId, status);
        if (data.success) {
            showAdminToast(`Order status updated to ${status}`);
        } else {
            showAdminToast('Failed to update status', 'error');
        }
    } catch (error) {
        showAdminToast('Error updating status', 'error');
    }
}

// View order detail
async function viewOrderDetail(orderId) {
    try {
        const data = await adminApi.getOrderById(orderId);
        
        if (data.success && data.order) {
            const order = data.order;
            const modal = new bootstrap.Modal(document.getElementById('orderDetailModal'));
            
            document.getElementById('orderDetailContent').innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Order #:</strong> ${order.order_number}</p>
                        <p><strong>Status:</strong> <span class="badge-status badge-${order.status}">${order.status}</span></p>
                        <p><strong>Type:</strong> ${order.order_type}</p>
                        <p><strong>Payment:</strong> ${order.payment_status}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Date:</strong> ${formatDate(order.created_at)}</p>
                        <p><strong>Address:</strong> ${order.address || 'N/A'}</p>
                        <p><strong>Notes:</strong> ${order.notes || 'None'}</p>
                    </div>
                </div>
                <hr style="border-color: #3a352e;">
                <h6 style="color: var(--gold);">Order Items</h6>
                <table class="admin-table">
                    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
                    <tbody>
                        ${order.items.map(item => `
                            <tr>
                                <td>${item.name}</td>
                                <td>${item.quantity}</td>
                                <td>${formatCurrency(item.price)}</td>
                                <td>${formatCurrency(item.price * item.quantity)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr><td colspan="3"><strong>Subtotal</strong></td><td>${formatCurrency(order.subtotal)}</td></tr>
                        <tr><td colspan="3"><strong>Delivery Fee</strong></td><td>${formatCurrency(order.delivery_fee)}</td></tr>
                        <tr><td colspan="3"><strong style="color: var(--gold);">Total</strong></td><td><strong style="color: var(--gold);">${formatCurrency(order.total)}</strong></td></tr>
                    </tfoot>
                </table>
            `;
            
            modal.show();
        }
    } catch (error) {
        showAdminToast('Failed to load order details', 'error');
    }
}

// Pagination
function renderPagination(total, page, totalPages) {
    const div = document.getElementById('pagination');
    div.innerHTML = `
        <span class="text-muted">Showing page ${page} of ${totalPages} (${total} orders)</span>
        <div>
            <button class="btn-outline me-2" onclick="loadOrders(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            <button class="btn-outline" onclick="loadOrders(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => loadOrders());
