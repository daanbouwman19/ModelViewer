import { app, ipcMain, BrowserWindow, dialog } from "electron";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import { Worker } from "worker_threads";
import http from "http";
import ffmpegPath from "ffmpeg-static";
import fs$1 from "fs";
import os from "os";
import { execa } from "execa";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const MAX_DATA_URL_SIZE_MB = 50;
const FILE_INDEX_CACHE_KEY = "file_index_json";
const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg"
];
const SUPPORTED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".avi",
  ".mkv"
];
const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS
];
let dbWorker = null;
let isTerminating = false;
let messageIdCounter = 0;
const pendingMessages = /* @__PURE__ */ new Map();
let operationTimeout = 3e4;
function sendMessageToWorker(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!dbWorker) {
      return reject(new Error("Database worker not initialized"));
    }
    const id = messageIdCounter++;
    const timeoutId = setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        reject(new Error(`Database operation timed out: ${type}`));
      }
    }, operationTimeout);
    pendingMessages.set(id, { resolve, reject, timeoutId });
    try {
      dbWorker.postMessage({ id, type, payload });
    } catch (error) {
      console.error(
        `[database.js] Error posting message to worker: ${error.message}`
      );
      clearTimeout(timeoutId);
      pendingMessages.delete(id);
      reject(error);
    }
  });
}
async function initDatabase$1(userDbPath, workerScriptPath, workerOptions) {
  if (dbWorker) {
    console.log(
      "[database.js] Terminating existing database worker before re-init."
    );
    isTerminating = true;
    await dbWorker.terminate();
    dbWorker = null;
  }
  isTerminating = false;
  try {
    dbWorker = new Worker(workerScriptPath, workerOptions);
    dbWorker.on(
      "message",
      (message) => {
        const { id, result } = message;
        const pending = pendingMessages.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingMessages.delete(id);
          if (result.success) {
            pending.resolve(result.data);
          } else {
            pending.reject(new Error(result.error || "Unknown database error"));
          }
        }
      }
    );
    dbWorker.on("error", (error) => {
      console.error("[database.js] Database worker error:", error);
      for (const [id, pending] of pendingMessages.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
        pendingMessages.delete(id);
      }
    });
    dbWorker.on("exit", (code) => {
      if (code !== 0 && !isTerminating) {
        console.error(
          `[database.js] Database worker exited unexpectedly with code ${code}`
        );
      }
      for (const [id, pending] of pendingMessages.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("Database worker exited unexpectedly"));
        pendingMessages.delete(id);
      }
    });
    await sendMessageToWorker("init", { dbPath: userDbPath });
    if (process.env.NODE_ENV !== "test") {
      console.log("[database.js] Database worker initialized successfully.");
    }
  } catch (error) {
    console.error(
      "[database.js] CRITICAL ERROR: Failed to initialize database worker:",
      error
    );
    dbWorker = null;
    throw error;
  }
}
async function recordMediaView(filePath) {
  try {
    await sendMessageToWorker("recordMediaView", { filePath });
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[database.js] Error recording media view: ${error.message}`
      );
    }
  }
}
async function getMediaViewCounts(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    return {};
  }
  try {
    return await sendMessageToWorker(
      "getMediaViewCounts",
      { filePaths }
    );
  } catch (error) {
    console.error("[database.js] Error fetching view counts:", error);
    return {};
  }
}
async function cacheAlbums(albums) {
  try {
    await sendMessageToWorker("cacheAlbums", {
      cacheKey: FILE_INDEX_CACHE_KEY,
      albums
    });
  } catch (error) {
    console.error("[database.js] Error caching albums:", error);
  }
}
async function getCachedAlbums() {
  try {
    return await sendMessageToWorker("getCachedAlbums", {
      cacheKey: FILE_INDEX_CACHE_KEY
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[database.js] Error getting cached albums: ${error.message}`
      );
    }
    return null;
  }
}
async function closeDatabase() {
  if (dbWorker) {
    isTerminating = true;
    try {
      await sendMessageToWorker("close");
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[database.js] Warning during worker shutdown:", error);
      }
    } finally {
      try {
        if (dbWorker) {
          await dbWorker.terminate();
        }
      } catch (error) {
        console.error("[database.js] Error closing database worker:", error);
      } finally {
        dbWorker = null;
        isTerminating = false;
        console.log("[database.js] Database worker terminated.");
      }
    }
  }
}
async function addMediaDirectory(directoryPath) {
  try {
    await sendMessageToWorker("addMediaDirectory", { directoryPath });
  } catch (error) {
    console.error(
      `[database.js] Error adding media directory '${directoryPath}':`,
      error
    );
    throw error;
  }
}
async function getMediaDirectories() {
  try {
    const directories = await sendMessageToWorker(
      "getMediaDirectories"
    );
    return directories || [];
  } catch (error) {
    console.error("[database.js] Error getting media directories:", error);
    return [];
  }
}
async function removeMediaDirectory(directoryPath) {
  try {
    await sendMessageToWorker("removeMediaDirectory", { directoryPath });
  } catch (error) {
    console.error(
      `[database.js] Error removing media directory '${directoryPath}':`,
      error
    );
    throw error;
  }
}
async function setDirectoryActiveState(directoryPath, isActive) {
  try {
    await sendMessageToWorker("setDirectoryActiveState", {
      directoryPath,
      isActive
    });
  } catch (error) {
    console.error(
      `[database.js] Error setting active state for '${directoryPath}':`,
      error
    );
    throw error;
  }
}
async function initDatabase() {
  const dbPath = path.join(
    app.getPath("userData"),
    "media_slideshow_stats.sqlite"
  );
  let workerPath;
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (app.isPackaged) {
    workerPath = path.join(__dirname, "database-worker.js");
  } else if (isTest) {
    const pathModule = await import("path");
    workerPath = pathModule.resolve(
      process.cwd(),
      "src/core/database-worker.ts"
    );
  } else {
    workerPath = new URL("./database-worker.js", import.meta.url);
  }
  return initDatabase$1(dbPath, workerPath);
}
async function scanDirectoryRecursive(directoryPath) {
  try {
    const items = await fs.readdir(directoryPath, { withFileTypes: true });
    const textures = [];
    const childrenPromises = [];
    for (const item of items) {
      const fullPath = path.join(directoryPath, item.name);
      if (item.isDirectory()) {
        childrenPromises.push(scanDirectoryRecursive(fullPath));
      } else if (item.isFile()) {
        const fileExtension = path.extname(item.name).toLowerCase();
        if (ALL_SUPPORTED_EXTENSIONS.includes(fileExtension)) {
          textures.push({ name: item.name, path: fullPath });
        }
      }
    }
    const children = (await Promise.all(childrenPromises)).filter(
      (child) => child !== null
    );
    if (textures.length > 0 || children.length > 0) {
      return {
        name: path.basename(directoryPath),
        textures,
        children
      };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error(
        `[media-scanner.js] Error reading directory ${directoryPath}:`,
        err.message
      );
    }
  }
  return null;
}
async function performFullMediaScan(baseMediaDirectories) {
  if (process.env.NODE_ENV !== "test") {
    console.log(
      `[media-scanner.js] Starting disk scan in directories:`,
      baseMediaDirectories
    );
  }
  try {
    const scanPromises = baseMediaDirectories.map(async (baseDir) => {
      try {
        await fs.access(baseDir);
        return scanDirectoryRecursive(baseDir);
      } catch (dirError) {
        if (process.env.NODE_ENV !== "test") {
          console.error(
            `[media-scanner.js] Error accessing or scanning directory ${baseDir}: ${dirError.message}`
          );
        }
        return null;
      }
    });
    const result = (await Promise.all(scanPromises)).filter(
      (album) => album !== null
    );
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `[media-scanner.js] Found ${result.length} root albums during scan.`
      );
    }
    return result;
  } catch (e) {
    if (process.env.NODE_ENV !== "test") {
      console.error(`[media-scanner.js] Error scanning disk for albums:`, e);
    }
    return [];
  }
}
async function scanDiskForAlbumsAndCache() {
  const allDirectories = await getMediaDirectories();
  const activeDirectories = allDirectories.filter((dir) => dir.isActive).map((dir) => dir.path);
  if (!activeDirectories || activeDirectories.length === 0) {
    await cacheAlbums([]);
    return [];
  }
  const albums = await performFullMediaScan(activeDirectories);
  await cacheAlbums(albums || []);
  return albums || [];
}
async function getAlbumsFromCacheOrDisk() {
  const albums = await getCachedAlbums();
  if (albums && albums.length > 0) {
    return albums;
  }
  return scanDiskForAlbumsAndCache();
}
async function getAlbumsWithViewCountsAfterScan() {
  const albums = await scanDiskForAlbumsAndCache();
  if (!albums || albums.length === 0) {
    return [];
  }
  const allFilePaths = albums.flatMap(
    (album) => album.textures.map((texture) => texture.path)
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);
  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0
    }))
  }));
}
async function getAlbumsWithViewCounts() {
  const albums = await getAlbumsFromCacheOrDisk();
  if (!albums || albums.length === 0) {
    return [];
  }
  const allFilePaths = albums.flatMap(
    (album) => album.textures.map((texture) => texture.path)
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);
  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0
    }))
  }));
}
function getMimeType$1(filePath) {
  const extension = path.extname(filePath).substring(1).toLowerCase();
  if (SUPPORTED_IMAGE_EXTENSIONS.includes(`.${extension}`)) {
    return `image/${extension === "jpg" ? "jpeg" : extension}`;
  }
  if (SUPPORTED_VIDEO_EXTENSIONS.includes(`.${extension}`)) {
    switch (extension) {
      case "mp4":
        return "video/mp4";
      case "webm":
        return "video/webm";
      case "ogg":
        return "video/ogg";
      case "mov":
        return "video/quicktime";
      case "avi":
        return "video/x-msvideo";
      case "mkv":
        return "video/x-matroska";
      default:
        return `video/${extension}`;
    }
  }
  return "application/octet-stream";
}
function isPathAllowed(filePath, allowedDirectories) {
  const normalizedPath = path.resolve(filePath);
  return allowedDirectories.some((dir) => {
    const normalizedDir = path.resolve(dir.path);
    if (process.platform === "win32") {
      return normalizedPath.toLowerCase().startsWith(normalizedDir.toLowerCase() + path.sep) || normalizedPath.toLowerCase() === normalizedDir.toLowerCase();
    }
    return normalizedPath.startsWith(normalizedDir + path.sep) || normalizedPath === normalizedDir;
  });
}
async function serveMetadata(_req, res, filePath, ffmpegPath2) {
  if (!ffmpegPath2) {
    res.writeHead(500);
    return res.end("FFmpeg binary not found");
  }
  try {
    const allowedDirectories = await getMediaDirectories();
    if (!isPathAllowed(filePath, allowedDirectories)) {
      res.writeHead(403);
      return res.end("Access denied");
    }
  } catch (e) {
    console.error("[Metadata] Path validation error:", e);
    res.writeHead(500);
    return res.end("Internal Error");
  }
  const ffmpegProcess = spawn(ffmpegPath2, ["-i", filePath]);
  let stderrData = "";
  ffmpegProcess.stderr.on("data", (data) => {
    stderrData += data.toString();
  });
  ffmpegProcess.on("close", () => {
    const match = stderrData.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      const hours = parseFloat(match[1]);
      const minutes = parseFloat(match[2]);
      const seconds = parseFloat(match[3]);
      const duration = hours * 3600 + minutes * 60 + seconds;
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({ duration }));
    } else {
      res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Could not determine duration" }));
    }
  });
}
async function serveTranscode(req, res, filePath, startTime, ffmpegPath2) {
  try {
    const allowedDirectories = await getMediaDirectories();
    if (!isPathAllowed(filePath, allowedDirectories)) {
      res.writeHead(403);
      return res.end("Access denied");
    }
  } catch (e) {
    console.error("[Transcode] Path validation error:", e);
    res.writeHead(500);
    return res.end("Internal Error");
  }
  if (!ffmpegPath2) {
    res.writeHead(500);
    return res.end("FFmpeg binary not found");
  }
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Access-Control-Allow-Origin": "*"
  });
  const ffmpegArgs = [
    "-i",
    filePath,
    "-f",
    "mp4",
    "-vcodec",
    "libx264",
    "-acodec",
    "aac",
    "-movflags",
    "frag_keyframe+empty_moov",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p"
  ];
  if (startTime) {
    ffmpegArgs.unshift("-ss", startTime);
  }
  ffmpegArgs.push("pipe:1");
  const ffmpegProcess = spawn(ffmpegPath2, ffmpegArgs);
  ffmpegProcess.stdout.pipe(res);
  ffmpegProcess.on("error", (err) => {
    console.error("[Transcode] Spawn Error:", err);
  });
  req.on("close", () => {
    ffmpegProcess.kill("SIGKILL");
  });
}
async function serveThumbnail(_req, res, filePath, ffmpegPath2) {
  try {
    const allowedDirectories = await getMediaDirectories();
    if (!isPathAllowed(filePath, allowedDirectories)) {
      res.writeHead(403);
      return res.end("Access denied");
    }
  } catch {
    res.writeHead(500);
    return res.end("Internal Error");
  }
  if (!ffmpegPath2) {
    res.writeHead(500);
    return res.end("FFmpeg binary not found");
  }
  res.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000"
  });
  const ffmpegArgs = [
    "-ss",
    "1",
    "-i",
    filePath,
    "-frames:v",
    "1",
    "-f",
    "image2",
    "-q:v",
    "5",
    "pipe:1"
  ];
  const ffmpegProcess = spawn(ffmpegPath2, ffmpegArgs);
  ffmpegProcess.stdout.pipe(res);
}
async function serveStaticFile(req, res, filePath) {
  const normalizedFilePath = path.normalize(filePath);
  if (!fs$1.existsSync(normalizedFilePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("File not found.");
  }
  try {
    const allowedDirectories = await getMediaDirectories();
    if (!isPathAllowed(normalizedFilePath, allowedDirectories)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("Access denied.");
    }
  } catch {
    res.writeHead(500);
    return res.end("Internal server error.");
  }
  try {
    const stat = fs$1.statSync(normalizedFilePath);
    const totalSize = stat.size;
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
        return res.end("Requested range not satisfiable.");
      }
      const chunkSize = end - start + 1;
      const fileStream = fs$1.createReadStream(normalizedFilePath, {
        start,
        end
      });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": getMimeType$1(normalizedFilePath)
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": getMimeType$1(normalizedFilePath),
        "Accept-Ranges": "bytes"
      });
      fs$1.createReadStream(normalizedFilePath).pipe(res);
    }
  } catch (serverError) {
    console.error(
      `[MediaHandler] Error serving file ${normalizedFilePath}:`,
      serverError
    );
    res.writeHead(500);
    res.end("Server error.");
  }
}
function createMediaRequestHandler(options) {
  const { ffmpegPath: ffmpegPath2 } = options;
  return async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    const startUrl = `http://${req.headers.host || "localhost"}`;
    const parsedUrl = new URL(req.url, startUrl);
    const pathname = parsedUrl.pathname;
    if (pathname === "/video/metadata") {
      const filePath = parsedUrl.searchParams.get("file");
      if (!filePath) {
        res.writeHead(400);
        return res.end("Missing file parameter");
      }
      return serveMetadata(req, res, filePath, ffmpegPath2);
    }
    if (pathname === "/video/stream") {
      const filePath = parsedUrl.searchParams.get("file");
      const startTime = parsedUrl.searchParams.get("startTime");
      if (!filePath) {
        res.writeHead(400);
        return res.end("Missing file parameter");
      }
      return serveTranscode(req, res, filePath, startTime, ffmpegPath2);
    }
    if (pathname === "/video/thumbnail") {
      const filePath = parsedUrl.searchParams.get("file");
      if (!filePath) {
        res.writeHead(400);
        return res.end("Missing file parameter");
      }
      return serveThumbnail(req, res, filePath, ffmpegPath2);
    }
    const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));
    return serveStaticFile(req, res, requestedPath);
  };
}
let serverInstance = null;
let serverPort = 0;
const getMimeType = getMimeType$1;
function startLocalServer(onReadyCallback) {
  if (serverInstance) {
    console.warn("[local-server.js] Server already started. Ignoring request.");
    if (onReadyCallback && typeof onReadyCallback === "function") {
      onReadyCallback();
    }
    return;
  }
  const requestHandler = createMediaRequestHandler({
    ffmpegPath: ffmpegPath || null
  });
  serverInstance = http.createServer(requestHandler);
  serverInstance.listen(0, "127.0.0.1", () => {
    const address = serverInstance?.address();
    serverPort = address ? address.port : 0;
    console.log(
      `[local-server.js] Local media server started on http://localhost:${serverPort}`
    );
    if (process.env.NODE_ENV === "test") {
      serverInstance?.unref();
    }
    if (onReadyCallback && typeof onReadyCallback === "function") {
      onReadyCallback();
    }
  });
  serverInstance.on("error", (err) => {
    console.error("[local-server.js] Server Error:", err);
    serverInstance = null;
    serverPort = 0;
  });
}
function stopLocalServer(callback) {
  if (serverInstance) {
    serverInstance.close((err) => {
      if (err) {
        console.error("[local-server.js] Error stopping server:", err);
      } else {
        console.log("[local-server.js] Local media server stopped.");
      }
      serverInstance = null;
      serverPort = 0;
      if (callback && typeof callback === "function") {
        callback();
      }
    });
  } else if (callback && typeof callback === "function") {
    callback();
  }
}
function getServerPort() {
  return serverPort;
}
async function listDirectory(directoryPath) {
  if (!directoryPath || directoryPath === "ROOT") {
    return listDrives();
  }
  try {
    const items = await fs.readdir(directoryPath, { withFileTypes: true });
    const entries = items.map((item) => ({
      name: item.name,
      path: path.join(directoryPath, item.name),
      isDirectory: item.isDirectory()
    }));
    entries.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });
    return entries;
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error(
        `[file-system.ts] Error listing directory ${directoryPath}:`,
        error
      );
    }
    throw error;
  }
}
async function listDrives() {
  if (os.platform() !== "win32") {
    return [
      {
        name: "Root",
        path: "/",
        isDirectory: true
      }
    ];
  }
  try {
    const { stdout } = await execa("fsutil", ["fsinfo", "drives"]);
    const drivesLine = stdout.replace("Drives:", "").trim();
    const drives = drivesLine.split(/\s+/).filter((d) => d);
    return drives.map((drive) => ({
      name: drive.replace(/\\$/, ""),
      // "C:"
      path: drive,
      // "C:\" (fsutil returns with backslash)
      isDirectory: true
    }));
  } catch (error) {
    console.error("Failed to list drives:", error);
    return [
      {
        name: "C:",
        path: "C:\\",
        isDirectory: true
      }
    ];
  }
}
const isDev = !app.isPackaged;
let mainWindow = null;
ipcMain.handle(
  "load-file-as-data-url",
  async (_event, filePath, options = {}) => {
    try {
      if (!filePath) {
        return { type: "error", message: `File path is empty` };
      }
      try {
        await fs.access(filePath);
      } catch {
        return { type: "error", message: `File does not exist: ${filePath}` };
      }
      const currentServerPort = getServerPort();
      if (options.preferHttp && currentServerPort > 0) {
        const pathForUrl = filePath.replace(/\\/g, "/");
        return {
          type: "http-url",
          url: `http://localhost:${currentServerPort}/${pathForUrl}`
        };
      }
      const stats = await fs.stat(filePath);
      const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(
        path.extname(filePath).toLowerCase()
      );
      if (isVideo && stats.size > MAX_DATA_URL_SIZE_MB * 1024 * 1024) {
        if (currentServerPort === 0) {
          return {
            type: "error",
            message: "Local server not ready to stream large video."
          };
        }
        const pathForUrl = filePath.replace(/\\/g, "/");
        return {
          type: "http-url",
          url: `http://localhost:${currentServerPort}/${pathForUrl}`
        };
      }
      const mimeType = getMimeType(filePath);
      const fileBuffer = await fs.readFile(filePath);
      const dataURL = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
      return { type: "data-url", url: dataURL };
    } catch (error) {
      console.error(
        `[main.js] Error processing ${filePath} in load-file-as-data-url:`,
        error
      );
      return {
        type: "error",
        message: error.message || "Unknown error processing file."
      };
    }
  }
);
ipcMain.handle(
  "record-media-view",
  async (_event, filePath) => {
    await recordMediaView(filePath);
  }
);
ipcMain.handle(
  "get-media-view-counts",
  async (_event, filePaths) => {
    return getMediaViewCounts(filePaths);
  }
);
ipcMain.handle("get-albums-with-view-counts", async () => {
  return getAlbumsWithViewCounts();
});
ipcMain.handle(
  "add-media-directory",
  async (_event, targetPath) => {
    if (targetPath) {
      try {
        try {
          await fs.access(targetPath);
        } catch {
          return null;
        }
        await addMediaDirectory(targetPath);
        return targetPath;
      } catch (e) {
        console.error("Failed to add directory by path", e);
        return null;
      }
    }
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Media Directory"
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return null;
    }
    const newPath = filePaths[0];
    await addMediaDirectory(newPath);
    return newPath;
  }
);
ipcMain.handle("reindex-media-library", async () => {
  return getAlbumsWithViewCountsAfterScan();
});
ipcMain.handle(
  "remove-media-directory",
  async (_event, directoryPath) => {
    await removeMediaDirectory(directoryPath);
  }
);
ipcMain.handle(
  "set-directory-active-state",
  async (_event, { directoryPath, isActive }) => {
    await setDirectoryActiveState(directoryPath, isActive);
  }
);
ipcMain.handle("get-media-directories", async () => {
  return getMediaDirectories();
});
ipcMain.handle("get-supported-extensions", () => {
  return {
    images: SUPPORTED_IMAGE_EXTENSIONS,
    videos: SUPPORTED_VIDEO_EXTENSIONS,
    all: ALL_SUPPORTED_EXTENSIONS
  };
});
ipcMain.handle("get-server-port", () => {
  return getServerPort();
});
ipcMain.handle(
  "open-in-vlc",
  async (_event, filePath) => {
    const platform = process.platform;
    let vlcPath = null;
    if (platform === "win32") {
      const commonPaths = [
        "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
        "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"
      ];
      for (const p of commonPaths) {
        try {
          await fs.access(p);
          vlcPath = p;
          break;
        } catch {
        }
      }
    } else if (platform === "darwin") {
      const macPath = "/Applications/VLC.app/Contents/MacOS/VLC";
      try {
        await fs.access(macPath);
        vlcPath = macPath;
      } catch {
        vlcPath = "vlc";
      }
    } else {
      vlcPath = "vlc";
    }
    if (!vlcPath) {
      return {
        success: false,
        message: "VLC Media Player not found. Please ensure it is installed in the default location."
      };
    }
    try {
      const child = spawn(vlcPath, [filePath], {
        detached: true,
        stdio: "ignore"
      });
      child.on("error", (err) => {
        console.error("[main.js] Error launching VLC (async):", err);
      });
      child.unref();
      return { success: true };
    } catch (error) {
      console.error("[main.js] Error launching VLC:", error);
      return {
        success: false,
        message: `Failed to launch VLC: ${error.message}`
      };
    }
  }
);
ipcMain.handle(
  "list-directory",
  async (_event, directoryPath) => {
    return listDirectory(directoryPath);
  }
);
ipcMain.handle(
  "get-parent-directory",
  async (_event, targetPath) => {
    if (!targetPath) return null;
    const parent = path.dirname(targetPath);
    if (parent === targetPath) return null;
    return parent;
  }
);
function createWindow() {
  const preloadPath = path.join(__dirname, "../preload/preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (isDev) {
    const devServerURL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainWindow.loadURL(devServerURL).catch(
      (err) => console.error("[main.js] Failed to load development server:", err)
    );
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html")).catch(
      (err) => console.error("[main.js] Failed to load index.html:", err)
    );
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
app.commandLine.appendSwitch(
  "platform-media-player-enable-hevc-support-for-win10"
);
app.on("ready", async () => {
  try {
    await initDatabase();
    startLocalServer(createWindow);
  } catch (error) {
    console.error(
      "[main.js] Database initialization failed during app ready sequence:",
      error
    );
    app.quit();
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (getServerPort() > 0) {
      createWindow();
    } else {
      startLocalServer(createWindow);
    }
  }
});
app.on("will-quit", () => {
  stopLocalServer(() => {
    console.log("[main.js] Local server stopped during will-quit.");
  });
  closeDatabase();
});
