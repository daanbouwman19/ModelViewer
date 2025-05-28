console.log('[main.js] Script started. Electron main process initializing...'); 

const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs'); 
const crypto = require('crypto'); 

const Database = require('better-sqlite3');
let db;

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
    console.log('[main.js] SQLite database initialized and tables ensured.');
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

  async function scanDiskForModelsAndCache() {
    console.log('[main.js] Starting disk scan for models...');
    const baseMediaDirectory = 'D:\\test';
    const models = [];
    try {
      if (!fs.existsSync(baseMediaDirectory)) {
        console.error(`[main.js] Base media directory not found: ${baseMediaDirectory}`);
        return []; 
      }
      const modelFolders = fs.readdirSync(baseMediaDirectory, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const modelFolderName of modelFolders) {
        const modelFolderPath = path.join(baseMediaDirectory, modelFolderName);
        const mediaFilesInModel = findAllMediaFiles(modelFolderPath);
        if (mediaFilesInModel.length > 0) {
          models.push({ name: modelFolderName, textures: mediaFilesInModel });
        }
      }
    } catch (error) {
        console.error(`[main.js] Error scanning disk for models:`, error);
        return []; 
    }
    
    if (db) {
      try {
        const stmt = db.prepare(`INSERT OR REPLACE INTO app_cache (cache_key, cache_value, last_updated) VALUES (?, ?, ?)`);
        stmt.run(FILE_INDEX_CACHE_KEY, JSON.stringify(models), new Date().toISOString());
        console.log('[main.js] File index successfully scanned and cached in SQLite.');
      } catch (dbError) {
        console.error('[main.js] Error caching file index to SQLite:', dbError);
      }
    }
    return models;
  }

  async function getModelsFromCacheOrDisk() {
    if (db) {
      try {
        const stmt = db.prepare(`SELECT cache_value FROM app_cache WHERE cache_key = ?`);
        const row = stmt.get(FILE_INDEX_CACHE_KEY);
        if (row && row.cache_value) {
          console.log('[main.js] Loaded file index from SQLite cache.');
          return JSON.parse(row.cache_value);
        } else {
          console.log('[main.js] No file index cache found in SQLite. Scanning disk...');
          return await scanDiskForModelsAndCache();
        }
      } catch (dbError) {
        console.error('[main.js] Error reading file index from SQLite cache. Scanning disk...', dbError);
        return await scanDiskForModelsAndCache();
      }
    } else {
      console.warn('[main.js] SQLite DB not available for caching. Scanning disk directly.');
      return await scanDiskForModelsAndCache(); 
    }
  }
  
  ipcMain.handle('get-models-with-view-counts', async () => {
    if (!db) {
        console.warn('[main.js] SQLite DB not available. Attempting disk scan without view counts or caching.');
        const modelsFromDisk = await scanDiskForModelsAndCache(); 
        return modelsFromDisk.map(model => ({
            ...model,
            textures: model.textures.map(texture => ({ ...texture, viewCount: 0 }))
        }));
    }
    console.log('[main.js] ipcMain.handle("get-models-with-view-counts") called.');
    const models = await getModelsFromCacheOrDisk(); 
    if (!models || models.length === 0) {
        console.log('[main.js] No models found from cache or disk for get-models-with-view-counts.');
        return [];
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path));
    const viewCountsMap = await getMediaViewCountsLogicSQLite(allFilePaths);
    return models.map(model => ({
        ...model,
        textures: model.textures.map(texture => ({ ...texture, viewCount: viewCountsMap[texture.path] || 0 }))
    }));
  });

  ipcMain.handle('reindex-media-library', async () => {
    console.log('[main.js] Re-indexing media library requested...');
    const models = await scanDiskForModelsAndCache(); 
    if (!models || models.length === 0) return [];
    if (!db) { 
        return models.map(model => ({...model, textures: model.textures.map(t => ({...t, viewCount: 0}))}));
    }
    const allFilePaths = models.flatMap(model => model.textures.map(texture => texture.path));
    const viewCountsMap = await getMediaViewCountsLogicSQLite(allFilePaths);
    return models.map(model => ({
        ...model,
        textures: model.textures.map(texture => ({ ...texture, viewCount: viewCountsMap[texture.path] || 0 }))
    }));
  });

  win.loadFile('index.html')
    .then(() => { 
      console.log('[main.js] index.html loaded successfully.'); 
      // win.webContents.openDevTools(); // This line is now commented out
    })
    .catch(err => console.error('[main.js] FAILED to load index.html:', err));
}

app.whenReady().then(() => {
  console.log('[main.js] app.whenReady() resolved.'); 
  // Updated protocol handler signature
  protocol.registerFileProtocol(CUSTOM_PROTOCOL_SCHEME, (request) => {
    let pathPart = request.url.substring(`${CUSTOM_PROTOCOL_SCHEME}://`.length);
    const queryParamIndex = pathPart.indexOf('?');
    if (queryParamIndex !== -1) pathPart = pathPart.substring(0, queryParamIndex);
    const decodedPath = decodeURIComponent(pathPart); 
    const allowedBaseDirectory = path.normalize('D:\\test');
    const normalizedDecodedPath = path.normalize(decodedPath);

    if (normalizedDecodedPath.startsWith(allowedBaseDirectory) && fs.existsSync(normalizedDecodedPath)) {
      console.log(`[main.js Custom Protocol] Serving file: ${normalizedDecodedPath} for URL: ${request.url}`);
      return { path: normalizedDecodedPath }; // Direct return
    } else {
      if (!normalizedDecodedPath.startsWith(allowedBaseDirectory)) {
        console.error(`[main.js Custom Protocol] DENIED access to: ${normalizedDecodedPath} (Path is outside allowed base directory ${allowedBaseDirectory})`);
      } else {
        console.error(`[main.js Custom Protocol] File NOT FOUND: ${normalizedDecodedPath} (Original URL: ${request.url})`);
      }
      return { error: -6 }; // Direct return for error (net::ERR_FILE_NOT_FOUND)
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
const ALL_SUPPORTED_EXTENSIONS = [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];

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
console.log('[main.js] Script finished initial execution.');
