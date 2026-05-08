// Review Moderation Logic
requireAdminAuth();

function loadReviews() {
    const allReviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
    const container = document.getElementById('reviewsContainer');
    
    if (allReviews.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-star fa-3x mb-3" style="color: #3a352e;"></i>
                <p class="text-muted">No reviews yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = allReviews.reverse().map(review => `
        <div class="col-md-6">
            <div class="stat-card">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <strong>${review.userName || 'Customer'}</strong>
                        <small class="text-muted ms-2">${review.userPhone || ''}</small>
                    </div>
                    <span style="color: var(--gold);">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
                </div>
                <p class="mb-2">${review.comment}</p>
                <div class="d-flex justify-content-between">
                    <small class="text-muted">
                        Item: ${review.itemName} | ${new Date(review.date).toLocaleDateString()}
                    </small>
                    <div>
                        ${review.approved ? 
                            '<span class="badge-status badge-delivered">Approved</span>' : 
                            `<button class="btn-outline btn-sm me-1" onclick="approveReview(${review.id})" style="padding: 4px 12px; font-size: 0.75rem;">Approve</button>`
                        }
                        <button class="btn-icon btn-sm" onclick="deleteReview(${review.id})" style="border-color: #dc3545; color: #dc3545; width: 28px; height: 28px;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function approveReview(reviewId) {
    const reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
    const index = reviews.findIndex(r => r.id === reviewId);
    if (index !== -1) {
        reviews[index].approved = true;
        localStorage.setItem('all_reviews', JSON.stringify(reviews));
        loadReviews();
        showAdminToast('Review approved!');
    }
}

function deleteReview(reviewId) {
    if (confirm('Delete this review?')) {
        const reviews = JSON.parse(localStorage.getItem('all_reviews') || '[]');
        const filtered = reviews.filter(r => r.id !== reviewId);
        localStorage.setItem('all_reviews', JSON.stringify(filtered));
        loadReviews();
        showAdminToast('Review deleted');
    }
}

document.addEventListener('DOMContentLoaded', () => loadReviews());
