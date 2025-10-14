// Admin functionality
let allPosts = [];
let currentFilter = 'all';
let currentSort = 'newest';

// Initialize admin
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel initializing...');
    loadAllPosts();
    setupAdminEventListeners();
    updateStats();
});

// Setup admin event listeners
function setupAdminEventListeners() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sort-select');
    const refreshBtn = document.getElementById('refresh-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    const searchInput = document.getElementById('search-input');
    const bulkActions = document.getElementById('bulk-actions');
    const selectAllCheckbox = document.getElementById('select-all');
    const deleteSelectedBtn = document.getElementById('delete-selected');
    const exportBtn = document.getElementById('export-btn');
    const addPostBtn = document.getElementById('add-post-btn');
    const addPostModal = document.getElementById('add-post-modal');
    const closeModal = document.querySelector('.close-modal');
    const postForm = document.getElementById('post-form');
    const mediaTypeSelect = document.getElementById('media-type');
    const mediaUrlGroup = document.getElementById('media-url-group');

    // Filter buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            filterAndRenderPosts();
        });
    });

    // Sort select
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        filterAndRenderPosts();
    });

    // Refresh button
    refreshBtn.addEventListener('click', () => {
        loadAllPosts(true);
    });

    // Clear cache button
    clearCacheBtn.addEventListener('click', clearCache);

    // Search input
    searchInput.addEventListener('input', debounce(filterAndRenderPosts, 300));

    // Select all checkbox
    selectAllCheckbox.addEventListener('change', toggleSelectAll);

    // Delete selected button
    deleteSelectedBtn.addEventListener('click', deleteSelectedPosts);

    // Export button
    exportBtn.addEventListener('click', exportData);

    // Add post button and modal
    addPostBtn.addEventListener('click', () => {
        addPostModal.style.display = 'block';
    });

    closeModal.addEventListener('click', () => {
        addPostModal.style.display = 'none';
    });

    // Media type change
    mediaTypeSelect.addEventListener('change', (e) => {
        mediaUrlGroup.style.display = e.target.value ? 'block' : 'none';
    });

    // Post form submission
    postForm.addEventListener('submit', handleAddPost);

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === addPostModal) {
            addPostModal.style.display = 'none';
        }
    });

    // Responsive menu
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Close sidebar when clicking on a link (mobile)
    const sidebarLinks = document.querySelectorAll('.sidebar a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
        });
    });
}

// Load all posts for admin
async function loadAllPosts(forceRefresh = false) {
    try {
        showAdminLoading();
        
        const timestamp = forceRefresh ? `?refresh=true&t=${Date.now()}` : `?t=${Date.now()}`;
        const response = await fetch(`/api/posts${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Admin: Loaded ${data.length} posts`);
        
        allPosts = data;
        filterAndRenderPosts();
        updateStats();
        hideAdminLoading();
        
    } catch (error) {
        console.error('Error loading posts for admin:', error);
        showAdminError('Gagal memuat data postingan');
        hideAdminLoading();
    }
}

// Show admin loading
function showAdminLoading() {
    const loading = document.getElementById('admin-loading');
    const postsContainer = document.getElementById('admin-posts-container');
    if (loading) loading.style.display = 'block';
    if (postsContainer) postsContainer.style.opacity = '0.5';
}

// Hide admin loading
function hideAdminLoading() {
    const loading = document.getElementById('admin-loading');
    const postsContainer = document.getElementById('admin-posts-container');
    if (loading) loading.style.display = 'none';
    if (postsContainer) postsContainer.style.opacity = '1';
}

// Show admin error
function showAdminError(message) {
    const container = document.getElementById('admin-posts-container');
    container.innerHTML = `
        <div class="admin-error">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Error</h3>
            <p>${message}</p>
            <button onclick="loadAllPosts(true)" class="retry-btn">
                <i class="fas fa-redo"></i> Coba Lagi
            </button>
        </div>
    `;
}

