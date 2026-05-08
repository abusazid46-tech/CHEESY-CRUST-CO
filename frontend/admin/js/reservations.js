// Reservation Management Logic
requireAdminAuth();

let resPage = 1;

async function loadReservations(page = 1) {
    resPage = page;
    const date = document.getElementById('resDateFilter')?.value || '';
    const status = document.getElementById('resStatusFilter')?.value || '';
    
    try {
        const data = await adminApi.getReservations(page, date, status);
        
        if (data.success) {
            renderReservationsTable(data.reservations);
            renderResPagination(data.total, data.page, data.total_pages);
        }
    } catch (error) {
        console.error('Reservations error:', error);
        // Load from localStorage fallback
        const localReservations = JSON.parse(localStorage.getItem('cheesy_reservations') || '[]');
        renderReservationsTable(localReservations);
    }
}

function renderReservationsTable(reservations) {
    const tbody = document.getElementById('reservationsTable');
    
    if (!reservations || reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No reservations found</td></tr>';
        return;
    }
    
    tbody.innerHTML = reservations.map(res => `
        <tr>
            <td><strong>${res.name}</strong></td>
            <td>${res.phone}</td>
            <td>${res.date}</td>
            <td>${res.time}</td>
            <td>${res.guests} guests</td>
            <td>${res.preorder_items?.length || 0} items | ₹${res.preorder_total || 0}</td>
            <td>
                <select class="form-select form-select-sm res-status-select" data-res-id="${res._id || res.id}" 
                    style="background: var(--card-light); color: #fff; border-color: #3a352e; width: 130px; font-size: 0.8rem;">
                    <option value="pending" ${res.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="confirmed" ${res.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="completed" ${res.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="cancelled" ${res.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    <option value="no_show" ${res.status === 'no_show' ? 'selected' : ''}>No Show</option>
                </select>
            </td>
            <td>
                <button class="btn-icon" onclick="viewReservationDetail('${res._id || res.id}')" style="width: 32px; height: 32px;">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    // Status change listeners
    document.querySelectorAll('.res-status-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const resId = select.dataset.resId;
            const newStatus = e.target.value;
            await updateResStatus(resId, newStatus);
        });
    });
}

async function updateResStatus(resId, status) {
    try {
        await adminApi.updateReservationStatus(resId, status);
        showAdminToast(`Reservation status updated to ${status}`);
    } catch (error) {
        // Update localStorage
        const reservations = JSON.parse(localStorage.getItem('cheesy_reservations') || '[]');
        const index = reservations.findIndex(r => r.id == resId);
        if (index !== -1) {
            reservations[index].status = status;
            localStorage.setItem('cheesy_reservations', JSON.stringify(reservations));
            showAdminToast('Status updated (local)');
        }
    }
}

function renderResPagination(total, page, totalPages) {
    const div = document.createElement('div');
    div.className = 'd-flex justify-content-between mt-3';
    div.innerHTML = `
        <span class="text-muted">Page ${page} of ${totalPages}</span>
        <div>
            <button class="btn-outline me-2" onclick="loadReservations(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Prev</button>
            <button class="btn-outline" onclick="loadReservations(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next</button>
        </div>
    `;
    document.querySelector('.chart-container').appendChild(div);
}

document.addEventListener('DOMContentLoaded', () => loadReservations());
