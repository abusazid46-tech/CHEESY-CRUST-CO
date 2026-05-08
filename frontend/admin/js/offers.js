// Offers & Promos Logic
requireAdminAuth();

let offers = JSON.parse(localStorage.getItem('admin_offers') || '[]');

function loadOffers() {
    renderOffers();
}

function renderOffers() {
    const container = document.getElementById('offersContainer');
    
    if (offers.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-tags fa-3x mb-3" style="color: #3a352e;"></i>
                <p class="text-muted">No offers created yet</p>
                <button class="btn-gold" onclick="openAddOfferModal()">Create First Offer</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = offers.map((offer, index) => `
        <div class="col-md-6">
            <div class="stat-card">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h6 style="color: var(--gold);">${offer.title}</h6>
                        <small class="text-muted">${offer.description || ''}</small>
                    </div>
                    <span class="badge-status ${offer.active ? 'badge-delivered' : 'badge-cancelled'}">${offer.active ? 'Active' : 'Inactive'}</span>
                </div>
                <div class="row text-center">
                    <div class="col-4">
                        <div class="stat-value" style="font-size: 1.2rem;">${offer.discountType === 'percentage' ? offer.discountValue + '%' : '₹' + offer.discountValue}</div>
                        <div class="stat-label">Discount</div>
                    </div>
                    <div class="col-4">
                        <div class="stat-value" style="font-size: 1.2rem;">${offer.code || 'N/A'}</div>
                        <div class="stat-label">Promo Code</div>
                    </div>
                    <div class="col-4">
                        <div class="stat-value" style="font-size: 1.2rem;">₹${offer.minOrder || 0}</div>
                        <div class="stat-label">Min Order</div>
                    </div>
                </div>
                <div class="d-flex justify-content-between mt-3 pt-2 border-top" style="border-color: #3a352e !important;">
                    <small>${offer.startDate || 'Now'} - ${offer.endDate || 'Until cancelled'}</small>
                    <button class="btn-icon" onclick="deleteOffer(${index})" style="border-color: #dc3545; color: #dc3545; width: 32px; height: 32px;" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function openAddOfferModal() {
    document.getElementById('offerForm').reset();
    document.getElementById('offerActive').checked = true;
    new bootstrap.Modal(document.getElementById('offerModal')).show();
}

function saveOffer() {
    const offer = {
        id: Date.now(),
        title: document.getElementById('offerTitle').value,
        description: document.getElementById('offerDesc').value,
        discountType: document.getElementById('offerDiscountType').value,
        discountValue: document.getElementById('offerDiscountValue').value,
        code: document.getElementById('offerCode').value,
        startDate: document.getElementById('offerStart').value,
        endDate: document.getElementById('offerEnd').value,
        minOrder: document.getElementById('offerMinOrder').value,
        active: document.getElementById('offerActive').checked,
        createdAt: new Date().toISOString()
    };
    
    offers.push(offer);
    localStorage.setItem('admin_offers', JSON.stringify(offers));
    
    bootstrap.Modal.getInstance(document.getElementById('offerModal')).hide();
    renderOffers();
    showAdminToast('Offer created successfully!');
}

function deleteOffer(index) {
    if (confirm('Delete this offer?')) {
        offers.splice(index, 1);
        localStorage.setItem('admin_offers', JSON.stringify(offers));
        renderOffers();
        showAdminToast('Offer deleted');
    }
}

document.addEventListener('DOMContentLoaded', () => loadOffers());
