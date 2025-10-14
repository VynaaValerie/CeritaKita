// Admin dashboard functionality
let adminPosts = [];

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin dashboard initializing...');
    loadAdminData();
});

// Load admin data
async function loadAdminData() {
    try {
        const response = await fetch('/api/posts?refresh=true');
        if (!response.ok) throw new Error('Failed to fetch data');
        
        adminPosts = await response.json();
        renderAdminStats();
        renderAdminTable();
        
    } catch (error) {
        console.error('Error loading admin data:', error);
        alert('Gagal memuat data admin');
    }
}

// Render admin statistics
function renderAdminStats() {
    const statsContainer = document.getElementById('stats-container');
    
    const totalPosts = adminPosts.length;
    const totalLikes = adminPosts.reduce((sum, post) => sum + (post.likes || 0), 0);
    const totalComments = adminPosts.reduce((sum, post) => sum + (post.comments || 0), 0);
    const totalShares = adminPosts.reduce((sum, post) => sum + (post.shares || 0), 0);
    const totalViews = adminPosts.reduce((sum, post) => sum + (post.views || 0), 0);
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${totalPosts}</div>
            <div class="stat-label">Total Postingan</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalLikes}</div>
            <div class="stat-label">Total Likes</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalComments}</div>
            <div class="stat-label">Total Komentar</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalShares}</div>
            <div class="stat-label">Total Shares</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalViews}</div>
            <div class="stat-label">Total Views</div>
        </div>
    `;
}

// Render admin table
function renderAdminTable() {
    const tableBody = document.getElementById('posts-table-body');
    
    if (adminPosts.length === 0) {
        tableBody.innerHTML = `
            <div class="table-row">
                <div class="table-cell" data-label="Status" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    Tidak ada data postingan
                </div>
            </div>
        `;
        return;
    }
    
    tableBody.innerHTML = adminPosts.map(post => `
        <div class="table-row">
            <div class="table-cell" data-label="ID">${post.id}</div>
            <div class="table-cell content-preview" data-label="Konten">${escapeHtml(post.content)}</div>
            <div class="table-cell" data-label="User">${escapeHtml(post.user)}</div>
            <div class="table-cell" data-label="Likes">${post.likes || 0}</div>
            <div class="table-cell" data-label="Comments">${post.comments || 0}</div>
            <div class="table-cell" data-label="Shares">${post.shares || 0}</div>
            <div class="table-cell" data-label="Views">${post.views || 0}</div>
            <div class="table-cell action-cell" data-label="Aksi">
                <i class="fas fa-eye action-icon view" onclick="viewPost('${post.id}')" title="Lihat Post"></i>
                <i class="fas fa-trash action-icon delete" onclick="deletePost('${post.id}')" title="Hapus Post"></i>
            </div>
        </div>
    `).join('');
}

// View post details
function viewPost(postId) {
    const post = adminPosts.find(p => p.id === postId);
    if (!post) return;
    
    const details = `
ID: ${post.id}
User: ${post.user}
Date: ${post.date}
Content: ${post.content}
Likes: ${post.likes || 0}
Comments: ${post.comments || 0}
Shares: ${post.shares || 0}
Views: ${post.views || 0}
Media: ${post.media ? `${post.media.type} - ${post.media.url}` : 'None'}
Comments List: ${JSON.stringify(post.commentsList || [], null, 2)}
    `;
    
    alert(details);
}

// Delete post
async function deletePost(postId) {
    if (!confirm('Apakah Anda yakin ingin menghapus postingan ini?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete post');
        
        // Remove from local array and re-render
        adminPosts = adminPosts.filter(post => post.id !== postId);
        renderAdminStats();
        renderAdminTable();
        
        alert('Postingan berhasil dihapus');
        
    } catch (error) {
        console.error('Error deleting post:', error);
        alert('Gagal menghapus postingan');
    }
}

// Refresh data
function refreshData() {
    loadAdminData();
    alert('Data sedang direfresh...');
}

// Clear cache
async function clearCache() {
    try {
        const response = await fetch('/api/clear-cache', {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to clear cache');
        
        alert('Cache berhasil dibersihkan');
        refreshData();
        
    } catch (error) {
        console.error('Error clearing cache:', error);
        alert('Gagal membersihkan cache');
    }
}

// Export data
function exportData() {
    const dataStr = JSON.stringify(adminPosts, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `egunkari-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

// Show system health
async function showHealth() {
    try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Failed to fetch health data');
        
        const health = await response.json();
        
        const healthInfo = `
Status: ${health.status}
Timestamp: ${health.timestamp}
Cache: 
  - Posts Count: ${health.cache.postsCount}
  - Last Updated: ${health.cache.lastUpdated}
  - Cache Age: ${Math.round(health.cache.cacheAge / 1000)} seconds
Rate Limit:
  - Consecutive Fails: ${health.rateLimit.consecutiveFails}
  - Last Call: ${health.rateLimit.lastCall}
        `;
        
        alert(healthInfo);
        
    } catch (error) {
        console.error('Error fetching health data:', error);
        alert('Gagal mengambil data kesehatan sistem');
    }
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}