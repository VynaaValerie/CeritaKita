// server.js - Fixed rate limiting and queue system
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

const config = require('./set.json');

// DEV mode
const DEV_MODE = process.env.DEV === 'true' || config.DEV === true;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

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
const SPREADSHEET_ID = config.GOOGLE_SHEET_ID || '';

// Enhanced Cache system
const CACHE_FILE = './posts-cache.json';
let postsCache = {
  data: [],
  lastUpdated: 0,
  ttl: (config.CACHE_TTL_MS || 30 * 1000) // default 30s
};

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

function saveCacheToFile() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(postsCache, null, 2));
  } catch (error) {
    console.error('Error saving cache to file:', error);
  }
}

// Enhanced Rate & Queue system
const rateState = {
  lastCall: 0,
  minInterval: DEV_MODE ? 0 : (config.MIN_INTERVAL_MS || 1000), // Increased to 1000ms
  consecutiveFails: 0,
  maxConsecutiveFails: 5
};

const writeQueue = [];
let processingQueue = false;
const QUEUE_PROCESS_INTERVAL = DEV_MODE ? 500 : (config.QUEUE_INTERVAL_MS || 1000);
const MAX_WRITES_PER_RUN = 1;

function getBackoffTime(attempts) {
  const base = 2000; // Increased base backoff
  return Math.min(60000, base * Math.pow(2, Math.max(0, attempts - 1))); // Max 60s
}

function enqueueWrite(job) {
  job.attempts = job.attempts || 0;
  job.addedAt = Date.now();
  job.id = job.id || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Deduplication - remove existing jobs for same post+action
  if (job.type === 'custom-update') {
    writeQueue = writeQueue.filter(existingJob => 
      !(existingJob.type === 'custom-update' && 
        existingJob.payload.id === job.payload.id && 
        existingJob.payload.action === job.payload.action)
    );
  }
  
  writeQueue.push(job);
  console.log('Enqueued job:', job.type, 'for post', job.payload.id, 'queueLen=', writeQueue.length);
}

// Enhanced Worker processing
async function processQueueOnce() {
  if (processingQueue || writeQueue.length === 0) return;
  
  processingQueue = true;
  try {
    for (let i = 0; i < MAX_WRITES_PER_RUN && writeQueue.length > 0; i++) {
      const job = writeQueue[0];
      const now = Date.now();
      const timeSinceLast = now - rateState.lastCall;
      const backoff = job.attempts > 0 ? getBackoffTime(job.attempts) : 0;

      // Enhanced timing checks
      if (!DEV_MODE && timeSinceLast < rateState.minInterval) break;
      if (!DEV_MODE && job.attempts > 0 && timeSinceLast < backoff) break;

      // Remove job from queue
      writeQueue.shift();

      try {
        rateState.lastCall = Date.now();
        console.log(`Processing ${job.type} for post ${job.payload.id} (attempt ${job.attempts + 1})`);

        if (job.type === 'append') {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: job.payload.range || 'CeritaKita!A2:M',
            valueInputOption: job.payload.valueInputOption || 'RAW',
            resource: { values: job.payload.values },
          });
          console.log('Append succeeded');
        } else if (job.type === 'custom-update') {
          const resp = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'CeritaKita!A2:M',
          });
          const rows = resp.data.values || [];
          const idx = rows.findIndex(r => r[0] === job.payload.id);
          if (idx !== -1) {
            const row = [...rows[idx], ...Array(13 - (rows[idx].length || 0)).fill('')];
            const action = job.payload.action;
            
            // Update counts
            if (action === 'like') row[8] = ((parseInt(row[8]) || 0) + 1).toString();
            if (action === 'view') row[11] = ((parseInt(row[11]) || 0) + 1).toString();
            if (action === 'share') row[10] = ((parseInt(row[10]) || 0) + 1).toString();
            if (action === 'comment') {
              const sheetComments = safeJsonParse(row[12] || '[]');
              sheetComments.unshift({
                user: job.payload.userId || 'Anonymous',
                text: job.payload.comment || '',
                time: new Date().toISOString(),
                likes: 0
              });
              row[12] = JSON.stringify(sheetComments);
              row[9] = ((parseInt(row[9]) || 0) + 1).toString();
            }
            
            await sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `CeritaKita!A${idx + 2}:M${idx + 2}`,
              valueInputOption: 'RAW',
              resource: { values: [row] },
            });
            console.log('custom-update succeeded for', job.payload.id);
          } else {
            console.log('custom-update: id not found', job.payload.id);
          }
        } else if (job.type === 'custom-delete') {
          const resp = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'CeritaKita!A2:M',
          });
          const rows = resp.data.values || [];
          const idx = rows.findIndex(r => r[0] === job.payload.id);
          if (idx !== -1) {
            await sheets.spreadsheets.values.clear({
              spreadsheetId: SPREADSHEET_ID,
              range: `CeritaKita!A${idx + 2}:M${idx + 2}`,
            });
            console.log('custom-delete succeeded for', job.payload.id);
          } else {
            console.log('custom-delete: id not found', job.payload.id);
          }
        }

        rateState.consecutiveFails = 0;
        console.log(`Job ${job.id} completed successfully`);
      } catch (error) {
        job.attempts = (job.attempts || 0) + 1;
        rateState.consecutiveFails++;
        
        console.error('Job error:', error.message || error, 'attempts=', job.attempts);
        
        if (job.attempts < 3) { // Reduced max attempts
          // Add back to queue with backoff
          setTimeout(() => {
            writeQueue.push(job);
          }, getBackoffTime(job.attempts));
        } else {
          console.error('Dropping job after too many attempts', job);
          // Still update cache to maintain consistency
          invalidateCache();
        }
      }
    }
  } finally {
    processingQueue = false;
  }
}

