const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Load configuration
const config = require('./set.json');

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: {
    type: 'service_account',
    project_id: config.GOOGLE_PROJECT_ID,
    private_key_id: config.GOOGLE_PRIVATE_KEY_ID,
    private_key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: config.GOOGLE_CLIENT_EMAIL,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = config.GOOGLE_SHEET_ID;

// Enhanced Cache system dengan local file backup
const CACHE_FILE = './posts-cache.json';
let postsCache = {
  data: [],
  lastUpdated: 0,
  ttl: 60000 // 60 seconds cache - lebih lama
};

// Load cache from file jika ada
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      postsCache = { ...postsCache, ...cacheData };
      console.log('Cache loaded from file:', postsCache.data.length, 'posts');
    }
  } catch (error) {
    console.log('No cache file found or error loading cache');
  }
}

// Save cache to file
function saveCacheToFile() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(postsCache, null, 2));
    console.log('Cache saved to file');
  } catch (error) {
    console.error('Error saving cache to file:', error);
  }
}

// Rate limiting yang lebih ketat
const rateLimit = {
  lastCall: 0,
  minInterval: 5000, // 5 seconds minimum between API calls
  consecutiveFails: 0,
  maxConsecutiveFails: 3
};

function canMakeAPICall() {
  const now = Date.now();
  const timeSinceLastCall = now - rateLimit.lastCall;
  
  // Jika terlalu banyak gagal berturut-turut, tunggu lebih lama
  if (rateLimit.consecutiveFails >= rateLimit.maxConsecutiveFails) {
    const backoffTime = Math.min(30000, rateLimit.consecutiveFails * 10000); // Max 30 seconds
    if (timeSinceLastCall < backoffTime) {
      console.log(`In backoff mode. Waiting ${backoffTime - timeSinceLastCall}ms more`);
      return false;
    }
  }
  
  if (timeSinceLastCall > rateLimit.minInterval) {
    rateLimit.lastCall = now;
    return true;
  }
  
  console.log(`Rate limit hit. Waiting ${rateLimit.minInterval - timeSinceLastCall}ms more`);
  return false;
}

function recordAPISuccess() {
  rateLimit.consecutiveFails = 0;
}

function recordAPIFailure() {
  rateLimit.consecutiveFails++;
  console.log(`Consecutive API failures: ${rateLimit.consecutiveFails}`);
}

// Initialize Sheets dengan cache loading
async function initSheets() {
  try {
    console.log('Memulai inisialisasi database...');
    loadCacheFromFile(); // Load cache dari file saat startup
    
    // Check if sheet exists
    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      });
      
      console.log('Spreadsheet ditemukan:', response.data.properties.title);
      
      // Check if "CeritaKita" sheet exists
      const sheetExists = response.data.sheets.some(sheet => 
        sheet.properties.title === 'CeritaKita'
      );
      
      if (!sheetExists) {
        console.log('Membuat sheet "CeritaKita"...');
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: 'CeritaKita'
                  }
                }
              }
            ]
          }
        });
        
        // Add headers
        const headers = [
          ['ID', 'User', 'Date', 'Content', 'Media Type', 'Media URL', 'Title', 'Artist', 'Likes', 'Comments', 'Shares', 'Views', 'Comments List']
        ];

        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'CeritaKita!A1:M1',
          valueInputOption: 'RAW',
          resource: { values: headers },
        });
        console.log('Header berhasil ditambahkan');
        
        // Add sample data after creating sheet
        console.log('Menambahkan data sample...');
        const samplePosts = [
          ['1', 'CeritaKita', 'Hari ini', 'aku suka lagu ini', 'audio', 'https://files.catbox.moe/6xqtep.mp3', 'Lagu Favorit', 'Artis Terbaik', '12', '3', '5', '127', '[]'],
          ['2', 'CeritaKita', 'Kemarin', 'bersama dia', 'image', 'https://files.catbox.moe/v3mesu.jpg', '', '', '24', '7', '2', '189', '[]'],
          ['3', 'CeritaKita', '2 hari lalu', 'Vidio bersama dia', 'video', 'https://files.catbox.moe/hexrhy.mp4', '', '', '42', '15', '8', '356', '[]'],
          ['4', 'CeritaKita', '3 hari lalu', 'Hari ini aku cukup bahagia, tapi hari ini juga aku ngerasa sedih. Untuk kesekian kalinya aku dipaksakan untuk bersabar kembali...', '', '', '', '', '56', '22', '12', '421', '[]']
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'CeritaKita!A2:M',
          valueInputOption: 'RAW',
          resource: { values: samplePosts },
        });
        console.log('Data sample berhasil ditambahkan');
        
        // Update cache dengan data baru
        postsCache.data = samplePosts.map((row, index) => ({
          id: row[0],
          user: row[1],
          date: row[2],
          content: row[3],
          media: row[4] ? {
            type: row[4],
            url: row[5],
            title: row[6] || '',
            artist: row[7] || ''
          } : null,
          likes: parseInt(row[8]) || 0,
          comments: parseInt(row[9]) || 0,
          shares: parseInt(row[10]) || 0,
          views: parseInt(row[11]) || 0,
          commentsList: safeJsonParse(row[12] || '[]')
        }));
        postsCache.lastUpdated = Date.now();
        saveCacheToFile();
        
      } else {
        console.log('Sheet "CeritaKita" sudah ada');
        
        // Load initial data ke cache
        await getAllPosts(true);
      }
      
    } catch (error) {
      console.error('Error mengakses spreadsheet:', error.message);
      // Tetap lanjut dengan cache yang ada
      console.log('Continuing with cached data...');
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    console.error('Full error:', error);
  }
}

