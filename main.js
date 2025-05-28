console.log('[main.js] Script started. Electron main process initializing...'); 

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs'); 
const crypto = require('crypto'); 
const http = require('http');
const url = require('url');

const Database = require('better-sqlite3');
let db;

try {
    const dbPath = path.join(app.getPath('userData'), 'media_slideshow_stats.sqlite');
    db = new Database(dbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS media_views (file_path_hash TEXT PRIMARY KEY, file_path TEXT UNIQUE, view_count INTEGER DEFAULT 0, last_viewed TEXT);`);
    db.exec(`CREATE TABLE IF NOT EXISTS app_cache (cache_key TEXT PRIMARY KEY, cache_value TEXT, last_updated TEXT);`);
    console.log('[main.js] SQLite database initialized.');
} catch (error) {
    console.error('[main.js] CRITICAL ERROR: Failed to initialize SQLite database.', error);
    db = null; 
}

const MAX_DATA_URL_SIZE_MB = 50; 
const FILE_INDEX_CACHE_KEY = 'file_index_json';
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
const ALL_SUPPORTED_EXTENSIONS = [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];

let serverPort = 0; // Will be set when the server starts

function getMimeType(filePath) {
    const extension = path.extname(filePath).substring(1).toLowerCase();
    if (SUPPORTED_IMAGE_EXTENSIONS.includes(`.${extension}`)) return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    if (SUPPORTED_VIDEO_EXTENSIONS.includes(`.${extension}`)) {
        if (extension === 'mp4') return 'video/mp4';
        if (extension === 'webm') return 'video/webm';
        if (extension === 'ogg') return 'video/ogg';
        // Add more specific MIME types if needed for .mov, .avi, .mkv
        if (extension === 'mov') return 'video/quicktime';
        if (extension === 'avi') return 'video/x-msvideo';
        if (extension === 'mkv') return 'video/x-matroska';
        return `video/${extension}`;
    }
    return 'application/octet-stream';
}

// --- IPC Handlers - Define these once at the top level ---
ipcMain.handle('load-file-as-data-url', (event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        console.error(`[main.js] File does not exist: ${filePath}`);
        return null;
      }
      const stats = fs.statSync(filePath);
      const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
      
      if (isVideo && stats.size > MAX_DATA_URL_SIZE_MB * 1024 * 1024) {
        if (serverPort === 0) {
            console.error('[main.js] Server not ready, cannot provide HTTP URL.');
            return { type: 'error', message: 'Local server not ready.' };
        }
        const pathForUrl = filePath.replace(/\\/g, '/'); 
        return { type: 'http-url', url: `http://localhost:${serverPort}/${pathForUrl}` };
      }
      
      const fileBuffer = fs.readFileSync(filePath);
      const mimeType = getMimeType(filePath);
      const dataURL = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      return { type: 'data-url', url: dataURL }; 
    } catch (error) {
      console.error(`[main.js] CRITICAL ERROR while processing ${filePath}:`, error);
      return { type: 'error', message: error.message };
    }
});

function generateFileId(filePath) { return crypto.createHash('md5').update(filePath).digest('hex'); }

ipcMain.handle('record-media-view', async (event, filePath) => { 
    if (!db) {
        console.warn('[main.js] Database not available for record-media-view');
        return; 
    }
    const fileId = generateFileId(filePath); 
    try { 
        const stmt_insert = db.prepare(`INSERT OR IGNORE INTO media_views (file_path_hash, file_path, view_count, last_viewed) VALUES (?, ?, 0, ?)`); 
        const stmt_update = db.prepare(`UPDATE media_views SET view_count = view_count + 1, last_viewed = ? WHERE file_path_hash = ?`); 
        db.transaction(() => { 
            stmt_insert.run(fileId, filePath, new Date().toISOString()); 
            stmt_update.run(new Date().toISOString(), fileId); 
        })(); 
        console.log(`[main.js] Successfully recorded view for ${fileId}`);
    } catch (error) { 
        console.error(`[main.js] Error recording view for ${filePath} (ID: ${fileId}) in SQLite:`, error); 
    } 
});

