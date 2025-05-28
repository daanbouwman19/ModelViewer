// ModelViewer-App/main.js
console.log('[main.js] Script started. Electron main process initializing...'); 

const { app, BrowserWindow, ipcMain, protocol, dialog } = require('electron'); // Added dialog
const path = require('path');
const fs = require('fs'); 
const fsp = require('fs').promises; // For async file operations
const crypto = require('crypto'); 

const Database = require('better-sqlite3');
let db;

const SETTINGS_FILE_PATH = path.join(app.getPath('userData'), 'user-settings.json');
let currentBaseMediaDirectory = null; // Or a default like 'D:\\test'

// Helper functions for settings
function getBaseMediaDirectory() {
  return currentBaseMediaDirectory;
}

async function saveSettings(settings) {
  try {
    await fsp.writeFile(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2));
    currentBaseMediaDirectory = settings.baseMediaDirectory;
    console.log(`[main.js] Settings saved. Base directory set to: ${currentBaseMediaDirectory}`);
  } catch (error) {
    console.error('[main.js] Error saving settings:', error);
  }
}

async function loadSettings() {
  try {
    const settingsJson = await fsp.readFile(SETTINGS_FILE_PATH, 'utf-8');
    const settings = JSON.parse(settingsJson);
    currentBaseMediaDirectory = settings.baseMediaDirectory;
    console.log(`[main.js] Settings loaded. Base directory: ${currentBaseMediaDirectory}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[main.js] Settings file not found. Initializing with default (null or D:\\test).');
      // Optionally save a default settings file here if needed, e.g., with 'D:\\test'
      // currentBaseMediaDirectory = 'D:\\test'; // Set a default if desired
      // await saveSettings({ baseMediaDirectory: currentBaseMediaDirectory });
      currentBaseMediaDirectory = null; // Defaulting to null, user must set it.
    } else {
      console.error('[main.js] Error loading settings:', error);
      currentBaseMediaDirectory = null; // Fallback if loading fails
    }
  }
}

try {
    const dbPath = path.join(app.getPath('userData'), 'media_slideshow_stats.sqlite');
    console.log(`[main.js] Database path: ${dbPath}`);
    db = new Database(dbPath); 

    db.exec(`
        CREATE TABLE IF NOT EXISTS media_views (
            file_path_hash TEXT PRIMARY KEY,
            file_path TEXT UNIQUE,
            view_count INTEGER DEFAULT 0,
            last_viewed TEXT
        );
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS app_cache (
            cache_key TEXT PRIMARY KEY,
            cache_value TEXT,
            last_updated TEXT
        );
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS model_settings (
            model_name TEXT PRIMARY KEY,
            is_random BOOLEAN DEFAULT FALSE,
            is_selected_for_global BOOLEAN DEFAULT TRUE
        );
    `);
    console.log('[main.js] SQLite database initialized and tables ensured.');
    console.log('[main.js] model_settings table ensured in SQLite database.');
} catch (error) {
    console.error('[main.js] CRITICAL ERROR: Failed to initialize SQLite database.', error);
    db = null; 
}

console.log('[main.js] Modules loaded.'); 

const MAX_DATA_URL_SIZE_MB = 50; 
const CUSTOM_PROTOCOL_SCHEME = 'app-media'; 
const FILE_INDEX_CACHE_KEY = 'file_index_json';

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

  ipcMain.handle('load-file-as-data-url', (event, filePath) => {
    console.log(`[main.js] Received request to load file: ${filePath}`);
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        console.error(`[main.js] File does not exist or path is invalid: ${filePath}`);
        return null;
      }
      const stats = fs.statSync(filePath);
      const fileSizeInBytes = stats.size;
      const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
      const fileExtension = path.extname(filePath).substring(1).toLowerCase();
      const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(`.${fileExtension}`);

      if (isVideo && fileSizeInMB > MAX_DATA_URL_SIZE_MB) {
        return { type: 'custom-protocol', path: filePath, protocolScheme: CUSTOM_PROTOCOL_SCHEME };
      }
      const fileBuffer = fs.readFileSync(filePath);
      let mimeType = '';
      if (SUPPORTED_IMAGE_EXTENSIONS.includes(`.${fileExtension}`)) {
        mimeType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
      } else if (isVideo) { 
        mimeType = `video/${fileExtension}`;
      } else {
        mimeType = 'application/octet-stream';
      }
      const dataURL = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      return { type: 'data-url', url: dataURL }; 
    } catch (error) {
      console.error(`[main.js] CRITICAL ERROR while processing ${filePath}:`, error);
      return null;
    }
  });

  function generateFileId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  ipcMain.handle('record-media-view', async (event, filePath) => {
    if (!db) { return; }
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

// This function primarily scans the disk for file structure.
// Settings are merged in getModelsFromCacheOrDisk.
async function scanDiskForModelsAndCache() {
    console.log('[main.js] Starting disk scan for models...');
    const localBaseMediaDir = getBaseMediaDirectory();
    if (!localBaseMediaDir) {
      console.warn('[main.js] Base media directory not set. Skipping disk scan.');
      return [];
    }
    console.log(`[main.js] Scanning disk with base directory: ${localBaseMediaDir}`);
    const models = [];
    try {
      if (!fs.existsSync(localBaseMediaDir)) { // Sync check is okay for pre-condition
        console.error(`[main.js] Base media directory not found: ${localBaseMediaDir}`);
        return []; 
      }
      const modelFolderDirents = await fsp.readdir(localBaseMediaDir, { withFileTypes: true });
      const modelFolders = modelFolderDirents
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const modelFolderName of modelFolders) {
        const modelFolderPath = path.join(localBaseMediaDir, modelFolderName);
        const mediaFilesInModel = await findAllMediaFiles(modelFolderPath); // Await the async call
        if (mediaFilesInModel.length > 0) {
          // Default settings are applied later when merging
          models.push({ 
            name: modelFolderName, 
            textures: mediaFilesInModel 
            // isRandom and isSelectedForGlobal will be merged by getModelsFromCacheOrDisk
          });
        }
      }
    } catch (error) {
        console.error(`[main.js] Error scanning disk for models:`, error);
        return []; 
    }
    
    if (db) {
      try {
        // Cache only the structural model data; settings are separate in their own table.
        // We map to ensure only structural data is cached.
        const structuralModels = models.map(m => ({ name: m.name, textures: m.textures }));
        const stmt = db.prepare(`INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`);
        stmt.run(FILE_INDEX_CACHE_KEY, JSON.stringify(structuralModels), new Date().toISOString());
        console.log('[main.js] File index (structural data) successfully scanned and cached in SQLite.');
      } catch (dbError) {
        console.error('[main.js] Error caching file index to SQLite:', dbError);
      }
    }
    return models; // Returns models without settings merged yet at this stage.
  }

  // This function retrieves models (from cache or disk) and then merges settings.
  async function getModelsFromCacheOrDisk() {
    let modelsData; // This will hold the array of { name, textures }
    if (db) {
      try {
        const stmt_cache = db.prepare(`SELECT cache_value FROM app_cache WHERE cache_key = ?`);
        const row = stmt_cache.get(FILE_INDEX_CACHE_KEY);
        if (row && row.cache_value) {
          console.log('[main.js] Loaded file index (structural data) from SQLite cache.');
          modelsData = JSON.parse(row.cache_value);
        } else {
          console.log('[main.js] No file index cache found in SQLite. Scanning disk for structure...');
          // scanDiskForModelsAndCache returns structure, caches it, then we proceed to merge settings
          modelsData = await scanDiskForModelsAndCache(); 
        }
      } catch (dbError) {
        console.error('[main.js] Error reading file index from SQLite cache. Scanning disk for structure...', dbError);
        modelsData = await scanDiskForModelsAndCache();
      }
    } else {
      console.warn('[main.js] SQLite DB not available for caching. Scanning disk directly for structure.');
      modelsData = await scanDiskForModelsAndCache();
    }

    if (!modelsData || modelsData.length === 0) return [];

    // Fetch all model settings at once for efficiency
    let allModelSettings = {};
    if (db) {
        try {
            const stmt_all_settings = db.prepare('SELECT model_name, is_random, is_selected_for_global FROM model_settings');
            const settingsRows = stmt_all_settings.all();
            settingsRows.forEach(row => {
                allModelSettings[row.model_name] = {
                    isRandom: Boolean(row.is_random), // Ensure boolean type
                    isSelectedForGlobal: Boolean(row.is_selected_for_global) // Ensure boolean type
                };
            });
        } catch (dbError) {
            console.error('[main.js] Error fetching all model settings in getModelsFromCacheOrDisk:', dbError);
        }
    }
    // Merge settings into models
    return modelsData.map(model => {
        const settings = allModelSettings[model.name];
        return {
            ...model, // Spreads { name, textures }
            isRandom: settings ? settings.isRandom : false, // Default false if no record
            isSelectedForGlobal: settings ? settings.isSelectedForGlobal : true // Default true if no record
        };
    });
  }

  // New internal function to construct full model objects
  async function constructModelsWithSettingsAndCounts() {
    if (!db) {
        console.warn('[main.js constructModelsWithSettingsAndCounts] SQLite DB not available. Attempting disk scan and returning models with default settings and zero view counts.');
        const modelsFromDisk = await getModelsFromCacheOrDisk(); // This will scan disk if cache is empty and merge default settings.
        return modelsFromDisk.map(model => ({
            ...model, // model already has isRandom, isSelectedForGlobal from getModelsFromCacheOrDisk
            textures: model.textures.map(texture => ({ ...texture, viewCount: 0 }))
        }));
    }

    const models = await getModelsFromCacheOrDisk(); // Gets models with settings (isRandom, isSelectedForGlobal) merged
    if (!models || models.length === 0) {
        console.log('[main.js constructModelsWithSettingsAndCounts] No models found from cache or disk.');
        return [];
    }

    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path));
    const viewCountsMap = await getMediaViewCountsLogicSQLite(allFilePaths);
    
    // Merge view counts into the models that already have settings
    return models.map(model => ({
        ...model,
        textures: model.textures.map(texture => ({ ...texture, viewCount: viewCountsMap[texture.path] || 0 }))
    }));
  }
  
  // getModelsWithViewCounts will now use the enhanced getModelsFromCacheOrDisk
  // which handles merging of individual model settings.
  ipcMain.handle('get-models-with-view-counts', async () => {
    console.log('[main.js] ipcMain.handle("get-models-with-view-counts") called, delegating to constructModelsWithSettingsAndCounts.');
    return await constructModelsWithSettingsAndCounts();
  });

  ipcMain.handle('reindex-media-library', async () => {
    console.log('[main.js] Re-indexing media library requested...');
    // 1. Scan disk to update the structural cache (FILE_INDEX_CACHE_KEY)
    await scanDiskForModelsAndCache(); 
    // 2. Then, construct the full models list with settings and view counts.
    console.log('[main.js reindex-media-library] Disk scan complete. Now constructing models with settings and counts...');
    const modelsWithSettingsAndCounts = await constructModelsWithSettingsAndCounts();
    console.log('[main.js reindex-media-library] Successfully constructed models after re-index.');
    return modelsWithSettingsAndCounts;
  });

  ipcMain.handle('update-model-settings', async (event, { modelName, isRandom, isSelectedForGlobal }) => {
    if (!db) {
        console.error('[main.js] Database not available for update-model-settings.');
        return { success: false, error: 'Database not available' };
    }
    try {
        // console.log(`[main.js] update-model-settings: modelName=${modelName}, isRandom=${isRandom} (type: ${typeof isRandom}), isSelectedForGlobal=${isSelectedForGlobal} (type: ${typeof isSelectedForGlobal})`);
        const stmt = db.prepare(`
            INSERT INTO model_settings (model_name, is_random, is_selected_for_global)
            VALUES (?, ?, ?)
            ON CONFLICT(model_name) DO UPDATE SET
            is_random = excluded.is_random,
            is_selected_for_global = excluded.is_selected_for_global;
        `);
        stmt.run(modelName, isRandom, isSelectedForGlobal); // better-sqlite3 handles JS booleans to 0/1
        // console.log(`[main.js] Successfully updated/inserted settings for ${modelName}`);
        return { success: true };
    } catch (error) {
        console.error(`[main.js] Error updating model settings for ${modelName} in SQLite:`, error);
        return { success: false, error: error.message };
    }
  });

  ipcMain.handle('set-base-media-directory', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
        console.warn('[main.js set-base-media-directory] No focused window to show dialog.');
        return { status: 'error', message: 'No focused window' };
    }
    try {
        const result = await dialog.showOpenDialog(focusedWindow, { properties: ['openDirectory'] });
        if (result.canceled || result.filePaths.length === 0) {
            console.log('[main.js] Directory selection canceled.');
            return { status: 'canceled' };
        }
        const selectedDirectory = result.filePaths[0];
        await saveSettings({ baseMediaDirectory: selectedDirectory });
        // Optionally, trigger a re-index or notify renderer to suggest it
        // For now, just confirm success
        return { status: 'success', path: selectedDirectory };
    } catch (error) {
        console.error('[main.js] Error in set-base-media-directory:', error);
        return { status: 'error', message: error.message };
    }
  });

  ipcMain.handle('get-current-base-media-directory', () => {
    return getBaseMediaDirectory();
  });

  win.loadFile('index.html')
    .then(() => { 
      console.log('[main.js] index.html loaded successfully.'); 
      // win.webContents.openDevTools(); // This line is now commented out
    })
    .catch(err => console.error('[main.js] FAILED to load index.html:', err));
}

app.whenReady().then(async () => { // Make this async
  console.log('[main.js] app.whenReady() resolved.'); 
  await loadSettings(); // Load settings on startup

  protocol.registerFileProtocol(CUSTOM_PROTOCOL_SCHEME, (request) => {
    let pathPart = request.url.substring(`${CUSTOM_PROTOCOL_SCHEME}://`.length);
    const queryParamIndex = pathPart.indexOf('?');
    if (queryParamIndex !== -1) pathPart = pathPart.substring(0, queryParamIndex);
    const decodedPath = decodeURIComponent(pathPart); 
    const normalizedDecodedPath = path.normalize(decodedPath);
    const absolutePath = path.resolve(normalizedDecodedPath); // Ensure path is absolute

    const localAllowedBaseDir = getBaseMediaDirectory();
    if (!localAllowedBaseDir) {
      console.error(`[main.js Custom Protocol] Base directory not configured. Cannot serve ${absolutePath}`);
      return { error: -10 }; // net::ERR_ACCESS_DENIED or similar generic error
    }
    
    // Ensure normalizedAllowedBaseDir is also absolute for comparison
    const normalizedAllowedBaseDir = path.resolve(localAllowedBaseDir); 

    if (absolutePath.startsWith(normalizedAllowedBaseDir) && fs.existsSync(absolutePath)) {
      console.log(`[main.js Custom Protocol] Serving file: ${normalizedDecodedPath} (Normalized) for URL: ${request.url}`);
      console.log(`[main.js Custom Protocol] Resolved absolute path for serving: ${absolutePath}`);
      return { path: absolutePath };
    } else {
      if (!absolutePath.startsWith(normalizedAllowedBaseDir)) {
        console.error(`[main.js Custom Protocol] DENIED access to: ${absolutePath} (Path is outside allowed base directory ${normalizedAllowedBaseDir})`);
      } else {
        console.error(`[main.js Custom Protocol] File NOT FOUND: ${absolutePath} (Original URL: ${request.url}, Normalized Decoded: ${normalizedDecodedPath})`);
      }
      return { error: -6 }; // net::ERR_FILE_NOT_FOUND
    }
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
const ALL_SUPPORTED_EXTENSIONS = [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];

async function findAllMediaFiles(directoryPath, mediaFilesList = []) {
  try {
    const items = await fsp.readdir(directoryPath, { withFileTypes: true }); // Use fsp
    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        await findAllMediaFiles(fullPath, mediaFilesList); // Await recursive call
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
console.log('[main.js] Script finished initial execution.');
