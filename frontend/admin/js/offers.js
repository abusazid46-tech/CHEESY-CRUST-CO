// Offers & Promos Logic
requireAdminAuth();

let offers = [];

async function loadOffers() {
    try {
        const response = await adminApi.getOffers();
        offers = response.offers || [];
        localStorage.setItem('admin_offers', JSON.stringify(offers));
    } catch (error) {
        offers = JSON.parse(localStorage.getItem('admin_offers') || '[]');
        showAdminToast('Using local offers fallback', 'warning');
    }
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

    container.innerHTML = offers.map(offer => `
        <div class="col-md-6">
            <div class="stat-card">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h6 style="color: var(--gold);">${offer.title}</h6>
                        <small class="text-muted">${offer.description || ''}</small>
                    </div>
                    <span class="badge-status ${offer.is_active !== false ? 'badge-delivered' : 'badge-cancelled'}">${offer.is_active !== false ? 'Active' : 'Inactive'}</span>
                </div>
                <div class="row text-center">
                    <div class="col-4">
                        <div class="stat-value" style="font-size: 1.2rem;">${offer.discountType === 'percentage' ? offer.discountValue + '%' : formatCurrency(offer.discountValue || 0)}</div>
                        <div class="stat-label">Discount</div>
                    </div>
                    <div class="col-4">
                        <div class="stat-value" style="font-size: 1.2rem;">${offer.code || 'N/A'}</div>
                        <div class="stat-label">Promo Code</div>
                    </div>
                    <div class="col-4">
                        <div class="stat-value" style="font-size: 1.2rem;">${formatCurrency(offer.minOrder || 0)}</div>
                        <div class="stat-label">Min Order</div>
                    </div>
                </div>
                <div class="d-flex justify-content-between mt-3 pt-2 border-top" style="border-color: #3a352e !important;">
                    <small>${offer.startDate || 'Now'} - ${offer.endDate || 'Until cancelled'}</small>
                    <div>
                        <button class="btn-icon me-2" onclick="toggleOffer('${offer._id}')" style="width: 32px; height: 32px;" title="Toggle">
                            <i class="fas fa-power-off"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteOffer('${offer._id}')" style="border-color: #dc3545; color: #dc3545; width: 32px; height: 32px;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
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

async function saveOffer() {
    const offer = {
        title: document.getElementById('offerTitle').value.trim(),
        description: document.getElementById('offerDesc').value.trim(),
        discountType: document.getElementById('offerDiscountType').value,
        discountValue: Number(document.getElementById('offerDiscountValue').value || 0),
        code: document.getElementById('offerCode').value.trim(),
        startDate: document.getElementById('offerStart').value,
        endDate: document.getElementById('offerEnd').value,
        minOrder: Number(document.getElementById('offerMinOrder').value || 0),
        is_active: document.getElementById('offerActive').checked
    };

    if (!offer.title) {
        showAdminToast('Offer title is required', 'warning');
        return;
    }

    try {
        await adminApi.createOffer(offer);
        bootstrap.Modal.getInstance(document.getElementById('offerModal')).hide();
        await loadOffers();
        showAdminToast('Offer created successfully!');
    } catch (error) {
        offer._id = String(Date.now());
        offers.push(offer);
        localStorage.setItem('admin_offers', JSON.stringify(offers));
        renderOffers();
        showAdminToast('Offer saved locally. Server update failed.', 'warning');
    }
}

async function toggleOffer(offerId) {
    try {
        await adminApi.toggleOfferStatus(offerId);
        await loadOffers();
    } catch (error) {
        showAdminToast('Failed to toggle offer', 'error');
    }
}

async function deleteOffer(offerId) {
    if (!confirm('Delete this offer?')) return;
    try {
        await adminApi.deleteOffer(offerId);
        await loadOffers();
        showAdminToast('Offer deleted');
    } catch (error) {
        offers = offers.filter(offer => offer._id !== offerId);
        localStorage.setItem('admin_offers', JSON.stringify(offers));
        renderOffers();
        showAdminToast('Offer deleted locally');
    }
}

document.addEventListener('DOMContentLoaded', () => loadOffers());
