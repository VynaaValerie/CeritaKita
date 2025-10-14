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
let config;
try {
    config = require('./set.json');
} catch (error) {
    console.log('set.json not found, using environment variables');
    config = {
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
        GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
        GOOGLE_PRIVATE_KEY_ID: process.env.GOOGLE_PRIVATE_KEY_ID,
        GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
        GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID
    };
}

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
    credentials: {
        type: 'service_account',
        project_id: config.GOOGLE_PROJECT_ID,
        private_key_id: config.GOOGLE_PRIVATE_KEY_ID,
        private_key: config.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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

        postsCache.data = posts;
        postsCache.lastUpdated = now;
        saveCacheToFile();
        recordAPISuccess();
        return posts;
    } catch (error) {
        console.error('Error fetching posts:', error);
        recordAPIFailure();
        return postsCache.data;
    }
}

// ====== FIND POST ROW ======
async function findPostRow(postId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'CeritaKita!A2:A',
        });

        const rows = response.data.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === postId) {
                return i + 2; // +2 because header row and 0-based index
            }
        }
        return -1;
    } catch (error) {
        console.error('Error finding post row:', error);
        return -1;
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

        // Add to cache
        postsCache.data.unshift({
            id: newPostId,
            user: user || 'CeritaKita',
            date: 'Baru saja',
            content,
            media,
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
            commentsList: []
        });
        postsCache.lastUpdated = Date.now();
        saveCacheToFile();

        // Async write to Google Sheets
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
                console.error('Error writing to Google Sheets:', error);
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
        
        // Find post in cache
        const postIndex = postsCache.data.findIndex(p => p.id === id);
        if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });
        
        const post = postsCache.data[postIndex];
        let updates = {};

        switch (action) {
            case 'like':
                updates.likes = (post.likes || 0) + 1;
                break;
            case 'view':
                updates.views = (post.views || 0) + 1;
                break;
            case 'share':
                updates.shares = (post.shares || 0) + 1;
                break;
            case 'comment':
                const newComment = {
                    user: userId || 'Anon',
                    text: comment,
                    time: 'Baru saja',
                    likes: 0
                };
                updates.commentsList = [newComment, ...(post.commentsList || [])];
                updates.comments = (post.comments || 0) + 1;
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

        // Update cache
        postsCache.data[postIndex] = { ...post, ...updates };
        postsCache.lastUpdated = Date.now();
        saveCacheToFile();

        // Async update Google Sheets
        setTimeout(async () => {
            try {
                if (canMakeAPICall()) {
                    const rowNumber = await findPostRow(id);
                    if (rowNumber !== -1) {
                        const range = `CeritaKita!I${rowNumber}:L${rowNumber}`;
                        const values = [[
                            updates.likes !== undefined ? updates.likes : post.likes || 0,
                            updates.comments !== undefined ? updates.comments : post.comments || 0,
                            updates.shares !== undefined ? updates.shares : post.shares || 0,
                            updates.views !== undefined ? updates.views : post.views || 0
                        ]];

                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: range,
                            valueInputOption: 'RAW',
                            resource: { values },
                        });

                        // Update comments list if needed
                        if (action === 'comment') {
                            const commentsRange = `CeritaKita!M${rowNumber}`;
                            const commentsValue = JSON.stringify(updates.commentsList || post.commentsList || []);
                            
                            await sheets.spreadsheets.values.update({
                                spreadsheetId: SPREADSHEET_ID,
                                range: commentsRange,
                                valueInputOption: 'RAW',
                                resource: { values: [[commentsValue]] },
                            });
                        }
                        
                        recordAPISuccess();
                    }
                }
            } catch (error) {
                console.error('Error updating Google Sheets:', error);
                recordAPIFailure();
            }
        }, 0);

        res.json({ success: true, updates });
    } catch (error) {
        console.error('Error updating post:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE endpoint yang sebelumnya hilang
app.delete('/api/posts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Remove from cache
        const postIndex = postsCache.data.findIndex(p => p.id === id);
        if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });
        
        postsCache.data.splice(postIndex, 1);
        postsCache.lastUpdated = Date.now();
        saveCacheToFile();

        // Async delete from Google Sheets
        setTimeout(async () => {
            try {
                if (canMakeAPICall()) {
                    const rowNumber = await findPostRow(id);
                    if (rowNumber !== -1) {
                        await sheets.spreadsheets.values.clear({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `CeritaKita!A${rowNumber}:M${rowNumber}`,
                        });
                        recordAPISuccess();
                    }
                }
            } catch (error) {
                console.error('Error deleting from Google Sheets:', error);
                recordAPIFailure();
            }
        }, 0);

        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dbadmin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        cache: {
            postsCount: postsCache.data.length,
            lastUpdated: postsCache.lastUpdated,
            cacheAge: Date.now() - postsCache.lastUpdated
        },
        rateLimit: {
            consecutiveFails: rateLimit.consecutiveFails,
            lastCall: rateLimit.lastCall
        }
    });
});

// Clear cache endpoint
app.post('/api/clear-cache', (req, res) => {
    invalidateCache();
    res.json({ success: true, message: 'Cache cleared' });
});

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;

// Initialize and start server
async function startServer() {
    try {
        await initSheets();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📱 Main app: http://localhost:${PORT}`);
            console.log(`⚙️  Admin: http://localhost:${PORT}/dbadmin`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();