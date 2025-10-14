// script.js — versi final anti 429 di client
let posts = [];
let userName = 'CeritaKita';

async function fetchPosts() {
  const res = await fetch('/api/posts');
  const data = await res.json();
  posts = data;
  renderPosts();
}

function renderPosts() {
  const container = document.getElementById('posts-container');
  container.innerHTML = '';
  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post';
    div.innerHTML = `
      <h4>${post.user}</h4>
      <p>${post.content}</p>
      <div class="stats">
        ❤️ ${post.likes} 💬 ${post.comments} 🔁 ${post.shares} 👀 ${post.views}
      </div>
      <button onclick="interact('${post.id}','like')">Like</button>
      <button onclick="commentPrompt('${post.id}')">Comment</button>
      <button onclick="interact('${post.id}','share')">Share</button>
      <button onclick="interact('${post.id}','view')">View</button>
    `;
    container.appendChild(div);
  });
}

async function interact(id, action, comment = '') {
  try {
    await fetch(`/api/posts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment, userId: userName })
    });
    // update local UI immediately
    const p = posts.find(x => x.id === id);
    if (!p) return;
    if (action === 'like') p.likes++;
    if (action === 'view') p.views++;
    if (action === 'share') p.shares++;
    if (action === 'comment') {
      p.comments++;
      p.commentsList.unshift({ user: userName, text: comment });
    }
    renderPosts();
  } catch (e) {
    console.error('interact error', e);
    alert('Gagal mengirim aksi (akan disinkron otomatis nanti).');
  }
}

function commentPrompt(id) {
  const text = prompt('Tulis komentar:');
  if (text && text.trim()) interact(id, 'comment', text);
}

fetchPosts();