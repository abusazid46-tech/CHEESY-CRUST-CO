// Menu Management Logic
requireAdminAuth();

let menuModal;

// Load menu items
async function loadMenu() {
    try {
        const data = await adminApi.getMenu();
        
        if (data.items) {
            renderMenuTable(data.items);
        }
    } catch (error) {
        console.error('Menu error:', error);
        showAdminToast('Failed to load menu', 'error');
    }
}

// Render menu table
function renderMenuTable(items) {
    const tbody = document.getElementById('menuTable');
    
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No menu items</td></tr>';
        return;
    }
    
    tbody.innerHTML = items.map(item => `
        <tr>
            <td><img src="${item.image_url}" width="50" height="50" style="border-radius: 8px; object-fit: cover;"></td>
            <td><strong>${item.name}</strong><br><small class="text-muted">${item.slug}</small></td>
            <td><span class="badge-status badge-confirmed">${item.category}</span></td>
            <td><strong style="color: var(--gold);">${formatCurrency(item.price)}</strong></td>
            <td>${item.is_available ? '<span class="badge-status badge-delivered">Yes</span>' : '<span class="badge-status badge-cancelled">No</span>'}</td>
            <td>${item.rating?.avg || 0} ⭐ (${item.rating?.count || 0})</td>
            <td>
                <button class="btn-icon me-1" onclick="editMenuItem('${item._id}')" title="Edit" style="width: 32px; height: 32px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon" onclick="deleteMenuItem('${item._id}', '${item.name}')" title="Delete" style="width: 32px; height: 32px; border-color: #dc3545; color: #dc3545;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Open add modal
function openAddMenuItemModal() {
    document.getElementById('modalTitle').innerText = 'Add Menu Item';
    document.getElementById('itemId').value = '';
    document.getElementById('menuItemForm').reset();
    document.getElementById('itemVeg').checked = true;
    document.getElementById('itemAvailable').checked = true;
    
    menuModal = new bootstrap.Modal(document.getElementById('menuItemModal'));
    menuModal.show();
}

// Edit menu item
async function editMenuItem(itemId) {
    try {
        const data = await adminApi.getMenu();
        const item = data.items.find(i => i._id === itemId);
        
        if (item) {
            document.getElementById('modalTitle').innerText = 'Edit Menu Item';
            document.getElementById('itemId').value = item._id;
            document.getElementById('itemName').value = item.name;
            document.getElementById('itemCategory').value = item.category;
            document.getElementById('itemPrice').value = item.price;
            document.getElementById('itemDescription').value = item.description;
            document.getElementById('itemImage').value = item.image_url;
            document.getElementById('itemVeg').checked = item.is_veg;
            document.getElementById('itemAvailable').checked = item.is_available;
            
            menuModal = new bootstrap.Modal(document.getElementById('menuItemModal'));
            menuModal.show();
        }
    } catch (error) {
        showAdminToast('Failed to load item', 'error');
    }
}

// Save menu item
async function saveMenuItem() {
    const itemId = document.getElementById('itemId').value;
    
    const itemData = {
        name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        description: document.getElementById('itemDescription').value,
        image_url: document.getElementById('itemImage').value,
        is_veg: document.getElementById('itemVeg').checked,
        is_available: document.getElementById('itemAvailable').checked
    };
    
    try {
        if (itemId) {
            await adminApi.updateMenuItem(itemId, itemData);
            showAdminToast('Menu item updated!');
        } else {
            await adminApi.createMenuItem(itemData);
            showAdminToast('Menu item created!');
        }
        
        menuModal.hide();
        loadMenu();
    } catch (error) {
        showAdminToast('Failed to save item', 'error');
    }
}

// Delete menu item
async function deleteMenuItem(itemId, itemName) {
    if (confirm(`Are you sure you want to delete "${itemName}"?`)) {
        try {
            await adminApi.deleteMenuItem(itemId);
            showAdminToast('Menu item deleted!');
            loadMenu();
        } catch (error) {
            showAdminToast('Failed to delete item', 'error');
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => loadMenu());
