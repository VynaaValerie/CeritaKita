// Global variables
let posts = [];
let currentUser = 'CeritaKita';

// DOM elements
const postsContainer = document.getElementById('posts-container');
const loadingElement = document.getElementById('loading');
const scrollTopBtn = document.getElementById('scroll-top');
const mainHeader = document.getElementById('main-header');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('Egunkari app initializing...');
    loadPosts();
    setupEventListeners();
});

// Event listeners
function setupEventListeners() {
    // Scroll to top button
    scrollTopBtn.addEventListener('click', scrollToTop);
    
    // Header collapse on scroll
    window.addEventListener('scroll', handleScroll);
    
    // Refresh on focus (when user returns to tab)
    window.addEventListener('focus', () => {
        console.log('Window focused, refreshing posts...');
        loadPosts(true);
    });
}

// Scroll handling
function handleScroll() {
    const scrollY = window.scrollY;
    
    // Header collapse/expand
    if (scrollY > 100) {
        mainHeader.classList.remove('header-expanded');
        mainHeader.classList.add('header-collapsed');
    } else {
        mainHeader.classList.remove('header-collapsed');
        mainHeader.classList.add('header-expanded');
    }
    
    // Show/hide scroll to top button
    if (scrollY > 300) {
        scrollTopBtn.style.display = 'flex';
    } else {
        scrollTopBtn.style.display = 'none';
    }
}

// Scroll to top function
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Load posts from API
async function loadPosts(forceRefresh = false) {
    try {
        console.log('Loading posts...', { forceRefresh });
        showLoading();
        
        const timestamp = forceRefresh ? `?refresh=true&t=${Date.now()}` : `?t=${Date.now()}`;
        const response = await fetch(`/api/posts${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.length} posts from server`);
        
        posts = data;
        renderPosts();
        hideLoading();
        
    } catch (error) {
        console.error('Error loading posts:', error);
        showError('Gagal memuat postingan. Silakan refresh halaman.');
        hideLoading();
    }
}

// Show loading state
function showLoading() {
    loadingElement.style.display = 'block';
    postsContainer.style.opacity = '0.5';
}

