// Settings Logic
requireAdminAuth();

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('admin_settings') || '{}');
    
    document.getElementById('restaurantName').value = settings.restaurantName || 'Cheesy Crust Co.';
    document.getElementById('restaurantPhone').value = settings.restaurantPhone || '+917002012345';
    document.getElementById('restaurantEmail').value = settings.restaurantEmail || 'dine@cheesycrust.co';
    document.getElementById('restaurantAddress').value = settings.restaurantAddress || '';
    document.getElementById('deliveryFee').value = settings.deliveryFee || 40;
    document.getElementById('freeDeliveryThreshold').value = settings.freeDeliveryThreshold || 500;
    document.getElementById('minOrderAmount').value = settings.minOrderAmount || 100;
    document.getElementById('deliveryRadius').value = settings.deliveryRadius || 10;
    document.getElementById('maxGuests').value = settings.maxGuests || 8;
    document.getElementById('adminPhones').value = settings.adminPhones || '+917002012345';
}

function saveAllSettings() {
    const settings = {
        restaurantName: document.getElementById('restaurantName').value,
        restaurantPhone: document.getElementById('restaurantPhone').value,
        restaurantEmail: document.getElementById('restaurantEmail').value,
        restaurantAddress: document.getElementById('restaurantAddress').value,
        deliveryFee: parseInt(document.getElementById('deliveryFee').value),
        freeDeliveryThreshold: parseInt(document.getElementById('freeDeliveryThreshold').value),
        minOrderAmount: parseInt(document.getElementById('minOrderAmount').value),
        deliveryRadius: parseInt(document.getElementById('deliveryRadius').value),
        maxGuests: parseInt(document.getElementById('maxGuests').value),
        adminPhones: document.getElementById('adminPhones').value,
        updatedAt: new Date().toISOString()
    };
    
    localStorage.setItem('admin_settings', JSON.stringify(settings));
    showAdminToast('Settings saved successfully!');
}

document.addEventListener('DOMContentLoaded', () => loadSettings());