// Filter and render posts
function filterAndRenderPosts() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    let filteredPosts = [...allPosts];

    // Apply search filter
    if (searchTerm) {
        filteredPosts = filteredPosts.filter(post => 
            post.content.toLowerCase().includes(searchTerm) ||
            post.user.toLowerCase().includes(searchTerm) ||
            (post.media && post.media.title && post.media.title.toLowerCase().includes(searchTerm)) ||
            (post.media && post.media.artist && post.media.artist.toLowerCase().includes(searchTerm))
        );
    }

    // Apply type filter
    if (currentFilter !== 'all') {
        filteredPosts = filteredPosts.filter(post => {
            if (currentFilter === 'with-media') {
                return post.media && post.media.type;
            } else if (currentFilter === 'text-only') {
                return !post.media || !post.media.type;
            } else if (currentFilter === 'images') {
                return post.media && post.media.type === 'image';
            } else if (currentFilter === 'videos') {
                return post.media && post.media.type === 'video';
            } else if (currentFilter === 'audio') {
                return post.media && post.media.type === 'audio';
            }
            return true;
        });
    }

    // Apply sorting
    filteredPosts.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        
        switch (currentSort) {
            case 'newest':
                return dateB - dateA;
            case 'oldest':
                return dateA - dateB;
            case 'most-liked':
                return (b.likes || 0) - (a.likes || 0);
            case 'most-commented':
                return (b.comments || 0) - (a.comments || 0);
            case 'most-viewed':
                return (b.views || 0) - (a.views || 0);
            default:
                return dateB - dateA;
        }
    });

    renderAdminPosts(filteredPosts);
    updateResultsCount(filteredPosts.length);
}