async function getMediaViewCountsLogicSQLite(filePaths) { 
    if (!db || !filePaths || filePaths.length === 0) return {};
    const viewCountsMap = {};
    try {
        const placeholders = filePaths.map(() => '?').join(',');
        const fileIds = filePaths.map(generateFileId);
        const stmt = db.prepare(`SELECT file_path_hash, view_count FROM media_views WHERE file_path_hash IN (${placeholders})`);
        const rows = stmt.all(fileIds);
        const countsByHash = {};
        rows.forEach(row => { countsByHash[row.file_path_hash] = row.view_count; });
        filePaths.forEach(filePath => {
            const fileId = generateFileId(filePath);
            viewCountsMap[filePath] = countsByHash[fileId] || 0;
        });
    } catch (error) { console.error('[main.js] Error fetching view counts from SQLite:', error); }
    return viewCountsMap;
}

ipcMain.handle('get-media-view-counts', async (event, filePaths) => {
    return getMediaViewCountsLogicSQLite(filePaths);
});

async function scanDiskForModelsAndCache() { 
    console.log('[main.js] Starting disk scan for models...');
    const baseMediaDirectory = 'D:\\test'; 
    const models = []; 
    try { 
        if (!fs.existsSync(baseMediaDirectory)) {
            console.error(`[main.js] Base media directory not found: ${baseMediaDirectory}`);
            return []; 
        }
        const modelFolders = fs.readdirSync(baseMediaDirectory, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); 
        for (const f of modelFolders) { 
            const p = path.join(baseMediaDirectory, f); 
            const files = findAllMediaFiles(p); 
            if (files.length > 0) models.push({ name: f, textures: files }); 
        } 
    } catch (e) { 
        console.error(`[main.js] Error scanning disk for models:`, e); 
        return []; 
    } 
    if (db) { 
        try { 
            db.prepare(`INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`).run(FILE_INDEX_CACHE_KEY, JSON.stringify(models), new Date().toISOString()); 
            console.log('[main.js] File index successfully scanned and cached in SQLite.');
        } catch (e) { 
            console.error('[main.js] Error caching file index to SQLite:', e); 
        } 
    } 
    return models; 
}

async function getModelsFromCacheOrDisk() { 
    if (db) { 
        try { 
            const row = db.prepare(`SELECT cache_value FROM app_cache WHERE cache_key = ?`).get(FILE_INDEX_CACHE_KEY); 
            if (row && row.cache_value) {
                console.log('[main.js] Loaded file index from SQLite cache.');
                return JSON.parse(row.cache_value); 
            }
            console.log('[main.js] No file index cache found in SQLite. Scanning disk...');
        } catch (e) { 
            console.error('[main.js] Error reading file index from SQLite cache. Scanning disk...', e); 
        } 
    } else {
        console.warn('[main.js] SQLite DB not available for caching. Scanning disk directly.');
    }
    return await scanDiskForModelsAndCache(); 
}

ipcMain.handle('get-models-with-view-counts', async () => { 
    const models = await getModelsFromCacheOrDisk(); 
    if (!models || models.length === 0) {
        console.log('[main.js] No models found for get-models-with-view-counts.');
        return [];
    }
    if (!db) {
        console.warn('[main.js] DB not available for get-models-with-view-counts, returning with 0 counts.');
        return models.map(m => ({...m, textures: m.textures.map(t => ({...t, viewCount: 0}))}));
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path)); 
    const viewCountsMap = await getMediaViewCountsLogicSQLite(allFilePaths); 
    return models.map(model => ({ ...model, textures: model.textures.map(texture => ({ ...texture, viewCount: viewCountsMap[texture.path] || 0 })) })); 
});

