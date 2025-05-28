console.log('[main.js] Script started. Electron main process initializing...'); 

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs'); 
const crypto = require('crypto'); 
// http and url are no longer needed here as server logic moved to local-server.js

const { 
    MAX_DATA_URL_SIZE_MB, 
    // FILE_INDEX_CACHE_KEY, // No longer needed directly in main.js for scanning
    SUPPORTED_IMAGE_EXTENSIONS, 
    SUPPORTED_VIDEO_EXTENSIONS, 
    // ALL_SUPPORTED_EXTENSIONS // No longer needed directly in main.js for scanning
} = require('./constants.js'); // FILE_INDEX_CACHE_KEY and ALL_SUPPORTED_EXTENSIONS are used in database.js and media-scanner.js respectively

const { initDatabase, recordMediaView, getMediaViewCounts, cacheModels, getCachedModels } = require('./database.js');
const { performFullMediaScan } = require('./media-scanner.js'); // Added import
const { startLocalServer, getServerPort, getMimeType: resolveMimeType } = require('./local-server.js'); // Added for server logic

// --- IPC Handlers - Define these once at the top level ---
ipcMain.handle('load-file-as-data-url', (event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        console.error(`[main.js] File does not exist for load-file-as-data-url: ${filePath}`);
        return { type: 'error', message: 'File does not exist.' };
      }
      const stats = fs.statSync(filePath);
      const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
      const currentServerPort = getServerPort(); // Get current server port

      if (isVideo && stats.size > MAX_DATA_URL_SIZE_MB * 1024 * 1024) {
        if (currentServerPort === 0) {
            console.error('[main.js] Server not ready (port 0), cannot provide HTTP URL for large video.');
            return { type: 'error', message: 'Local server not ready to stream large video.' };
        }
        const pathForUrl = filePath.replace(/\\/g, '/'); // Ensure backslashes are forward slashes for URL
        return { type: 'http-url', url: `http://localhost:${currentServerPort}/${pathForUrl}` };
      }
      
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

app.on('ready', () => {
  try {
    initDatabase(); 
    console.log('[main.js] Database initialization requested.');
  } catch (error) {
    console.error("[main.js] CRITICAL: Failed to initialize database during app ready.", error);
  }
  // Pass createWindow as a callback to be executed once server is ready
  startLocalServer(createWindow); 
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { 
    if (BrowserWindow.getAllWindows().length === 0) {
        // serverPort is no longer available here, use getServerPort()
        if (getServerPort() > 0) { // Ensure server is running before creating a window
            createWindow(); 
        } else {
            // If server isn't running (e.g., failed to start), maybe try starting it again
            // or log an error. For now, we'll just log.
            console.warn('[main.js] Activate event: Server not running, not creating window.');
        }
    }
});
