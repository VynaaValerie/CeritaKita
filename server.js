/* SCRIPT BY © VYNAA VALERIE */
/* Jangan hapus credits ini ya sayang ❤️ */

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

// Enhanced Cache system
const CACHE_FILE = './posts-cache.json';
let postsCache = {
  data: [],
  lastUpdated: 0,
  ttl: 60000
};

// ====== CACHE HANDLER ======
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      postsCache = { ...postsCache, ...cacheData };
      console.log('Cache loaded from file:', postsCache.data.length, 'posts');
    }
  } catch {
    console.log('No cache file found or error loading cache');
  }
}

function saveCacheToFile() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(postsCache, null, 2));
  } catch (error) {
    console.error('Error saving cache to file:', error);
  }
}

// ====== RATE LIMIT SYSTEM ======
let rateLimit = {
  lastCall: 0,
  minInterval: 5000,
  consecutiveFails: 0,
  maxConsecutiveFails: 3
};

function canMakeAPICall() {
  const now = Date.now();
  const timeSinceLastCall = now - rateLimit.lastCall;

  if (rateLimit.consecutiveFails >= rateLimit.maxConsecutiveFails) {
    const backoffTime = Math.min(30000, rateLimit.consecutiveFails * 10000);
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

// ====== UTILITIES ======
function safeJsonParse(str) {
  try {
    return JSON.parse(str || '[]');
  } catch {
    return [];
  }
}

function invalidateCache() {
  postsCache.lastUpdated = 0;
  console.log('Cache invalidated');
}

// ====== GOOGLE SHEETS INITIALIZATION ======
async function initSheets() {
  try {
    console.log('Initializing database...');
    loadCacheFromFile();

    const response = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log('Spreadsheet found:', response.data.properties.title);

    const sheetExists = response.data.sheets.some(s => s.properties.title === 'CeritaKita');

    if (!sheetExists) {
      console.log('Creating new sheet "CeritaKita"...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: 'CeritaKita' } } }]
        }
      });

      const headers = [
        ['ID', 'User', 'Date', 'Content', 'Media Type', 'Media URL', 'Title', 'Artist', 'Likes', 'Comments', 'Shares', 'Views', 'Comments List']
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'CeritaKita!A1:M1',
        valueInputOption: 'RAW',
        resource: { values: headers },
      });

      console.log('Headers added successfully.');
    }

    await getAllPosts(true);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing Sheets:', error.message);
  }
}

// ====== GET ALL POSTS ======
async function getAllPosts(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && postsCache.data.length > 0 && (now - postsCache.lastUpdated < postsCache.ttl)) {
    console.log('Returning cached data');
    return postsCache.data;
  }

  if (!canMakeAPICall()) {
    console.log('Rate limit hit, returning cache');
    return postsCache.data;
  }

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'CeritaKita!A2:M',
    });

    const posts = (response.data.values || []).map(row => {
      const fullRow = [...row, ...Array(13 - row.length).fill('')];
      return {
        id: fullRow[0],
        user: fullRow[1],
        date: fullRow[2],
        content: fullRow[3],
        media: fullRow[4]
          ? { type: fullRow[4], url: fullRow[5], title: fullRow[6], artist: fullRow[7] }
          : null,
        likes: parseInt(fullRow[8]) || 0,
        comments: parseInt(fullRow[9]) || 0,
        shares: parseInt(fullRow[10]) || 0,
        views: parseInt(fullRow[11]) || 0,
        commentsList: safeJsonParse(fullRow[12]),
      };
    });

    postsCache = { data: posts, lastUpdated: now, ttl: postsCache.ttl };
    saveCacheToFile();
    recordAPISuccess();
    return posts;
  } catch (error) {
    console.error('Error fetching posts:', error);
    recordAPIFailure();
    return postsCache.data;
  }
}

// ====== EXPRESS ROUTES ======
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await getAllPosts(req.query.refresh === 'true');
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { user, content, media } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const newPostId = Date.now().toString();
    const newPost = [
      newPostId, user || 'CeritaKita', 'Baru saja', content,
      media?.type || '', media?.url || '', media?.title || '', media?.artist || '',
      '0', '0', '0', '0', '[]'
    ];

    postsCache.data.unshift({
      id: newPostId, user: user || 'CeritaKita', date: 'Baru saja', content, media,
      likes: 0, comments: 0, shares: 0, views: 0, commentsList: []
    });
    postsCache.lastUpdated = Date.now();
    saveCacheToFile();

    setTimeout(async () => {
      try {
        if (canMakeAPICall()) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'CeritaKita!A2:M',
            valueInputOption: 'RAW',
            resource: { values: [newPost] },
          });
          recordAPISuccess();
        }
      } catch (error) {
        recordAPIFailure();
      }
    }, 0);

    res.json({ success: true, id: newPostId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment, userId } = req.body;
    const postIndex = postsCache.data.findIndex(p => p.id === id);

    if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });
    const post = postsCache.data[postIndex];
    let updates = {};

    switch (action) {
      case 'like': updates.likes = post.likes + 1; break;
      case 'view': updates.views = post.views + 1; break;
      case 'share': updates.shares = post.shares + 1; break;
      case 'comment':
        const newComment = { user: userId || 'Anon', text: comment, time: 'Baru saja', likes: 0 };
        updates.commentsList = [newComment, ...post.commentsList];
        updates.comments = post.comments + 1;
        break;
    }

    postsCache.data[postIndex] = { ...post, ...updates };
    postsCache.lastUpdated = Date.now();
    saveCacheToFile();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dbadmin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    cache: { postsCount: postsCache.data.length },
  });
});

app.post('/api/clear-cache', (req, res) => {
  invalidateCache();
  res.json({ success: true });
});

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initSheets();
});