// Start queue processor
setInterval(processQueueOnce, QUEUE_PROCESS_INTERVAL);

// Safe JSON parse
function safeJsonParse(str) {
  try {
    if (!str || str === '[]') return [];
    return JSON.parse(str);
  } catch (error) {
    console.error('JSON parse error:', error, 'String:', str);
    return [];
  }
}

// Client request tracking for rate limiting
const clientRequests = new Map();
const CLIENT_RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  maxRequests: 30   // 30 requests per minute per IP
};

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - CLIENT_RATE_LIMIT.windowMs;
  
  if (!clientRequests.has(ip)) {
    clientRequests.set(ip, []);
  }
  
  const requests = clientRequests.get(ip);
  // Remove old requests
  while (requests.length > 0 && requests[0] < windowStart) {
    requests.shift();
  }
  
  // Check if under limit
  if (requests.length < CLIENT_RATE_LIMIT.maxRequests) {
    requests.push(now);
    return true;
  }
  
  return false;
}

// Enhanced middleware for rate limiting
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (req.path.startsWith('/api/') && !checkRateLimit(ip)) {
    // Instead of returning 429, we process the request but use cache
    console.log(`Rate limit exceeded for IP: ${ip}, using cache`);
    // We'll handle this in individual routes
    req.rateLimited = true;
  }
  
  next();
});

// Init sheets
async function initSheets() {
  try {
    console.log('Initializing...');
    loadCacheFromFile();

    try {
      const response = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      console.log('Spreadsheet:', response.data.properties.title);
      const sheetExists = response.data.sheets.some(s => s.properties.title === 'CeritaKita');

      if (!sheetExists) {
        console.log('Creating CeritaKita sheet...');
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { requests: [{ addSheet: { properties: { title: 'CeritaKita' } } }] }
        });
        const headers = [['ID','User','Date','Content','Media Type','Media URL','Title','Artist','Likes','Comments','Shares','Views','Comments List']];
        enqueueWrite({ type: 'update', payload: { range: 'CeritaKita!A1:M1', values: headers }});
        const samplePosts = [
          ['1','CeritaKita',new Date().toISOString(),'Contoh post','','','','','10','1','0','5','[]']
        ];
        enqueueWrite({ type: 'append', payload: { range: 'CeritaKita!A2:M', values: samplePosts } });
        postsCache.data = samplePosts.map(row => ({
          id: row[0], user: row[1], date: row[2], content: row[3],
          media: null, likes: 10, comments: 1, shares: 0, views: 5, commentsList: []
        }));
        postsCache.lastUpdated = Date.now();
        saveCacheToFile();
      } else {
        await getAllPosts(true);
      }
    } catch (err) {
      console.error('Could not access spreadsheet (continuing with cache):', err.message || err);
    }

    console.log('Init complete. Worker running.');
  } catch (err) {
    console.error('Init error:', err);
  }
}