// Helper function to get all posts dengan enhanced caching
async function getAllPosts(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached data if still valid (dan jangan force refresh jika sedang rate limited)
  if (!forceRefresh && postsCache.data.length > 0 && (now - postsCache.lastUpdated < postsCache.ttl)) {
    console.log('Returning cached posts data');
    return postsCache.data;
  }

  // Rate limiting yang lebih ketat
  if (!canMakeAPICall() && !forceRefresh) {
    console.log('Rate limit hit, returning cached data');
    return postsCache.data.length > 0 ? postsCache.data : [];
  }

  try {
    console.log('Fetching fresh data from Google Sheets...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'CeritaKita!A2:M',
    });

    console.log('Raw data from sheets:', response.data.values);

    if (!response.data.values) {
      postsCache.data = [];
      postsCache.lastUpdated = now;
      saveCacheToFile();
      recordAPISuccess();
      return [];
    }

    const posts = response.data.values.map(row => {
      // Ensure row has at least 13 columns
      const fullRow = [...row, ...Array(13 - row.length).fill('')];
      
      return {
        id: fullRow[0] || '',
        user: fullRow[1] || 'CeritaKita',
        date: fullRow[2] || 'Baru saja',
        content: fullRow[3] || '',
        media: fullRow[4] ? {
          type: fullRow[4],
          url: fullRow[5] || '',
          title: fullRow[6] || '',
          artist: fullRow[7] || ''
        } : null,
        likes: parseInt(fullRow[8]) || 0,
        comments: parseInt(fullRow[9]) || 0,
        shares: parseInt(fullRow[10]) || 0,
        views: parseInt(fullRow[11]) || 0,
        commentsList: safeJsonParse(fullRow[12] || '[]')
      };
    });

    console.log(`Processed ${posts.length} posts`);
    
    // Update cache
    postsCache.data = posts;
    postsCache.lastUpdated = now;
    saveCacheToFile();
    recordAPISuccess();
    
    return posts;
  } catch (error) {
    console.error('Error getting posts:', error);
    recordAPIFailure();
    
    // Return cached data if available, even if stale
    if (postsCache.data.length > 0) {
      console.log('Returning stale cached data due to error');
      return postsCache.data;
    }
    
    return [];
  }
}

// Safe JSON parse function
function safeJsonParse(str) {
  try {
    if (!str || str === '[]') return [];
    return JSON.parse(str);
  } catch (error) {
    console.error('JSON parse error:', error, 'String:', str);
    return [];
  }
}