// Render posts in admin
function renderAdminPosts(posts) {
    const container = document.getElementById('admin-posts-container');
    
    if (posts.length === 0) {
        container.innerHTML = `
            <div class="no-posts-admin">
                <i class="fas fa-inbox"></i>
                <h3>Tidak ada postingan</h3>
                <p>Tidak ada postingan yang sesuai dengan filter yang dipilih.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = posts.map((post, index) => `
        <div class="admin-post-card ${index % 2 === 0 ? 'even' : 'odd'}" data-post-id="${post.id}">
            <div class="post-checkbox">
                <input type="checkbox" class="post-select" value="${post.id}">
            </div>
            <div class="post-preview">
                <div class="post-meta">
                    <span class="post-user"><i class="fas fa-user"></i> ${escapeHtml(post.user)}</span>
                    <span class="post-date"><i class="fas fa-clock"></i> ${formatDate(post.date)}</span>
                    <span class="post-id"><i class="fas fa-fingerprint"></i> ${post.id}</span>
                </div>
                <div class="post-content-preview">
                    ${escapeHtml(post.content.length > 150 ? post.content.substring(0, 150) + '...' : post.content)}
                </div>
                ${post.media ? `
                    <div class="post-media-preview">
                        <span class="media-badge ${post.media.type}">
                            <i class="fas fa-${getMediaIcon(post.media.type)}"></i>
                            ${post.media.type.toUpperCase()}
                        </span>
                        ${post.media.title ? `<span class="media-title">${escapeHtml(post.media.title)}</span>` : ''}
                    </div>
                ` : ''}
            </div>
            <div class="post-stats-admin">
                <div class="stat">
                    <i class="fas fa-heart"></i>
                    <span>${post.likes || 0}</span>
                </div>
                <div class="stat">
                    <i class="fas fa-comment"></i>
                    <span>${post.comments || 0}</span>
                </div>
                <div class="stat">
                    <i class="fas fa-share"></i>
                    <span>${post.shares || 0}</span>
                </div>
                <div class="stat">
                    <i class="fas fa-eye"></i>
                    <span>${post.views || 0}</span>
                </div>
            </div>
            <div class="post-actions-admin">
                <button class="btn-action view-details" onclick="viewPostDetails('${post.id}')" title="Lihat Detail">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-action edit-post" onclick="editPost('${post.id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action delete-post" onclick="deletePost('${post.id}')" title="Hapus">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Update bulk actions visibility
    updateBulkActions();
}

// Update results count
function updateResultsCount(count) {
    const resultsElement = document.getElementById('results-count');
    if (resultsElement) {
        resultsElement.textContent = `${count} hasil ditemukan`;
    }
}

// Update statistics
function updateStats() {
    const totalPosts = allPosts.length;
    const totalLikes = allPosts.reduce((sum, post) => sum + (post.likes || 0), 0);
    const totalComments = allPosts.reduce((sum, post) => sum + (post.comments || 0), 0);
    const totalViews = allPosts.reduce((sum, post) => sum + (post.views || 0), 0);
    
    const postsWithMedia = allPosts.filter(post => post.media && post.media.type).length;
    const imagesCount = allPosts.filter(post => post.media && post.media.type === 'image').length;
    const videosCount = allPosts.filter(post => post.media && post.media.type === 'video').length;
    const audioCount = allPosts.filter(post => post.media && post.media.type === 'audio').length;

    document.getElementById('total-posts').textContent = totalPosts;
    document.getElementById('total-likes').textContent = totalLikes;
    document.getElementById('total-comments').textContent = totalComments;
    document.getElementById('total-views').textContent = totalViews;
    document.getElementById('posts-with-media').textContent = postsWithMedia;
    document.getElementById('images-count').textContent = imagesCount;
    document.getElementById('videos-count').textContent = videosCount;
    document.getElementById('audio-count').textContent = audioCount;
}

// Toggle select all
function toggleSelectAll() {
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.post-select');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateBulkActions();
}

// Update bulk actions
function updateBulkActions() {
    const selectedCount = document.querySelectorAll('.post-select:checked').length;
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCountElement = document.getElementById('selected-count');
    
    if (selectedCountElement) {
        selectedCountElement.textContent = `${selectedCount} dipilih`;
    }
    
    if (bulkActions) {
        if (selectedCount > 0) {
            bulkActions.classList.add('active');
        } else {
            bulkActions.classList.remove('active');
        }
    }
}

// Delete selected posts
async function deleteSelectedPosts() {
    const selectedCheckboxes = document.querySelectorAll('.post-select:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (selectedIds.length === 0) return;
    
    if (!confirm(`Anda yakin ingin menghapus ${selectedIds.length} postingan?`)) {
        return;
    }
    
    try {
        showAdminLoading();
        
        // Delete posts optimistically
        selectedIds.forEach(id => {
            const postIndex = allPosts.findIndex(post => post.id === id);
            if (postIndex !== -1) {
                allPosts.splice(postIndex, 1);
            }
        });
        
        filterAndRenderPosts();
        updateStats();
        
        // Delete from server in background
        const deletePromises = selectedIds.map(id => 
            fetch(`/api/posts/${id}`, { method: 'DELETE' })
        );
        
        await Promise.allSettled(deletePromises);
        console.log(`Deleted ${selectedIds.length} posts`);
        
        hideAdminLoading();
        showAdminSuccess(`${selectedIds.length} postingan berhasil dihapus`);
        
    } catch (error) {
        console.error('Error deleting selected posts:', error);
        showAdminError('Gagal menghapus beberapa postingan');
        hideAdminLoading();
    }
}

// Delete single post
async function deletePost(postId) {
    if (!confirm('Anda yakin ingin menghapus postingan ini?')) {
        return;
    }
    
    try {
        const postElement = document.querySelector(`[data-post-id="${postId}"]`);
        if (postElement) {
            postElement.style.opacity = '0.5';
        }
        
        // Optimistic delete
        const postIndex = allPosts.findIndex(post => post.id === postId);
        if (postIndex !== -1) {
            allPosts.splice(postIndex, 1);
        }
        
        filterAndRenderPosts();
        updateStats();
        
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete post');
        }
        
        console.log('Post deleted successfully');
        showAdminSuccess('Postingan berhasil dihapus');
        
    } catch (error) {
        console.error('Error deleting post:', error);
        showAdminError('Gagal menghapus postingan');
        // Reload to restore state
        loadAllPosts(true);
    }
}

// View post details
function viewPostDetails(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
        box-sizing: border-box;
    `;
    
    let mediaHTML = '';
    if (post.media) {
        switch (post.media.type) {
            case 'image':
                mediaHTML = `<img src="${post.media.url}" style="max-width: 100%; max-height: 400px; object-fit: contain; border-radius: 8px;">`;
                break;
            case 'video':
                mediaHTML = `
                    <video controls style="max-width: 100%; max-height: 400px; border-radius: 8px;">
                        <source src="${post.media.url}" type="video/mp4">
                    </video>
                `;
                break;
            case 'audio':
                mediaHTML = `
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                        ${post.media.title ? `<h4>${escapeHtml(post.media.title)}</h4>` : ''}
                        ${post.media.artist ? `<p>${escapeHtml(post.media.artist)}</p>` : ''}
                        <audio controls style="width: 100%; margin-top: 10px;">
                            <source src="${post.media.url}" type="audio/mpeg">
                        </audio>
                    </div>
                `;
                break;
        }
    }
    
    const commentsHTML = (post.commentsList || []).map(comment => `
        <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
            <div style="display: flex; justify-content: between; margin-bottom: 5px;">
                <strong>${escapeHtml(comment.user)}</strong>
                <small style="color: #666; margin-left: auto;">${formatDate(comment.time)}</small>
            </div>
            <div>${escapeHtml(comment.text)}</div>
        </div>
    `).join('');
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #333;">Detail Postingan</h2>
                <button onclick="this.closest('.modal-overlay').remove()" 
                        style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">
                    ×
                </button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                    <span><strong>ID:</strong> ${post.id}</span>
                    <span><strong>User:</strong> ${escapeHtml(post.user)}</span>
                    <span><strong>Tanggal:</strong> ${formatDate(post.date)}</span>
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>Konten:</strong>
                    <p style="margin: 10px 0 0 0; line-height: 1.6;">${escapeHtml(post.content)}</p>
                </div>
                
                ${mediaHTML ? `
                    <div style="margin-bottom: 20px;">
                        <strong>Media:</strong>
                        <div style="margin-top: 10px;">${mediaHTML}</div>
                    </div>
                ` : ''}
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px;">
                    <div style="text-align: center; padding: 15px; background: #e8f5e8; border-radius: 8px;">
                        <div style="font-size: 24px; color: #28a745;">${post.likes || 0}</div>
                        <div style="font-size: 12px; color: #666;">Suka</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #e3f2fd; border-radius: 8px;">
                        <div style="font-size: 24px; color: #2196f3;">${post.comments || 0}</div>
                        <div style="font-size: 12px; color: #666;">Komentar</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #fff3e0; border-radius: 8px;">
                        <div style="font-size: 24px; color: #ff9800;">${post.shares || 0}</div>
                        <div style="font-size: 12px; color: #666;">Bagikan</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #fce4ec; border-radius: 8px;">
                        <div style="font-size: 24px; color: #e91e63;">${post.views || 0}</div>
                        <div style="font-size: 12px; color: #666;">Dilihat</div>
                    </div>
                </div>
                
                ${commentsHTML ? `
                    <div>
                        <strong>Komentar (${post.commentsList.length}):</strong>
                        <div style="margin-top: 10px; max-height: 200px; overflow-y: auto;">
                            ${commentsHTML}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Edit post
function editPost(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    
    // For now, just show an alert. You can implement full edit functionality later.
    alert('Fitur edit akan segera hadir!');
}

// Handle add post
async function handleAddPost(event) {
    event.preventDefault();
    
    const form = event.target;
    const content = form.querySelector('#post-content').value.trim();
    const mediaType = form.querySelector('#media-type').value;
    const mediaUrl = form.querySelector('#media-url').value.trim();
    const mediaTitle = form.querySelector('#media-title').value.trim();
    const mediaArtist = form.querySelector('#media-artist').value.trim();
    
    if (!content) {
        alert('Konten postingan tidak boleh kosong');
        return;
    }
    
    try {
        const postData = {
            user: 'Admin',
            content: content
        };
        
        if (mediaType && mediaUrl) {
            postData.media = {
                type: mediaType,
                url: mediaUrl,
                title: mediaTitle,
                artist: mediaArtist
            };
        }
        
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to add post');
        }
        
        const result = await response.json();
        
        if (result.success) {
            showAdminSuccess('Postingan berhasil ditambahkan');
            form.reset();
            document.getElementById('add-post-modal').style.display = 'none';
            loadAllPosts(true);
        }
        
    } catch (error) {
        console.error('Error adding post:', error);
        showAdminError('Gagal menambahkan postingan');
    }
}

// Clear cache
async function clearCache() {
    try {
        const response = await fetch('/api/clear-cache', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Failed to clear cache');
        }
        
        showAdminSuccess('Cache berhasil dibersihkan');
        loadAllPosts(true);
        
    } catch (error) {
        console.error('Error clearing cache:', error);
        showAdminError('Gagal membersihkan cache');
    }
}

// Export data
function exportData() {
    const dataStr = JSON.stringify(allPosts, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `ceritakita-posts-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

// Show admin success message
function showAdminSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'admin-notification success';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    notification.innerHTML = `
        <i class="fas fa-check-circle"></i> ${message}
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Utility functions
function getMediaIcon(mediaType) {
    switch (mediaType) {
        case 'image': return 'image';
        case 'video': return 'video';
        case 'audio': return 'music';
        default: return 'file';
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export functions for global access
window.viewPostDetails = viewPostDetails;
window.editPost = editPost;
window.deletePost = deletePost;
window.formatDate = formatDate;
window.escapeHtml = escapeHtml;