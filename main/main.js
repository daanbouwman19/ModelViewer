console.log('[main.js] Script started. Electron main process initializing...');

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
// crypto is not directly used in this file after refactor.

const {
    MAX_DATA_URL_SIZE_MB,
    SUPPORTED_IMAGE_EXTENSIONS, // Used for determining if a file is an image
    SUPPORTED_VIDEO_EXTENSIONS, // Used for determining if a file is a video
} = require('./constants.js');

const { initDatabase, recordMediaView, getMediaViewCounts, cacheModels, getCachedModels } = require('./database.js');
const { performFullMediaScan } = require('./media-scanner.js');
const { startLocalServer, getServerPort, getMimeType: resolveMimeType } = require('./local-server.js');

// --- IPC Handlers ---

ipcMain.handle('load-file-as-data-url', (event, filePath) => {
    try {
        if (!filePath || !fs.existsSync(filePath)) {
            console.error(`[main.js] File does not exist for load-file-as-data-url: ${filePath}`);
            return { type: 'error', message: 'File does not exist.' };
        }
        const stats = fs.statSync(filePath);
        const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
        const currentServerPort = getServerPort();

        // If it's a large video, serve via HTTP URL from local server
        if (isVideo && stats.size > MAX_DATA_URL_SIZE_MB * 1024 * 1024) {
            if (currentServerPort === 0) {
                console.error('[main.js] Server not ready (port 0), cannot provide HTTP URL for large video.');
                return { type: 'error', message: 'Local server not ready to stream large video.' };
            }
            // Ensure backslashes are forward slashes for URL compatibility
            const pathForUrl = filePath.replace(/\\/g, '/');
            return { type: 'http-url', url: `http://localhost:${currentServerPort}/${pathForUrl}` };
        }

        // Otherwise, load as Data URL
        const mimeType = resolveMimeType(filePath); // Use imported resolveMimeType
        const fileBuffer = fs.readFileSync(filePath);
        const dataURL = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
        return { type: 'data-url', url: dataURL };
    } catch (error) {
        console.error(`[main.js] CRITICAL ERROR while processing ${filePath} in load-file-as-data-url:`, error);
        return { type: 'error', message: error.message || 'Unknown error processing file.' };
    }
});

ipcMain.handle('record-media-view', async (event, filePath) => {
    await recordMediaView(filePath);
});

ipcMain.handle('get-media-view-counts', async (event, filePaths) => {
    return getMediaViewCounts(filePaths);
});

/**
 * Scans the disk for media models based on a configured directory,
 * then caches the results in the database.
 * @returns {Promise<Array<Object>>} The list of models found.
 */
async function scanDiskForModelsAndCache() {
    console.log('[main.js] scanDiskForModelsAndCache called. Delegating to media-scanner and database.');
    // TODO: This base directory should be configurable by the user.
    const baseMediaDirectory = 'D:\\test';

    const models = await performFullMediaScan(baseMediaDirectory);

    if (!models || models.length === 0) {
        console.log('[main.js] Media scan returned no models.');
        // Cache an empty result to avoid re-scanning constantly if the directory is truly empty.
    }

    await cacheModels(models);
    return models;
}

/**
 * Retrieves models, first trying the cache, then scanning the disk if cache is empty.
 * @returns {Promise<Array<Object>>} The list of models.
 */
async function getModelsFromCacheOrDisk() {
    let models = await getCachedModels();
    if (models) {
        return models;
    }
    console.log('[main.js] No file index cache found. Scanning disk...');
    models = await scanDiskForModelsAndCache();
    return models;
}

ipcMain.handle('get-models-with-view-counts', async () => {
    const models = await getModelsFromCacheOrDisk();
    if (!models || models.length === 0) {
        console.log('[main.js] No models found for get-models-with-view-counts.');
        return [];
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path));
    const viewCountsMap = await getMediaViewCounts(allFilePaths);

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
    const models = await scanDiskForModelsAndCache(); // This also handles caching
    if (!models || models.length === 0) {
        console.log('[main.js] No models found after re-indexing.');
        return [];
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path));
    const viewCountsMap = await getMediaViewCounts(allFilePaths);

    return models.map(model => ({
        ...model,
        textures: model.textures.map(texture => ({
            ...texture,
            viewCount: viewCountsMap[texture.path] || 0
        }))
    }));
});

// --- Window Creation ---
function createWindow() {
    console.log('[main.js] createWindow() called.');
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            contextIsolation: true,
            enableRemoteModule: false, // Recommended for security
        },
    });
    console.log('[main.js] BrowserWindow created.');

    win.loadFile(path.join(__dirname, '../index.html'))
        .then(() => { console.log('[main.js] index.html loaded successfully.'); })
        .catch(err => console.error('[main.js] FAILED to load index.html:', err));
}

// --- App Lifecycle ---
app.on('ready', () => {
    try {
        initDatabase();
        console.log('[main.js] Database initialization requested on app ready.');
    } catch (error) {
        // Error already logged by initDatabase if it's critical
        console.error("[main.js] Further error context: Database initialization failed during app ready sequence.", error);
    }
    // Start local server and pass createWindow as a callback
    startLocalServer(createWindow);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        if (getServerPort() > 0) { // Ensure server is running before creating a window
            createWindow();
        } else {
            // If server isn't running (e.g., failed to start), log an error.
            // Consider attempting to restart the server or notifying the user.
            console.warn('[main.js] Activate event: Server not running, not creating window. Attempting to start server again.');
            startLocalServer(createWindow); // Try to start server again
        }
    }
});
