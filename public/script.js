/* SCRIPT BY © VYNAA VALERIE */
/* Jangan hapus credits ini ya sayang ❤️ */

class EgunkariApp {
    constructor() {
        this.posts = [];
        this.currentUser = 'CeritaKita';
        this.isLoading = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadPosts();
        this.setupScrollEffects();
    }

    setupEventListeners() {
        // Scroll to top button
        document.getElementById('scroll-top').addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Header scroll effect
        window.addEventListener('scroll', this.handleScroll.bind(this));
    }

    setupScrollEffects() {
        // Intersection Observer for fade-in animations
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animationDelay = `${entry.target.dataset.delay || 0}ms`;
                    entry.target.classList.add('fade-in-visible');
                }
            });
        }, { threshold: 0.1 });

        // Observe posts when they're added
        this.postObserver = observer;
    }

    handleScroll() {
        const header = document.getElementById('main-header');
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > 100) {
            header.classList.remove('header-expanded');
            header.classList.add('header-collapsed');
        } else {
            header.classList.remove('header-collapsed');
            header.classList.add('header-expanded');
        }

        // Show/hide scroll to top button
        const scrollBtn = document.getElementById('scroll-top');
        if (scrollTop > 300) {
            scrollBtn.style.display = 'flex';
        } else {
            scrollBtn.style.display = 'none';
        }
    }

    async loadPosts() {
        this.showLoading(true);
        try {
            const response = await fetch('/api/posts');
            if (!response.ok) throw new Error('Failed to fetch posts');
            
            this.posts = await response.json();
            this.renderPosts();
        } catch (error) {
            console.error('Error loading posts:', error);
            this.showError('Gagal memuat postingan');
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        loading.style.display = show ? 'block' : 'none';
        this.isLoading = show;
    }

    showError(message) {
        // Simple error notification
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4757;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 300px;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            document.body.removeChild(errorDiv);
        }, 5000);
    }

    renderPosts() {
        const container = document.getElementById('posts-container');
        
        if (this.posts.length === 0) {
            container.innerHTML = `
                <div class="post" style="text-align: center; padding: 60px 20px;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--gray); margin-bottom: 20px;"></i>
                    <h3 style="color: var(--gray); margin-bottom: 10px;">Belum ada postingan</h3>
                    <p style="color: var(--gray-dark);">Jadilah yang pertama berbagi cerita!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.posts.map((post, index) => this.createPostHTML(post, index)).join('');
        
        // Add observers to new posts
        document.querySelectorAll('.post').forEach(post => {
            this.postObserver.observe(post);
        });
    }

    createPostHTML(post, index) {
        const delay = index * 100;
        const mediaHTML = this.createMediaHTML(post.media);
        const commentsHTML = this.createCommentsHTML(post.commentsList);
        
        return `
            <div class="post" data-delay="${delay}" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar" style="background-image: url('https://files.catbox.moe/eesvtn.jpg')">
                        ${!post.avatar ? post.user.charAt(0).toUpperCase() : ''}
                    </div>
                    <div class="post-user-info">
                        <div class="post-user">${this.escapeHtml(post.user)}</div>
                        <div class="post-date">
                            <i class="far fa-clock"></i>
                            ${this.formatDate(post.date)}
                        </div>
                    </div>
                </div>
                
                <div class="post-content">${this.formatContent(post.content)}</div>
                
                ${mediaHTML}
                
                <div class="post-stats">
                    <span><i class="fas fa-heart"></i> ${post.likes || 0} suka</span>
                    <span><i class="fas fa-comment"></i> ${post.comments || 0} komentar</span>
                    <span><i class="fas fa-share"></i> ${post.shares || 0} bagikan</span>
                    <span><i class="fas fa-eye"></i> ${post.views || 0} dilihat</span>
                </div>
                
                <div class="post-actions">
                    <button class="action-btn like-btn ${post.liked ? 'liked' : ''}" 
                            onclick="app.handleLike('${post.id}')">
                        <i class="fas fa-heart"></i> Suka
                    </button>
                    <button class="action-btn comment-btn" 
                            onclick="app.toggleComments('${post.id}')">
                        <i class="fas fa-comment"></i> Komentar
                    </button>
                    <button class="action-btn share-btn" 
                            onclick="app.handleShare('${post.id}')">
                        <i class="fas fa-share"></i> Bagikan
                    </button>
                    <button class="action-btn view-btn" 
                            onclick="app.handleView('${post.id}')">
                        <i class="fas fa-eye"></i> Lihat
                    </button>
                </div>
                
                <div class="comments-section" id="comments-${post.id}" style="display: none;">
                    ${commentsHTML}
                    <form class="comment-form" onsubmit="app.handleComment(event, '${post.id}')">
                        <input type="text" class="comment-input" placeholder="Tulis komentar..." required>
                        <button type="submit" class="comment-submit">Kirim</button>
                    </form>
                </div>
            </div>
        `;
    }

    createMediaHTML(media) {
        if (!media || !media.type) return '';
        
        switch (media.type) {
            case 'image':
                return `
                    <div class="post-media">
                        <img src="${this.escapeHtml(media.url)}" alt="Post image" class="media-image" 
                             onerror="this.style.display='none'">
                    </div>
                `;
            case 'video':
                return `
                    <div class="post-media">
                        <video src="${this.escapeHtml(media.url)}" controls class="media-video"></video>
                    </div>
                `;
            case 'audio':
                return `
                    <div class="post-media">
                        <div class="audio-info">
                            <div class="audio-title">${this.escapeHtml(media.title || 'Audio')}</div>
                            <div class="audio-artist">${this.escapeHtml(media.artist || 'Unknown')}</div>
                        </div>
                        <audio src="${this.escapeHtml(media.url)}" controls class="media-audio"></audio>
                    </div>
                `;
            default:
                return '';
        }
    }

    createCommentsHTML(commentsList) {
        if (!commentsList || !Array.isArray(commentsList) || commentsList.length === 0) {
            return '<p style="color: var(--gray); text-align: center; padding: 20px;">Belum ada komentar</p>';
        }
        
        return commentsList.map(comment => `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-user">${this.escapeHtml(comment.user)}</span>
                    <span class="comment-time">${this.formatDate(comment.time)}</span>
                </div>
                <div class="comment-text">${this.escapeHtml(comment.text)}</div>
            </div>
        `).join('');
    }

    async handleLike(postId) {
        try {
            const response = await fetch(`/api/posts/${postId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'like' })
            });

            if (response.ok) {
                this.updatePostStats(postId, 'likes');
                this.animateButton(postId, 'like');
            }
        } catch (error) {
            console.error('Error liking post:', error);
        }
    }

    async handleView(postId) {
        try {
            await fetch(`/api/posts/${postId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'view' })
            });
            
            this.updatePostStats(postId, 'views');
        } catch (error) {
            console.error('Error viewing post:', error);
        }
    }

    async handleShare(postId) {
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Egunkari',
                    text: 'Lihat postingan menarik ini!',
                    url: window.location.href
                });
            }
            
            await fetch(`/api/posts/${postId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'share' })
            });
            
            this.updatePostStats(postId, 'shares');
            this.animateButton(postId, 'share');
        } catch (error) {
            console.error('Error sharing post:', error);
        }
    }

    async handleComment(event, postId) {
        event.preventDefault();
        const input = event.target.querySelector('.comment-input');
        const commentText = input.value.trim();
        
        if (!commentText) return;
        
        try {
            const response = await fetch(`/api/posts/${postId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'comment', 
                    comment: commentText,
                    userId: this.currentUser
                })
            });

            if (response.ok) {
                input.value = '';
                this.updatePostStats(postId, 'comments');
                this.addNewComment(postId, commentText);
                this.animateButton(postId, 'comment');
            }
        } catch (error) {
            console.error('Error posting comment:', error);
        }
    }

    updatePostStats(postId, statType) {
        const postElement = document.querySelector(`[data-post-id="${postId}"]`);
        if (!postElement) return;
        
        const statElement = postElement.querySelector(`.post-stats`);
        if (!statElement) return;
        
        // Update the specific stat
        const post = this.posts.find(p => p.id === postId);
        if (post) {
            post[statType] = (post[statType] || 0) + 1;
            this.renderPosts(); // Re-render to update all stats
        }
    }

    addNewComment(postId, commentText) {
        const post = this.posts.find(p => p.id === postId);
        if (!post) return;
        
        if (!post.commentsList) {
            post.commentsList = [];
        }
        
        const newComment = {
            user: this.currentUser,
            text: commentText,
            time: 'Baru saja',
            likes: 0
        };
        
        post.commentsList.unshift(newComment);
        this.renderPosts();
        
        // Keep comments section open
        this.toggleComments(postId, true);
    }

    toggleComments(postId, forceOpen = false) {
        const commentsSection = document.getElementById(`comments-${postId}`);
        if (!commentsSection) return;
        
        const isVisible = commentsSection.style.display !== 'none';
        
        if (forceOpen) {
            commentsSection.style.display = 'block';
        } else {
            commentsSection.style.display = isVisible ? 'none' : 'block';
        }
        
        if (commentsSection.style.display === 'block') {
            commentsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    animateButton(postId, action) {
        const button = document.querySelector(`[data-post-id="${postId}"] .${action}-btn`);
        if (button) {
            button.style.transform = 'scale(1.1)';
            setTimeout(() => {
                button.style.transform = '';
            }, 300);
        }
    }

    formatContent(content) {
        if (!content) return '';
        
        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return this.escapeHtml(content)
            .replace(urlRegex, '<a href="$1" target="_blank" rel="noopener" style="color: var(--accent);">$1</a>')
            .replace(/\n/g, '<br>');
    }

    formatDate(dateString) {
        if (!dateString) return 'Baru saja';
        
        // For "Baru saja" or similar
        if (dateString.toLowerCase().includes('baru') || dateString.toLowerCase().includes('just')) {
            return 'Baru saja';
        }
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            
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
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateString;
        }
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new EgunkariApp();
});

// Add CSS for fade-in animation
const style = document.createElement('style');
style.textContent = `
    .post {
        opacity: 0;
        transform: translateY(30px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }
    
    .post.fade-in-visible {
        opacity: 1;
        transform: translateY(0);
    }
`;
document.head.appendChild(style);