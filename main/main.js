console.log('[main.js] Script started. Electron main process initializing...'); 

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs'); 
const crypto = require('crypto'); 
const http = require('http');
const url = require('url');

const { 
    MAX_DATA_URL_SIZE_MB, 
    // FILE_INDEX_CACHE_KEY, // No longer needed directly in main.js for scanning
    SUPPORTED_IMAGE_EXTENSIONS, 
    SUPPORTED_VIDEO_EXTENSIONS, 
    // ALL_SUPPORTED_EXTENSIONS // No longer needed directly in main.js for scanning
} = require('./constants.js'); // FILE_INDEX_CACHE_KEY and ALL_SUPPORTED_EXTENSIONS are used in database.js and media-scanner.js respectively

const { initDatabase, recordMediaView, getMediaViewCounts, cacheModels, getCachedModels } = require('./database.js');
const { performFullMediaScan } = require('./media-scanner.js'); // Added import

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

ipcMain.handle('record-media-view', async (event, filePath) => { 
    await recordMediaView(filePath); 
});

ipcMain.handle('get-media-view-counts', async (event, filePaths) => {
    return getMediaViewCounts(filePaths);
});

async function scanDiskForModelsAndCache() {
    console.log('[main.js] scanDiskForModelsAndCache called. Delegating to media-scanner and database.');
    const baseMediaDirectory = 'D:\\test'; // This should be configurable eventually
    
    // Step 1: Perform the scan using the media-scanner module
    const models = await performFullMediaScan(baseMediaDirectory); 
    
    if (!models || models.length === 0) {
        console.log('[main.js] Media scan returned no models.');
        // It's important to cache an empty result if that's what the scan returned,
        // to avoid re-scanning constantly if the directory is truly empty.
    }
    
    // Step 2: Cache the results using the database module
    await cacheModels(models); 
    
    return models; 
}

async function getModelsFromCacheOrDisk() { 
    let models = await getCachedModels(); // Use new function
    if (models) {
        return models; 
    }
    console.log('[main.js] No file index cache found in SQLite. Scanning disk...');
    models = await scanDiskForModelsAndCache(); // Calls updated scanDiskForModelsAndCache
    return models; 
}

ipcMain.handle('get-models-with-view-counts', async () => { 
    const models = await getModelsFromCacheOrDisk(); 
    if (!models || models.length === 0) {
        console.log('[main.js] No models found for get-models-with-view-counts.');
        return [];
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path)); 
    const viewCountsMap = await getMediaViewCounts(allFilePaths); // Use new function

    return models.map(model => ({ 
        ...model, 
        textures: model.textures.map(texture => ({ 
            ...texture, 
            viewCount: viewCountsMap[texture.path] || 0 
        })) 
    })); 
});

ipcMain.handle('reindex-media-library', async () => { 
    console.log('[main.js] Re-indexing media library requested...');
    const models = await scanDiskForModelsAndCache(); // This now also handles caching
    if (!models || models.length === 0) {
        console.log('[main.js] No models found after re-indexing.');
        return [];
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path)); 
    const viewCountsMap = await getMediaViewCounts(allFilePaths); // Use new function

    return models.map(model => ({ 
        ...model, 
        textures: model.textures.map(texture => ({ 
            ...texture, 
            viewCount: viewCountsMap[texture.path] || 0 
        })) 
    })); 
});
// --- End of IPC Handlers ---


function createWindow() {
  console.log('[main.js] createWindow() called.'); 
  const win = new BrowserWindow({
    width: 1200, height: 800, 
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true, enableRemoteModule: false,
    },
  });
  console.log('[main.js] BrowserWindow created.'); 

  win.loadFile(path.join(__dirname, '../index.html'))
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

app.on('ready', () => {
  try {
    initDatabase(); // Initialize DB
    console.log('[main.js] Database initialization requested.');
  } catch (error) {
    console.error("[main.js] CRITICAL: Failed to initialize database during app ready. App may not function correctly.", error);
    // Optionally, show an error dialog to the user or quit the app
  }
  startLocalServer(); // Then start the server (which calls createWindow)
});
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