ipcMain.handle('reindex-media-library', async () => { 
    console.log('[main.js] Re-indexing media library requested...');
    const models = await scanDiskForModelsAndCache(); 
    if (!models || models.length === 0) {
        console.log('[main.js] No models found after re-indexing.');
        return [];
    }
    if (!db) {
        console.warn('[main.js] DB not available for reindex-media-library, returning with 0 counts.');
        return models.map(m => ({...m, textures: m.textures.map(t => ({...t, viewCount: 0}))}));
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path)); 
    const viewCountsMap = await getMediaViewCountsLogicSQLite(allFilePaths); 
    return models.map(model => ({ ...model, textures: model.textures.map(texture => ({ ...texture, viewCount: viewCountsMap[texture.path] || 0 })) })); 
});
// --- End of IPC Handlers ---


function createWindow() {
  console.log('[main.js] createWindow() called.'); 
  const win = new BrowserWindow({
    width: 1200, height: 800, 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, enableRemoteModule: false,
    },
  });
  console.log('[main.js] BrowserWindow created.'); 

  win.loadFile('index.html')
    .then(() => { console.log('[main.js] index.html loaded successfully.'); })
    .catch(err => console.error('[main.js] FAILED to load index.html:', err));
}

function startLocalServer() {
    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url);
        const filePath = decodeURIComponent(parsedUrl.pathname.substring(1));

        const allowedBaseDirectory = path.normalize('D:\\'); // Ensure this is the correct base path
        const normalizedFilePath = path.normalize(filePath);

        if (!normalizedFilePath.startsWith(allowedBaseDirectory) || !fs.existsSync(normalizedFilePath)) {
            console.error(`[Server] Forbidden or not found: ${normalizedFilePath}`);
            res.writeHead(404);
            return res.end('File not found.');
        }

        try {
            const stat = fs.statSync(normalizedFilePath);
            const totalSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
                
                if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
                    console.error(`[Server] Invalid range: ${range} for ${normalizedFilePath}`);
                    res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                    return res.end();
                }

                const chunkSize = (end - start) + 1;
                const file = fs.createReadStream(normalizedFilePath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': getMimeType(normalizedFilePath),
                };
                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': totalSize,
                    'Content-Type': getMimeType(normalizedFilePath),
                    'Accept-Ranges': 'bytes'
                };
                res.writeHead(200, head);
                fs.createReadStream(normalizedFilePath).pipe(res);
            }
        } catch (serverError) {
            console.error(`[Server] Error processing file ${normalizedFilePath}:`, serverError);
            res.writeHead(500);
            res.end("Server error.");
        }
    }).listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        console.log(`[main.js] Local media server started on http://localhost:${serverPort}`);
        createWindow(); 
    });

    server.on('error', (err) => {
        console.error('[main.js] Server Error:', err);
        // Potentially try to restart or alert the user
    });
}

app.on('ready', startLocalServer); 
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { 
    if (BrowserWindow.getAllWindows().length === 0) {
        if (serverPort > 0) { // Ensure server is running before creating a window
            createWindow(); 
        } else {
            // If server isn't running (e.g., failed to start), maybe try starting it again
            // or log an error. For now, we'll just log.
            console.warn('[main.js] Activate event: Server not running, not creating window.');
        }
    }
});

function findAllMediaFiles(directoryPath, mediaFilesList = []) {
  try {
    const items = fs.readdirSync(directoryPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        findAllMediaFiles(fullPath, mediaFilesList);
      } else if (item.isFile()) {
        const fileExtension = path.extname(item.name).toLowerCase();
        if (ALL_SUPPORTED_EXTENSIONS.includes(fileExtension)) {
          mediaFilesList.push({ name: item.name, path: fullPath });
        }
      }
    }
  } catch (err) { console.error(`[main.js] Error reading directory ${directoryPath}:`, err); }
  return mediaFilesList;
}