// Hide loading state
function hideLoading() {
    loadingElement.style.display = 'none';
    postsContainer.style.opacity = '1';
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        background: rgba(255, 100, 100, 0.1);
        border: 1px solid rgba(255, 100, 100, 0.3);
        color: #ff6b6b;
        padding: 15px;
        border-radius: 8px;
        margin: 20px 0;
        text-align: center;
    `;
    errorDiv.textContent = message;
    
    postsContainer.innerHTML = '';
    postsContainer.appendChild(errorDiv);
}

// Render posts to the DOM
function renderPosts() {
    console.log('Rendering posts...', posts.length);
    
    if (posts.length === 0) {
        postsContainer.innerHTML = `
            <div class="no-posts">
                <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;"></i>
                <h3>Belum ada postingan</h3>
                <p>Jadilah yang pertama berbagi cerita!</p>
            </div>
        `;
        return;
    }
    
    postsContainer.innerHTML = '';
    
    posts.forEach((post, index) => {
        const postElement = createPostElement(post, index);
        postsContainer.appendChild(postElement);
    });
}

// Create post element
function createPostElement(post, index) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post';
    postDiv.style.animationDelay = `${index * 0.1}s`;
    
    // Format date
    const formattedDate = formatDate(post.date);
    
    // Create media HTML
    const mediaHTML = createMediaHTML(post.media);
    
    // Create stats HTML
    const statsHTML = createStatsHTML(post);
    
    // Create comments HTML
    const commentsHTML = createCommentsHTML(post);
    
    postDiv.innerHTML = `
        <div class="post-header">
            <div class="post-avatar" style="background-image: url('https://files.catbox.moe/eesvtn.jpg')">
                ${!post.media ? post.user.charAt(0).toUpperCase() : ''}
            </div>
            <div class="post-user-info">
                <div class="post-user">${escapeHtml(post.user)}</div>
                <div class="post-date">
                    <i class="far fa-clock"></i>
                    ${formattedDate}
                </div>
            </div>
        </div>
        
        <div class="post-content">${escapeHtml(post.content)}</div>
        
        ${mediaHTML}
        
        ${statsHTML}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post-id="${post.id}">
                <i class="fas fa-heart"></i> Suka
            </button>
            <button class="action-btn comment-btn" data-post-id="${post.id}">
                <i class="fas fa-comment"></i> Komentar
            </button>
            <button class="action-btn share-btn" data-post-id="${post.id}">
                <i class="fas fa-share"></i> Bagikan
            </button>
            <button class="action-btn view-btn" data-post-id="${post.id}">
                <i class="fas fa-eye"></i> Lihat
            </button>
        </div>
        
        ${commentsHTML}
    `;
    
    // Add event listeners to action buttons
    addPostEventListeners(postDiv, post);
    
    return postDiv;
}

// Create media HTML
function createMediaHTML(media) {
    if (!media || !media.type) return '';
    
    switch (media.type) {
        case 'image':
            return `
                <div class="post-media">
                    <img src="${escapeHtml(media.url)}" alt="Post image" class="media-image" 
                         onerror="this.style.display='none'" 
                         onclick="openMediaModal('${escapeHtml(media.url)}', 'image')">
                </div>
            `;
        
        case 'video':
            return `
                <div class="post-media">
                    <video controls class="media-video" poster="https://files.catbox.moe/v3mesu.jpg">
                        <source src="${escapeHtml(media.url)}" type="video/mp4">
                        Browser Anda tidak mendukung video.
                    </video>
                </div>
            `;
        
        case 'audio':
            return `
                <div class="post-media">
                    ${media.title || media.artist ? `
                        <div class="audio-info">
                            ${media.title ? `<div class="audio-title">${escapeHtml(media.title)}</div>` : ''}
                            ${media.artist ? `<div class="audio-artist">${escapeHtml(media.artist)}</div>` : ''}
                        </div>
                    ` : ''}
                    <audio controls class="media-audio">
                        <source src="${escapeHtml(media.url)}" type="audio/mpeg">
                        Browser Anda tidak mendukung audio.
                    </audio>
                </div>
            `;
        
        default:
            return '';
    }
}

// Create stats HTML
function createStatsHTML(post) {
    return `
        <div class="post-stats">
            <span><i class="fas fa-heart"></i> ${post.likes || 0} suka</span>
            <span><i class="fas fa-comment"></i> ${post.comments || 0} komentar</span>
            <span><i class="fas fa-share"></i> ${post.shares || 0} bagikan</span>
            <span><i class="fas fa-eye"></i> ${post.views || 0} dilihat</span>
        </div>
    `;
}

// Create comments HTML
function createCommentsHTML(post) {
    const comments = post.commentsList || [];
    const commentsToShow = comments.slice(0, 3); // Show only first 3 comments
    
    let commentsHTML = commentsToShow.map(comment => `
        <div class="comment">
            <div class="comment-header">
                <span class="comment-user">${escapeHtml(comment.user)}</span>
                <span class="comment-time">${comment.time || 'Baru saja'}</span>
            </div>
            <div class="comment-text">${escapeHtml(comment.text)}</div>
        </div>
    `).join('');
    
    if (comments.length > 3) {
        commentsHTML += `<div class="more-comments" style="text-align: center; color: #a0a7c2; margin: 10px 0;">
            +${comments.length - 3} komentar lainnya
        </div>`;
    }
    
    return `
        <div class="comments-section">
            ${commentsHTML}
            <form class="comment-form" data-post-id="${post.id}">
                <input type="text" class="comment-input" placeholder="Tulis komentar..." required>
                <button type="submit" class="comment-submit">Kirim</button>
            </form>
        </div>
    `;
}

// Add event listeners to post elements
function addPostEventListeners(postElement, post) {
    // Like button
    const likeBtn = postElement.querySelector('.like-btn');
    likeBtn.addEventListener('click', () => handleLike(post.id));
    
    // Share button
    const shareBtn = postElement.querySelector('.share-btn');
    shareBtn.addEventListener('click', () => handleShare(post.id));
    
    // View button
    const viewBtn = postElement.querySelector('.view-btn');
    viewBtn.addEventListener('click', () => handleView(post.id));
    
    // Comment form
    const commentForm = postElement.querySelector('.comment-form');
    commentForm.addEventListener('submit', (e) => handleComment(e, post.id));
    
    // Comment button (toggle comments)
    const commentBtn = postElement.querySelector('.comment-btn');
    const commentsSection = postElement.querySelector('.comments-section');
    commentBtn.addEventListener('click', () => {
        commentsSection.style.display = commentsSection.style.display === 'none' ? 'block' : 'none';
    });
}

// Handle like action
async function handleLike(postId) {
    try {
        console.log('Liking post:', postId);
        
        // Optimistic update
        updatePostUI(postId, 'like');
        
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'like'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to like post');
        }
        
        console.log('Post liked successfully');
        
    } catch (error) {
        console.error('Error liking post:', error);
        // Rollback optimistic update if needed
        updatePostUI(postId, 'like', true);
    }
}

// Handle share action
async function handleShare(postId) {
    try {
        console.log('Sharing post:', postId);
        
        // Optimistic update
        updatePostUI(postId, 'share');
        
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'share'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to share post');
        }
        
        console.log('Post shared successfully');
        
        // Show share options
        showShareOptions(postId);
        
    } catch (error) {
        console.error('Error sharing post:', error);
        updatePostUI(postId, 'share', true);
    }
}

// Handle view action
async function handleView(postId) {
    try {
        console.log('Viewing post:', postId);
        
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'view'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to record view');
        }
        
        console.log('View recorded successfully');
        
    } catch (error) {
        console.error('Error recording view:', error);
    }
}

// Handle comment submission
async function handleComment(event, postId) {
    event.preventDefault();
    
    const form = event.target;
    const input = form.querySelector('.comment-input');
    const commentText = input.value.trim();
    
    if (!commentText) return;
    
    try {
        console.log('Adding comment to post:', postId);
        
        // Optimistic update
        const tempComment = {
            user: currentUser,
            text: commentText,
            time: 'Baru saja',
            likes: 0
        };
        updatePostUI(postId, 'comment', false, tempComment);
        
        // Clear input
        input.value = '';
        
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'comment',
                comment: commentText,
                userId: currentUser
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to add comment');
        }
        
        console.log('Comment added successfully');
        
    } catch (error) {
        console.error('Error adding comment:', error);
        // In a real app, you might want to show the comment again in the input
        input.value = commentText;
    }
}

// Update post UI optimistically
function updatePostUI(postId, action, rollback = false, commentData = null) {
    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    
    const post = posts[postIndex];
    const postElement = document.querySelector(`[data-post-id="${postId}"]`)?.closest('.post');
    
    if (!postElement) return;
    
    switch (action) {
        case 'like':
            if (rollback) {
                post.likes = Math.max(0, (post.likes || 0) - 1);
            } else {
                post.likes = (post.likes || 0) + 1;
            }
            updatePostStats(postElement, post);
            break;
            
        case 'share':
            if (rollback) {
                post.shares = Math.max(0, (post.shares || 0) - 1);
            } else {
                post.shares = (post.shares || 0) + 1;
            }
            updatePostStats(postElement, post);
            break;
            
        case 'comment':
            if (rollback) {
                post.comments = Math.max(0, (post.comments || 0) - 1);
                if (commentData && post.commentsList) {
                    post.commentsList = post.commentsList.filter(c => c !== commentData);
                }
            } else {
                post.comments = (post.comments || 0) + 1;
                if (commentData) {
                    if (!post.commentsList) post.commentsList = [];
                    post.commentsList.unshift(commentData);
                }
            }
            updatePostStats(postElement, post);
            if (!rollback && commentData) {
                updateCommentsUI(postElement, post);
            }
            break;
    }
}

// Update post stats in UI
function updatePostStats(postElement, post) {
    const statsElement = postElement.querySelector('.post-stats');
    if (statsElement) {
        statsElement.innerHTML = `
            <span><i class="fas fa-heart"></i> ${post.likes || 0} suka</span>
            <span><i class="fas fa-comment"></i> ${post.comments || 0} komentar</span>
            <span><i class="fas fa-share"></i> ${post.shares || 0} bagikan</span>
            <span><i class="fas fa-eye"></i> ${post.views || 0} dilihat</span>
        `;
    }
}

// Update comments in UI
function updateCommentsUI(postElement, post) {
    const commentsSection = postElement.querySelector('.comments-section');
    if (commentsSection) {
        const commentsHTML = createCommentsHTML(post);
        const oldForm = commentsSection.querySelector('.comment-form');
        commentsSection.innerHTML = commentsHTML;
        commentsSection.appendChild(oldForm);
        
        // Re-add event listener to the new form
        const newForm = commentsSection.querySelector('.comment-form');
        newForm.addEventListener('submit', (e) => handleComment(e, post.id));
    }
}

// Show share options
function showShareOptions(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    const shareUrl = window.location.href;
    const shareText = `Lihat postingan ini di Egunkari: ${post.content.substring(0, 100)}...`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Egunkari',
            text: shareText,
            url: shareUrl,
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('Link berhasil disalin ke clipboard!');
        });
    }
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'Baru saja';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return dateString; // Return original if invalid date
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays < 7) return `${diffDays} hari lalu`;
    
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Escape HTML to prevent XSS
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

// Media modal (for image zoom)
function openMediaModal(url, type) {
    if (type !== 'image') return;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: zoom-out;
    `;
    
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: 8px;
    `;
    
    modal.appendChild(img);
    modal.addEventListener('click', () => document.body.removeChild(modal));
    
    document.body.appendChild(modal);
}

// Auto-refresh posts every 30 seconds
setInterval(() => {
    console.log('Auto-refreshing posts...');
    loadPosts(true);
}, 30000);

// Export for global access
window.openMediaModal = openMediaModal;