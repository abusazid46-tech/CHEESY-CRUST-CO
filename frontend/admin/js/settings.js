// Settings Logic
requireAdminAuth();

async function loadSettings() {
    let settings = JSON.parse(localStorage.getItem('admin_settings') || '{}');
    try {
        const response = await adminApi.getSettings();
        settings = response.settings || settings;
        localStorage.setItem('admin_settings', JSON.stringify(settings));
    } catch (error) {
        console.warn('Using local settings fallback:', error.message);
        showAdminToast('Could not load live settings. Showing last saved local copy.', 'warning');
    }
    
    document.getElementById('restaurantName').value = settings.restaurantName ?? 'Cheesy Crust Co.';
    document.getElementById('restaurantPhone').value = settings.restaurantPhone ?? '+916003116277';
    document.getElementById('restaurantEmail').value = settings.restaurantEmail ?? 'dine@cheesycrust.co';
    document.getElementById('restaurantAddress').value = settings.restaurantAddress ?? '';
    document.getElementById('deliveryFee').value = settings.deliveryFee ?? 40;
    document.getElementById('freeDeliveryThreshold').value = settings.freeDeliveryThreshold ?? 500;
    document.getElementById('minOrderAmount').value = settings.minOrderAmount ?? 100;
    document.getElementById('deliveryRadius').value = settings.deliveryRadius ?? 10;
    document.getElementById('maxGuests').value = settings.maxGuests ?? 8;
    document.getElementById('adminPhones').value = settings.adminPhones ?? '+916003116277';
}

function readNumber(id, label, min = 0) {
    const value = Number(document.getElementById(id).value);
    if (!Number.isFinite(value) || value < min) {
        throw new Error(`${label} must be ${min > 0 ? `at least ${min}` : '0 or more'}.`);
    }
    return Math.round(value);
}

async function saveAllSettings() {
    try {
        const settings = {
            restaurantName: document.getElementById('restaurantName').value.trim(),
            restaurantPhone: document.getElementById('restaurantPhone').value.trim(),
            restaurantEmail: document.getElementById('restaurantEmail').value.trim(),
            restaurantAddress: document.getElementById('restaurantAddress').value.trim(),
            deliveryFee: readNumber('deliveryFee', 'Delivery fee'),
            freeDeliveryThreshold: readNumber('freeDeliveryThreshold', 'Free delivery threshold'),
            minOrderAmount: readNumber('minOrderAmount', 'Minimum order amount'),
            deliveryRadius: readNumber('deliveryRadius', 'Delivery radius'),
            maxGuests: readNumber('maxGuests', 'Max guests per table', 1),
            adminPhones: document.getElementById('adminPhones').value.trim()
        };
        const response = await adminApi.updateSettings(settings);
        const saved = response.settings || settings;
        localStorage.setItem('admin_settings', JSON.stringify(saved));
        showAdminToast('Settings saved to live server successfully!');
    } catch (error) {
        showAdminToast(error.message || 'Server update failed. Settings were not saved.', 'warning');
    }
}

document.addEventListener('DOMContentLoaded', () => loadSettings());