// Enhanced getAllPosts with better error handling
async function getAllPosts(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && postsCache.data.length > 0 && (now - postsCache.lastUpdated < postsCache.ttl)) {
    return postsCache.data;
  }
  
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'CeritaKita!A2:M',
    });
    const values = resp.data.values || [];
    const posts = values.map(row => {
      const full = [...row, ...Array(13 - row.length).fill('')];
      return {
        id: full[0] || '',
        user: full[1] || 'CeritaKita',
        date: full[2] || new Date().toISOString(),
        content: full[3] || '',
        media: full[4] ? { type: full[4], url: full[5]||'', title: full[6]||'', artist: full[7]||'' } : null,
        likes: parseInt(full[8])||0,
        comments: parseInt(full[9])||0,
        shares: parseInt(full[10])||0,
        views: parseInt(full[11])||0,
        commentsList: safeJsonParse(full[12]||'[]')
      };
    }).filter(p => p.id);
    
    postsCache.data = posts;
    postsCache.lastUpdated = now;
    saveCacheToFile();
    console.log('Cache updated:', posts.length, 'posts');
    return posts;
  } catch (error) {
    console.error('Error fetching posts:', error.message || error);
    if (postsCache.data.length > 0) {
      console.log('Returning cached data due to error');
      return postsCache.data;
    }
    throw error;
  }
}

function invalidateCache() {
  postsCache.lastUpdated = 0;
  saveCacheToFile();
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/posts', async (req, res) => {
  try {
    const posts = await getAllPosts(req.rateLimited ? false : true);
    res.json(posts);
  } catch (error) {
    console.error('Error in /api/posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { user, content, media } = req.body;
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPost = {
      id,
      user: user || 'Anonymous',
      date: new Date().toISOString(),
      content,
      media: media || null,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      commentsList: []
    };
    
    const row = [
      id,
      newPost.user,
      newPost.date,
      newPost.content,
      newPost.media?.type || '',
      newPost.media?.url || '',
      newPost.media?.title || '',
      newPost.media?.artist || '',
      '0','0','0','0','[]'
    ];
    
    enqueueWrite({ type: 'append', payload: { range: 'CeritaKita!A2:M', values: [row] } });
    
    // Update cache immediately
    postsCache.data.unshift(newPost);
    postsCache.lastUpdated = Date.now();
    saveCacheToFile();
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.post('/api/posts/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params;
    const { userId, comment } = req.body;
    
    const validActions = ['like', 'view', 'share', 'comment'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    enqueueWrite({ 
      type: 'custom-update', 
      payload: { id, action, userId, comment } 
    });
    
    // Update cache immediately
    const post = postsCache.data.find(p => p.id === id);
    if (post) {
      if (action === 'like') post.likes = (post.likes || 0) + 1;
      if (action === 'view') post.views = (post.views || 0) + 1;
      if (action === 'share') post.shares = (post.shares || 0) + 1;
      if (action === 'comment') {
        post.comments = (post.comments || 0) + 1;
        post.commentsList.unshift({
          user: userId || 'Anonymous',
          text: comment || '',
          time: new Date().toISOString(),
          likes: 0
        });
      }
      postsCache.lastUpdated = Date.now();
      saveCacheToFile();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    enqueueWrite({ type: 'custom-delete', payload: { id } });
    
    // Update cache immediately
    postsCache.data = postsCache.data.filter(p => p.id !== id);
    postsCache.lastUpdated = Date.now();
    saveCacheToFile();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    queueLength: writeQueue.length,
    cacheSize: postsCache.data.length,
    cacheAge: Date.now() - postsCache.lastUpdated,
    processing: processingQueue
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`DEV MODE: ${DEV_MODE}`);
  console.log(`Rate Limit: ${CLIENT_RATE_LIMIT.maxRequests} requests per ${CLIENT_RATE_LIMIT.windowMs/1000}s`);
  initSheets();
});