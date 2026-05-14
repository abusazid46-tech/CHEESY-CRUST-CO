// Review Moderation Logic
requireAdminAuth();

let reviews = [];
let reviewsFromServer = false;

async function loadReviews() {
    try {
        const response = await adminApi.getReviews();
        reviews = response.reviews || [];
        reviewsFromServer = true;
    } catch (error) {
        reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
        reviewsFromServer = false;
    }
    renderReviews();
}

function renderReviews() {
    const container = document.getElementById('reviewsContainer');

    if (reviews.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-star fa-3x mb-3" style="color: #3a352e;"></i>
                <p class="text-muted">No reviews yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = [...reviews].reverse().map(review => {
        const id = review._id || review.id;
        const rating = Number(review.rating || 0);
        return `
            <div class="col-md-6">
                <div class="stat-card">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <strong>${review.userName || review.user_name || 'Customer'}</strong>
                            <small class="text-muted ms-2">${review.userPhone || review.phone || ''}</small>
                        </div>
                        <span style="color: var(--gold);">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>
                    </div>
                    <p class="mb-2">${review.comment || ''}</p>
                    <div class="d-flex justify-content-between">
                        <small class="text-muted">
                            Item: ${review.itemName || review.item_name || review.item_id || 'Menu item'} | ${formatDate(review.date || review.created_at)}
                        </small>
                        <div>
                            ${review.approved ?
                                '<span class="badge-status badge-delivered">Approved</span>' :
                                `<button class="btn-outline btn-sm me-1" onclick="approveReview('${id}')" style="padding: 4px 12px; font-size: 0.75rem;">Approve</button>`
                            }
                            <button class="btn-icon btn-sm" onclick="deleteReview('${id}')" style="border-color: #dc3545; color: #dc3545; width: 28px; height: 28px;" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

async function approveReview(reviewId) {
    if (reviewsFromServer) {
        try {
            await adminApi.approveReview(reviewId);
            await loadReviews();
            showAdminToast('Review approved!');
            return;
        } catch (error) {
            showAdminToast('Failed to approve review', 'error');
            return;
        }
    }

    const allReviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
    const index = allReviews.findIndex(r => String(r.id) === String(reviewId));
    if (index !== -1) {
        allReviews[index].approved = true;
        localStorage.setItem('all_reviews', JSON.stringify(allReviews));
        reviews = allReviews;
        renderReviews();
        showAdminToast('Review approved!');
    }
}

async function deleteReview(reviewId) {
    if (!confirm('Delete this review?')) return;

    if (reviewsFromServer) {
        try {
            await adminApi.deleteReview(reviewId);
            await loadReviews();
            showAdminToast('Review deleted');
            return;
        } catch (error) {
            showAdminToast('Failed to delete review', 'error');
            return;
        }
    }

    const filtered = reviews.filter(r => String(r.id) !== String(reviewId));
    localStorage.setItem('all_reviews', JSON.stringify(filtered));
    reviews = filtered;
    renderReviews();
    showAdminToast('Review deleted');
}

document.addEventListener('DOMContentLoaded', () => loadReviews());
