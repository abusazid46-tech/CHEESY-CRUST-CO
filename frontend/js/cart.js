let cartItems = [];
let cartSubtotal = 0;
const DELIVERY_PINCODES = ['788001', '788002', '788003', '788004', '788005'];
let businessSettings = {
    deliveryFee: 40,
    freeDeliveryThreshold: 500,
    minOrderAmount: 100
};
let activeOffers = [];
let appliedOffer = null;

document.addEventListener('DOMContentLoaded', () => {
    loadCart();

    const orderTypeSelect = document.getElementById('orderType');
    const addressSection = document.getElementById('address-section');
    orderTypeSelect?.addEventListener('change', event => {
        addressSection.style.display = event.target.value === 'delivery' ? 'block' : 'none';
        renderCart();
    });

    document.getElementById('checkoutBtn')?.addEventListener('click', checkout);
    document.getElementById('applyPromoBtn')?.addEventListener('click', applyPromoCode);
    document.getElementById('removePromoBtn')?.addEventListener('click', removePromoCode);
});

async function loadCart() {
    await loadBusinessSettings();
    await loadActiveOffers();
    cartItems = localCart().map(normalizeCartItem);

    if (isAuthenticated()) {
        await syncLocalCartToBackend();
        try {
            const response = await api.getCart();
            if (Array.isArray(response.items)) {
                cartItems = response.items.map(normalizeCartItem);
                saveLocalCart(cartItems);
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    renderCart();
    updateCartCount();
}

async function syncLocalCartToBackend() {
    const localItems = localCart();
    if (!localItems.length) return;

    for (const item of localItems) {
        if (!isBackendItemId(item.id)) continue;
        try {
            await api.addToCart(item.id, Number(item.quantity || 1));
        } catch {
            // Keep local cart if an item does not exist in backend menu.
        }
    }
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const summary = document.getElementById('cart-summary');
    if (!container || !summary) return;

    if (!cartItems.length) {
        container.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-cart fa-3x mb-3" style="color: #3a352e;"></i><p>Your cart is empty</p><a href="index.html#menu" class="btn-outline-gold mt-3">Browse Menu</a></div>';
        summary.style.display = 'none';
        return;
    }

    summary.style.display = 'block';
    cartSubtotal = cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);

    container.innerHTML = cartItems.map(item => `
        <div class="cart-item" data-id="${escapeHtml(item.id)}">
            <img src="${escapeHtml(item.img)}" class="cart-item-img" alt="${escapeHtml(item.name)}">
            <div class="cart-item-details">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-price">${formatPrice(item.price)}</div>
            </div>
            <div class="d-flex align-items-center gap-3">
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateQuantity('${escapeJs(item.id)}', -1)">-</button>
                    <span class="mx-2">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity('${escapeJs(item.id)}', 1)">+</button>
                </div>
                <button class="remove-item" onclick="removeItem('${escapeJs(item.id)}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');

    const deliveryFee = getDeliveryFee();
    const discount = getOfferDiscount();
    document.getElementById('cart-subtotal').innerText = formatPrice(cartSubtotal);
    document.getElementById('delivery-fee').innerText = formatPrice(deliveryFee);
    document.getElementById('cart-total').innerText = formatPrice(cartSubtotal + deliveryFee - discount);
    renderOffers();
}

async function loadBusinessSettings() {
    try {
        const response = await api.request('/settings/public');
        businessSettings = { ...businessSettings, ...(response.settings || {}) };
    } catch (error) {
        console.warn('Using default cart settings:', error.message);
    }
}

async function loadActiveOffers() {
    try {
        const response = await api.request('/admin/offers/active');
        activeOffers = (response.offers || []).map(normalizeOffer).filter(offer => offer.discountValue > 0 || offer.discountType === 'bogo');
    } catch (error) {
        console.warn('Active offers unavailable:', error.message);
        activeOffers = [];
    }
}

function normalizeOffer(offer) {
    return {
        id: String(offer._id || offer.id || ''),
        title: offer.title || 'Offer',
        description: offer.description || '',
        code: String(offer.code || '').trim().toUpperCase(),
        discountType: offer.discountType || offer.discount_type || 'percentage',
        discountValue: Number(offer.discountValue ?? offer.discount_value ?? 0),
        minOrder: Number(offer.minOrder ?? offer.min_order ?? 0),
        startDate: offer.startDate || null,
        endDate: offer.endDate || null,
        is_active: offer.is_active !== false
    };
}

function isOfferUsable(offer) {
    if (!offer || !offer.is_active) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (offer.startDate) {
        const start = new Date(offer.startDate);
        start.setHours(0, 0, 0, 0);
        if (today < start) return false;
    }
    if (offer.endDate) {
        const end = new Date(offer.endDate);
        end.setHours(23, 59, 59, 999);
        if (today > end) return false;
    }
    return cartSubtotal >= Number(offer.minOrder || 0);
}

function offerStatusText(offer) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (offer.startDate) {
        const start = new Date(offer.startDate);
        start.setHours(0, 0, 0, 0);
        if (today < start) return `Starts ${offer.startDate}`;
    }
    if (offer.endDate) {
        const end = new Date(offer.endDate);
        end.setHours(23, 59, 59, 999);
        if (today > end) return 'Expired';
    }
    if (cartSubtotal < Number(offer.minOrder || 0)) return `Min order ${formatPrice(offer.minOrder)}`;
    return '';
}

function calculateOfferDiscount(offer) {
    if (!isOfferUsable(offer)) return 0;
    if (offer.discountType === 'bogo') {
        const unitPrices = [];
        cartItems.forEach(item => {
            for (let i = 0; i < Number(item.quantity || 1); i += 1) unitPrices.push(Number(item.price || 0));
        });
        return unitPrices.length >= 2 ? Math.min(...unitPrices) : 0;
    }
    if (offer.discountType === 'percentage') {
        return Math.min(cartSubtotal, Math.round(cartSubtotal * Math.min(Number(offer.discountValue || 0), 100) / 100));
    }
    if (offer.discountType === 'flat') {
        return Math.min(cartSubtotal, Number(offer.discountValue || 0));
    }
    return 0;
}

function getOfferDiscount() {
    if (!appliedOffer) return 0;
    if (!isOfferUsable(appliedOffer)) {
        appliedOffer = null;
        document.getElementById('promoCode').value = '';
        showToast('Applied offer removed because the cart no longer meets its conditions.', 'info');
        return 0;
    }
    return calculateOfferDiscount(appliedOffer);
}

function renderOffers() {
    const panel = document.getElementById('offers-panel');
    const list = document.getElementById('active-offers');
    const discountRow = document.getElementById('discount-row');
    const discountText = document.getElementById('offer-discount');
    const label = document.getElementById('applied-offer-label');
    const removeButton = document.getElementById('removePromoBtn');
    if (!panel || !list) return;

    panel.style.display = activeOffers.length ? 'block' : 'none';
    list.innerHTML = activeOffers.slice(0, 3).map(offer => {
        const disabled = !isOfferUsable(offer);
        const value = offer.discountType === 'percentage' ? `${offer.discountValue}% off` : offer.discountType === 'bogo' ? 'Buy one get one' : `${formatPrice(offer.discountValue)} off`;
        const status = offerStatusText(offer);
        return `
            <div class="offer-card">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div>
                        <strong>${escapeHtml(offer.title)}</strong>
                        <div class="small text-muted">${escapeHtml(offer.description || value)}</div>
                        ${status ? `<small style="color: #cda45e;">${escapeHtml(status)}</small>` : ''}
                    </div>
                    ${offer.code ? `<button class="btn-outline-gold" type="button" onclick="selectOfferCode('${escapeJs(offer.code)}')" ${disabled ? 'disabled' : ''}><span class="offer-code">${escapeHtml(offer.code)}</span></button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    const discount = appliedOffer ? calculateOfferDiscount(appliedOffer) : 0;
    discountRow.style.display = discount > 0 ? 'flex' : 'none';
    discountText.innerText = `-${formatPrice(discount)}`;
    label.innerText = appliedOffer ? `Applied: ${appliedOffer.code || appliedOffer.title}` : '';
    removeButton.style.display = appliedOffer ? 'block' : 'none';
}

function selectOfferCode(code) {
    document.getElementById('promoCode').value = code;
    applyPromoCode();
}

function applyPromoCode() {
    const code = String(document.getElementById('promoCode')?.value || '').trim().toUpperCase();
    if (!code) {
        showToast('Enter a promo code.', 'warning');
        return;
    }
    const offer = activeOffers.find(item => item.code === code);
    if (!offer) {
        showToast('Promo code is not active.', 'error');
        return;
    }
    if (!isOfferUsable(offer)) {
        showToast(offerStatusText(offer) || 'This offer is not available for this cart.', 'error');
        return;
    }
    appliedOffer = offer;
    showToast(`${offer.title} applied.`, 'success');
    renderCart();
}

function removePromoCode() {
    appliedOffer = null;
    document.getElementById('promoCode').value = '';
    renderCart();
}

async function updateQuantity(id, delta) {
    const item = cartItems.find(i => i.id === id);
    if (!item) return;

    const newQty = Number(item.quantity || 1) + delta;
    if (newQty <= 0) {
        await removeItem(id);
        return;
    }

    item.quantity = newQty;
    saveLocalCart(cartItems);

    if (isAuthenticated() && isBackendItemId(id)) {
        try {
            await api.updateCartItem(id, newQty);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    renderCart();
    updateCartCount();
}

async function removeItem(id) {
    cartItems = cartItems.filter(i => i.id !== id);
    saveLocalCart(cartItems);

    if (isAuthenticated() && isBackendItemId(id)) {
        try {
            await api.removeFromCart(id);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    renderCart();
    updateCartCount();
}

async function checkout() {
    const button = document.getElementById('checkoutBtn');
    const orderType = document.getElementById('orderType').value;
    const address = document.getElementById('deliveryAddress')?.value.trim();
    const pincode = normalizePincode(document.getElementById('deliveryPincode')?.value);

    if (!cartItems.length) {
        showToast('Your cart is empty', 'error');
        return;
    }
    if (orderType === 'delivery' && !address) {
        showToast('Please enter delivery address', 'error');
        return;
    }
    if (orderType === 'delivery' && !isDeliveryPincodeAllowed(pincode)) {
        showToast('Delivery is available only for PIN codes 788001, 788002, 788003, 788004 and 788005. Please choose takeaway or book a table.', 'error');
        return;
    }
    if (cartSubtotal < Number(businessSettings.minOrderAmount || 0)) {
        showToast(`Minimum order amount is ${formatPrice(businessSettings.minOrderAmount)}.`, 'error');
        return;
    }
    if (!isAuthenticated()) {
        showAuthModalForCheckout();
        return;
    }

    setLoading(button, true, 'Creating order...');
    try {
        await processCheckout(orderType, address, pincode);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setLoading(button, false);
    }
}

async function processCheckout(orderType, address, pincode = '') {
    const orderData = {
        items: cartItems.map(item => ({
            item_id: item.item_id || item.id,
            name: item.name,
            price: Number(item.price),
            quantity: Number(item.quantity || 1),
            image_url: item.image_url || item.img || null
        })),
        total: cartSubtotal + getDeliveryFee(),
        order_type: orderType,
        address: orderType === 'delivery' ? address : null,
        pincode: orderType === 'delivery' ? pincode : null,
        promo_code: appliedOffer?.code || null
    };

    const order = await api.createOrder(orderData);
    orderData.total = Number(order.total || orderData.total);
    orderData.discount = Number(order.discount || 0);
    const paymentOrder = await api.createPaymentOrder(order.total, order.order_id, null);

    if (!window.Razorpay) {
        throw new Error('Razorpay checkout failed to load.');
    }

    const rzp = new Razorpay({
        key: paymentOrder.razorpay_key,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency || 'INR',
        name: 'Cheesy Crust Co.',
        description: `Order #${order.order_number || order.order_id}`,
        order_id: paymentOrder.razorpay_order_id,
        prefill: {
            name: localStorage.getItem(STORAGE_KEYS.userName) || 'Customer',
            email: localStorage.getItem(STORAGE_KEYS.userEmail) || '',
            contact: String(localStorage.getItem(STORAGE_KEYS.userPhone) || '').replace(/\D/g, '').slice(-10)
        },
        theme: { color: '#cda45e' },
        handler: async paymentResponse => {
            try {
                await api.verifyPayment({
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_signature: paymentResponse.razorpay_signature,
                    order_id: order.order_id
                });
                completeOrder(order, orderData);
            } catch (error) {
                showToast(error.message, 'error');
            }
        },
        modal: {
            ondismiss: () => showToast('Payment cancelled. Your cart was not cleared.', 'info')
        }
    });
    rzp.on('payment.failed', response => {
        const description = response?.error?.description || 'Payment could not be completed. Try another UPI app or card.';
        showToast(description, 'error');
    });
    rzp.open();
}

function completeOrder(order, orderData) {
    const completedOrder = {
        id: order.order_number || order.order_id,
        items: [...cartItems],
        total: orderData.total,
        order_type: orderData.order_type,
        address: orderData.address,
        status: 'confirmed',
        date: new Date().toISOString(),
        timestamp: new Date().toISOString()
    };

    const orders = getStoredJson('cheesy_orders', []);
    orders.push(completedOrder);
    localStorage.setItem('cheesy_orders', JSON.stringify(orders));
    localStorage.setItem('last_order', JSON.stringify(completedOrder));
    cartItems = [];
    saveLocalCart([]);
    renderCart();
    updateCartCount();
    showToast('Payment successful. Order confirmed.');
    setTimeout(() => window.location.href = 'profile.html', 1200);
}

function showAuthModalForCheckout() {
    let authModal = document.getElementById('checkoutAuthModal');
    if (!authModal) {
        authModal = document.createElement('div');
        authModal.className = 'modal fade auth-modal';
        authModal.id = 'checkoutAuthModal';
        authModal.setAttribute('tabindex', '-1');
        authModal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background: #1a1814; color: white; border: 1px solid rgba(205,164,94,0.3);">
                    <div class="modal-header" style="border-bottom: 1px solid rgba(205,164,94,0.2);">
                        <h5 class="modal-title" style="color: #cda45e;">Sign In to Complete Order</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" style="filter: invert(1);"></button>
                    </div>
                    <div class="modal-body">
                        <form id="checkoutAuthForm">
                            <label class="form-label" style="color: #cda45e;">Email or Mobile Number</label>
                            <input type="text" class="form-control mb-3" id="checkoutIdentifier" placeholder="email@example.com or +91 98765 43210" style="background: #0c0b09; border-color: #3a352e; color: white;">
                            <label class="form-label" style="color: #cda45e;">Password</label>
                            <input type="password" class="form-control mb-3" id="checkoutPassword" placeholder="Enter password" style="background: #0c0b09; border-color: #3a352e; color: white;">
                            <button class="btn btn-gold w-100" id="checkoutLoginBtn" type="submit">Sign In & Continue</button>
                        </form>
                        <div id="checkoutAuthMessage" class="mt-3 text-center small" style="color: #cda45e;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(authModal);
        setupCheckoutAuthHandlers();
    }
    new bootstrap.Modal(authModal).show();
}

function setupCheckoutAuthHandlers() {
    document.getElementById('checkoutAuthForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const identifier = document.getElementById('checkoutIdentifier').value.trim();
        const password = document.getElementById('checkoutPassword').value;
        const message = document.getElementById('checkoutAuthMessage');
        if (!identifier || !password) {
            message.innerText = 'Please enter your email/mobile and password.';
            return;
        }
        setLoading(document.getElementById('checkoutLoginBtn'), true, 'Signing in...');
        try {
            await api.login(identifier, password);
            bootstrap.Modal.getInstance(document.getElementById('checkoutAuthModal')).hide();
            showToast('Signed in successfully.');
            await loadCart();
            if (!cartItems.length) {
                showToast('These cart items are no longer available. Please add them again from the menu.', 'error');
                return;
            }
            const checkoutOrderType = document.getElementById('orderType').value;
            const checkoutAddress = document.getElementById('deliveryAddress')?.value.trim();
            const checkoutPincode = normalizePincode(document.getElementById('deliveryPincode')?.value);
            if (checkoutOrderType === 'delivery' && !isDeliveryPincodeAllowed(checkoutPincode)) {
                showToast('Delivery is available only for PIN codes 788001, 788002, 788003, 788004 and 788005. Please choose takeaway or book a table.', 'error');
                return;
            }
            if (cartSubtotal < Number(businessSettings.minOrderAmount || 0)) {
                showToast(`Minimum order amount is ${formatPrice(businessSettings.minOrderAmount)}.`, 'error');
                return;
            }
            await processCheckout(checkoutOrderType, checkoutAddress, checkoutPincode);
        } catch (error) {
            message.innerText = error.message;
        } finally {
            setLoading(document.getElementById('checkoutLoginBtn'), false);
        }
    });
}

function getDeliveryFee() {
    const orderType = document.getElementById('orderType')?.value;
    if (orderType !== 'delivery') return 0;
    if (cartSubtotal >= Number(businessSettings.freeDeliveryThreshold || 0)) return 0;
    return Number(businessSettings.deliveryFee || 0);
}

function normalizePincode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function isDeliveryPincodeAllowed(pincode) {
    return DELIVERY_PINCODES.includes(normalizePincode(pincode));
}

function escapeJs(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