// Invalidate cache
function invalidateCache() {
  postsCache.lastUpdated = 0;
  console.log('Cache invalidated');
}

// Update post data in cache (untuk interaksi seperti like, comment, dll)
function updatePostInCache(postId, updates) {
  const postIndex = postsCache.data.findIndex(post => post.id === postId);
  if (postIndex !== -1) {
    postsCache.data[postIndex] = { ...postsCache.data[postIndex], ...updates };
    postsCache.lastUpdated = Date.now(); // Tetap update timestamp untuk consistency
    saveCacheToFile();
    console.log(`Post ${postId} updated in cache`);
    return true;
  }
  return false;
}

// API Routes

// Get all posts
app.get('/api/posts', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    console.log('Mengambil semua posts...', { forceRefresh });
    
    const posts = await getAllPosts(forceRefresh);
    console.log(`Berhasil mengambil ${posts.length} posts`);
    
    res.json(posts);
  } catch (error) {
    console.error('Error in /api/posts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new post
app.post('/api/posts', async (req, res) => {
  try {
    console.log('Menerima request POST baru:', req.body);
    const { user, content, media } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const newPostId = Date.now().toString();
    const newPost = [
      newPostId,
      user || 'CeritaKita',
      'Baru saja',
      content,
      media?.type || '',
      media?.url || '',
      media?.title || '',
      media?.artist || '',
      '0', '0', '0', '0', '[]'
    ];

    console.log('Menambahkan post baru:', newPost);

    // Optimistic update - tambahkan ke cache dulu
    const cachePost = {
      id: newPostId,
      user: user || 'CeritaKita',
      date: 'Baru saja',
      content: content,
      media: media?.type ? {
        type: media.type,
        url: media.url || '',
        title: media.title || '',
        artist: media.artist || ''
      } : null,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      commentsList: []
    };
    
    postsCache.data.unshift(cachePost); // Tambahkan di awal (newest first)
    postsCache.lastUpdated = Date.now();
    saveCacheToFile();

    // Kemudian sync ke Google Sheets (tapi jangan block response)
    setTimeout(async () => {
      try {
        if (canMakeAPICall()) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'CeritaKita!A2:M',
            valueInputOption: 'RAW',
            resource: { values: [newPost] },
          });
          console.log('Post berhasil disinkronisasi ke Google Sheets');
          recordAPISuccess();
        } else {
          console.log('Skipping Google Sheets sync due to rate limit');
        }
      } catch (error) {
        console.error('Error syncing to Google Sheets:', error);
        recordAPIFailure();
        // Tetap lanjut, data sudah ada di cache
      }
    }, 0);

    console.log('Post berhasil ditambahkan (cached)');
    res.json({ success: true, id: newPostId });
  } catch (error) {
    console.error('Error adding post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update post interactions - OPTIMISTIC UPDATES
app.put('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment, userId } = req.body;

    console.log(`Update post ${id}:`, { action, comment, userId });

    // Cari post di cache
    const postIndex = postsCache.data.findIndex(post => post.id === id);
    if (postIndex === -1) {
      console.log(`Post ${id} tidak ditemukan di cache`);
      return res.status(404).json({ error: 'Post not found' });
    }

    const currentPost = postsCache.data[postIndex];
    let updates = {};

    // Optimistic update di cache
    switch (action) {
      case 'like':
        updates.likes = (currentPost.likes || 0) + 1;
        console.log(`Post ${id} dilike (cached): ${updates.likes} likes`);
        break;
      case 'view':
        updates.views = (currentPost.views || 0) + 1;
        console.log(`Post ${id} ditambah view (cached): ${updates.views} views`);
        break;
      case 'share':
        updates.shares = (currentPost.shares || 0) + 1;
        console.log(`Post ${id} dishare (cached): ${updates.shares} shares`);
        break;
      case 'comment':
        const comments = [...(currentPost.commentsList || [])];
        comments.unshift({
          user: userId || 'Anonymous',
          text: comment,
          time: 'Baru saja',
          likes: 0
        });
        updates.commentsList = comments;
        updates.comments = (currentPost.comments || 0) + 1;
        console.log(`Post ${id} ditambah komentar (cached): ${updates.comments} comments`);
        break;
    }

    // Apply updates to cache
    postsCache.data[postIndex] = { ...currentPost, ...updates };
    postsCache.lastUpdated = Date.now();
    saveCacheToFile();

    // Sync ke Google Sheets di background (non-blocking)
    setTimeout(async () => {
      try {
        if (canMakeAPICall()) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'CeritaKita!A2:M',
          });

          const rows = response.data.values || [];
          const rowIndex = rows.findIndex(row => row[0] === id);

          if (rowIndex !== -1) {
            const row = rows[rowIndex];
            let sheetUpdated = false;

            switch (action) {
              case 'like':
                row[8] = (parseInt(row[8]) + 1).toString();
                sheetUpdated = true;
                break;
              case 'view':
                row[11] = (parseInt(row[11]) + 1).toString();
                sheetUpdated = true;
                break;
              case 'share':
                row[10] = (parseInt(row[10]) + 1).toString();
                sheetUpdated = true;
                break;
              case 'comment':
                const sheetComments = safeJsonParse(row[12] || '[]');
                sheetComments.unshift({
                  user: userId || 'Anonymous',
                  text: comment,
                  time: 'Baru saja',
                  likes: 0
                });
                row[12] = JSON.stringify(sheetComments);
                row[9] = (parseInt(row[9]) + 1).toString();
                sheetUpdated = true;
                break;
            }

            if (sheetUpdated) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `CeritaKita!A${rowIndex + 2}:M${rowIndex + 2}`,
                valueInputOption: 'RAW',
                resource: { values: [row] },
              });
              console.log(`Post ${id} berhasil diupdate di Google Sheets`);
              recordAPISuccess();
            }
          }
        } else {
          console.log('Skipping Google Sheets sync due to rate limit');
        }
      } catch (error) {
        console.error('Error syncing to Google Sheets:', error);
        recordAPIFailure();
        // Tetap lanjut, data sudah diupdate di cache
      }
    }, 0);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete post
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Menghapus post ${id}`);

    // Optimistic delete dari cache
    const postIndex = postsCache.data.findIndex(post => post.id === id);
    if (postIndex === -1) {
      console.log(`Post ${id} tidak ditemukan di cache`);
      return res.status(404).json({ error: 'Post not found' });
    }

    // Hapus dari cache
    postsCache.data.splice(postIndex, 1);
    postsCache.lastUpdated = Date.now();
    saveCacheToFile();

    // Sync delete ke Google Sheets di background
    setTimeout(async () => {
      try {
        if (canMakeAPICall()) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'CeritaKita!A2:M',
          });

          const rows = response.data.values || [];
          const rowIndex = rows.findIndex(row => row[0] === id);

          if (rowIndex !== -1) {
            await sheets.spreadsheets.values.clear({
              spreadsheetId: SPREADSHEET_ID,
              range: `CeritaKita!A${rowIndex + 2}:M${rowIndex + 2}`,
            });
            console.log(`Post ${id} berhasil dihapus dari Google Sheets`);
            recordAPISuccess();
          }
        } else {
          console.log('Skipping Google Sheets sync due to rate limit');
        }
      } catch (error) {
        console.error('Error syncing delete to Google Sheets:', error);
        recordAPIFailure();
      }
    }, 0);

    console.log(`Post ${id} berhasil dihapus (cached)`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: error.message });
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dbadmin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    cache: {
      postsCount: postsCache.data.length,
      lastUpdated: new Date(postsCache.lastUpdated).toISOString(),
      cacheAge: Date.now() - postsCache.lastUpdated
    },
    rateLimit: {
      consecutiveFails: rateLimit.consecutiveFails,
      lastCall: new Date(rateLimit.lastCall).toISOString()
    }
  });
});

// Clear cache endpoint (for debugging)
app.post('/api/clear-cache', (req, res) => {
  invalidateCache();
  res.json({ success: true, message: 'Cache cleared' });
});

// Initialize and start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initSheets();
});