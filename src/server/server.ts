/**
 * @file Node.js Web Server for the Hosted Web App.
 * This server replaces Electron's main process for the web deployment.
 * It serves the frontend assets and provides the API endpoints mirroring IMediaBackend.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import {
  initDatabase,
  addMediaDirectory,
  getMediaDirectories,
  removeMediaDirectory,
  setDirectoryActiveState,
  recordMediaView,
  getMediaViewCounts,
  upsertMetadata,
  getMetadata,
  createSmartPlaylist,
  getSmartPlaylists,
  deleteSmartPlaylist,
  updateSmartPlaylist,
  setRating,
  getAllMetadataAndStats,
} from '../core/database';
import {
  getAlbumsWithViewCounts,
  getAlbumsWithViewCountsAfterScan,
} from '../core/media-service';
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
} from '../core/constants';
import { listDirectory } from '../core/file-system';
import { authorizeFilePath } from '../core/security';
import { initializeDriveCacheManager } from '../main/drive-cache-manager';
import { generateAuthUrl, authenticateWithCode } from '../main/google-auth';
import {
  getDriveClient,
  listDriveDirectory,
  getDriveParent,
} from '../main/google-drive-service';
import {
  serveMetadata,
  serveTranscodedStream,
  serveRawStream,
  serveThumbnail,
} from '../core/media-handler';
import { createMediaSource } from '../core/media-source';
import ffmpegStatic from 'ffmpeg-static';

// Check if we are running in dev mode or production
const isDev = process.env.NODE_ENV !== 'production';

// Derive __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DB_PATH = path.join(process.cwd(), 'media-library.db');

// In dev (tsx), the worker is TS. In prod (build), it is JS adjacent to this file.
const WORKER_PATH = isDev
  ? path.join(__dirname, '../core/database-worker.ts')
  : path.join(__dirname, 'worker.js');

const PORT = 3000;
const CACHE_DIR = path.join(process.cwd(), 'cache', 'thumbnails');
const DRIVE_CACHE_DIR = path.join(process.cwd(), 'cache', 'drive');

export async function createApp() {
  const app = express();

  // Middleware
  // Set security headers
  // TODO: [SECURITY] Configure and enable Content-Security-Policy.
  // It is currently disabled to ensure compatibility with external fonts and Vue,
  // but it's a crucial security feature against XSS attacks.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // Restrict CORS to development server only, or disable in production (Same-Origin)
  const corsOptions = {
    origin: isDev
      ? process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
      : false,
  };
  app.use(cors(corsOptions));
  app.use(express.json());

  // Initialize Database
  console.log(
    `Initializing database at ${DB_PATH} using worker ${WORKER_PATH}`,
  );

  const workerOptions = isDev
    ? {
        execArgv: ['--import', 'tsx/esm'],
      }
    : undefined;

  try {
    await initDatabase(DB_PATH, WORKER_PATH, workerOptions);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(DRIVE_CACHE_DIR, { recursive: true });

    // Initialize Drive Cache Manager
    initializeDriveCacheManager(DRIVE_CACHE_DIR);
    console.log(
      `Initialized DriveCacheManager with cache dir: ${DRIVE_CACHE_DIR}`,
    );
  } catch (e) {
    console.error('Failed to initialize database:', e);
    process.exit(1);
  }

  // --- API Routes (Mirroring IMediaBackend) ---

  // Albums
  app.get('/api/albums', async (_req, res) => {
    try {
      const albums = await getAlbumsWithViewCounts();
      res.json(albums);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch albums' });
    }
  });

  app.post('/api/albums/reindex', async (_req, res) => {
    try {
      const albums = await getAlbumsWithViewCountsAfterScan();
      res.json(albums);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to reindex' });
    }
  });

  // Media Views
  app.post('/api/media/view', async (req, res) => {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).send('Missing filePath');

    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed)
      return res.status(403).send(auth.message || 'Access denied');

    await recordMediaView(filePath);
    res.sendStatus(200);
  });

  app.post('/api/media/views', async (req, res) => {
    const { filePaths } = req.body;
    if (!Array.isArray(filePaths))
      return res.status(400).send('Invalid filePaths');

    // Filter out unauthorized paths to prevent probing
    const allowedPaths: string[] = [];
    for (const p of filePaths) {
      const auth = await authorizeFilePath(p);
      if (auth.isAllowed) {
        allowedPaths.push(p);
      }
    }

    const counts = await getMediaViewCounts(allowedPaths);
    res.json(counts);
  });

  // Smart Playlists
  app.get('/api/smart-playlists', async (_req, res) => {
    try {
      const playlists = await getSmartPlaylists();
      res.json(playlists);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch smart playlists' });
    }
  });

  app.post('/api/smart-playlists', async (req, res) => {
    const { name, criteria } = req.body;
    if (!name || !criteria)
      return res.status(400).send('Missing name or criteria');
    try {
      const result = await createSmartPlaylist(name, criteria);
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to create smart playlist' });
    }
  });

  app.put('/api/smart-playlists/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, criteria } = req.body;
    if (isNaN(id) || !name || !criteria)
      return res.status(400).send('Invalid arguments');
    try {
      await updateSmartPlaylist(id, name, criteria);
      res.sendStatus(200);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to update smart playlist' });
    }
  });

  app.delete('/api/smart-playlists/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send('Invalid id');
    try {
      await deleteSmartPlaylist(id);
      res.sendStatus(200);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to delete smart playlist' });
    }
  });

  // Media Operations
  app.post('/api/media/rate', async (req, res) => {
    const { filePath, rating } = req.body;
    if (!filePath || typeof rating !== 'number')
      return res.status(400).send('Missing filePath or rating');
    try {
      await setRating(filePath, rating);
      res.sendStatus(200);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to set rating' });
    }
  });

  app.get('/api/media/all', async (_req, res) => {
    try {
      const items = await getAllMetadataAndStats();
      res.json(items);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get all media' });
    }
  });

  app.post('/api/media/metadata', async (req, res) => {
    const { filePath, metadata } = req.body;
    if (!filePath || !metadata)
      return res.status(400).send('Missing arguments');
    try {
      await upsertMetadata(filePath, metadata);
      res.sendStatus(200);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to upsert metadata' });
    }
  });

  app.post('/api/media/metadata/batch', async (req, res) => {
    const { filePaths } = req.body;
    if (!Array.isArray(filePaths))
      return res.status(400).send('Invalid filePaths');
    try {
      const result = await getMetadata(filePaths);
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get metadata batch' });
    }
  });

  // Directories
  app.get('/api/directories', async (_req, res) => {
    const dirs = await getMediaDirectories();
    res.json(dirs);
  });

  app.post('/api/directories', async (req, res) => {
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).send('Missing path');
    try {
      try {
        await fs.stat(dirPath);
      } catch {
        return res.status(400).json({ error: 'Directory does not exist' });
      }
      await addMediaDirectory(dirPath);
      res.json(dirPath);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to add directory' });
    }
  });

  app.delete('/api/directories', async (req, res) => {
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).send('Missing path');
    try {
      await removeMediaDirectory(dirPath);
      res.sendStatus(200);
    } catch {
      res.status(500).json({ error: 'Failed to remove directory' });
    }
  });

  app.put('/api/directories/active', async (req, res) => {
    const { path: dirPath, isActive } = req.body;
    if (!dirPath) return res.status(400).send('Missing path');
    try {
      await setDirectoryActiveState(dirPath, isActive);
      res.sendStatus(200);
    } catch {
      res.status(500).json({ error: 'Failed to set active state' });
    }
  });

  // File System
  app.get('/api/fs/ls', async (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) return res.status(400).send('Missing path');
    try {
      const contents = await listDirectory(dirPath);
      res.json(contents);
    } catch {
      res.status(500).json({ error: 'Failed to list directory' });
    }
  });

  app.get('/api/fs/parent', (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) return res.status(400).send('Missing path');
    const parent = path.dirname(dirPath);
    // If we are at root or at a drive root (e.g., C:\)
    // path.dirname('C:\\') returns 'C:\\' on Windows
    // path.dirname('/') returns '/' on Linux
    if (parent === dirPath) {
      // We are at the FS root of a drive or the system.
      // Return null to signal "Go to Drives/Root View"
      return res.json({ parent: null });
    }
    res.json({ parent });
  });

  // Extensions
  app.get('/api/config/extensions', (_req, res) => {
    res.json({
      images: SUPPORTED_IMAGE_EXTENSIONS,
      videos: SUPPORTED_VIDEO_EXTENSIONS,
      all: ALL_SUPPORTED_EXTENSIONS,
    });
  });

  // Media handler (Streaming, Thumbnails, Metadata, Static Files)
  // We define specific routes for granular control.

  // Imports for granular functions
  // (Moved to top-level static imports)

  // Google Drive Auth & Source Management
  // Typically these would be in a separate controller, but keeping inline for consistency with this file.

  app.get('/api/auth/google-drive/start', async (_req, res) => {
    try {
      const url = generateAuthUrl();
      res.send(url); // Send raw string
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  });

  app.post('/api/auth/google-drive/code', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).send('Missing code');
    try {
      await authenticateWithCode(code);
      res.sendStatus(200);
    } catch (e: unknown) {
      console.error(e);
      // Determine if it's a client error (invalid code)
      // Google API throws errors with 'message' often containing 'invalid_grant'
      // or we can assume most errors here are due to bad input if user is doing this manually.
      const error = e as {
        code?: number;
        response?: { status?: number };
        message?: string;
      };
      if (
        error.code === 400 ||
        error.response?.status === 400 ||
        error.message?.includes('invalid_grant')
      ) {
        return res.status(400).json({ error: 'Invalid code' });
      }
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // Auth Callback Handler for browser flow
  app.get('/auth/google/callback', (req, res) => {
    const code = req.query.code as string;
    if (!code) return res.status(400).send('Missing code parameter');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Authentication</title>
          <style>
            body { font-family: sans-serif; background: #222; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .container { background: #333; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); text-align: center; max-width: 500px; width: 90%; }
            h1 { margin-top: 0; color: #4ade80; }
            p { margin-bottom: 1.5rem; color: #ccc; }
            .code-box { background: #111; padding: 1rem; border: 1px solid #444; border-radius: 4px; font-family: monospace; font-size: 1.2rem; word-break: break-all; margin-bottom: 1.5rem; user-select: all; }
            button { background: #3b82f6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; transition: background 0.2s; }
            button:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Successful</h1>
            <p>Please copy the code below and paste it into the Media Player application.</p>
            <div class="code-box" onclick="selectCode()">${code}</div>
            <button onclick="copyCode()">Copy Code</button>
          </div>
          <script>
            function selectCode() {
              const range = document.createRange();
              range.selectNode(document.querySelector('.code-box'));
              window.getSelection().removeAllRanges();
              window.getSelection().addRange(range);
            }
            function copyCode() {
              const code = document.querySelector('.code-box').innerText;
              navigator.clipboard.writeText(code).then(() => {
                const btn = document.querySelector('button');
                btn.innerText = 'Copied!';
                setTimeout(() => btn.innerText = 'Copy Code', 2000);
              });
            }
          </script>
        </body>
      </html>
    `;
    res.send(html);
  });

  app.post('/api/sources/google-drive', async (req, res) => {
    const { folderId } = req.body;
    if (!folderId) return res.status(400).send('Missing folderId');
    try {
      const drive = await getDriveClient();
      // Verify access and get name
      const driveRes = await drive.files.get({
        fileId: folderId,
        fields: 'id, name',
      });
      const name = driveRes.data.name || 'Google Drive Folder';

      // Add to database
      await addMediaDirectory(`gdrive://${driveRes.data.id}`);

      res.json({ success: true, name });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to add Drive source' });
    }
  });

  app.get('/api/drive/files', async (req, res) => {
    const folderId = req.query.folderId as string;
    // folderId is optional, defaults to root but usually we pass it
    try {
      const files = await listDriveDirectory(folderId || 'root');
      res.json(files);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list Drive files' });
    }
  });

  app.get('/api/drive/parent', async (req, res) => {
    const folderId = req.query.folderId as string;
    if (!folderId) return res.status(400).send('Missing folderId');
    try {
      const parent = await getDriveParent(folderId);
      res.json({ parent });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get Drive parent' });
    }
  });

  app.get('/api/metadata', (req, res) => {
    const filePath = req.query.file as string;
    if (!filePath) return res.status(400).send('Missing file');
    serveMetadata(req, res, filePath, ffmpegStatic);
  });

  app.get('/api/stream', async (req, res) => {
    const filePath = req.query.file as string;
    const startTime = req.query.startTime as string;
    const isTranscode = req.query.transcode === 'true';

    if (!filePath) return res.status(400).send('Missing file');

    try {
      const source = createMediaSource(filePath);
      if (isTranscode) {
        if (!ffmpegStatic) return res.status(500).send('FFmpeg not found');
        await serveTranscodedStream(
          req,
          res,
          source,
          ffmpegStatic,
          startTime || null,
        );
      } else {
        await serveRawStream(req, res, source);
      }
    } catch (e: unknown) {
      console.error('Stream error:', e);
      if (!res.headersSent) {
        const msg = (e as Error).message || '';
        if (msg.includes('Access denied'))
          res.status(403).send('Access denied');
        else res.status(500).send('Stream error');
      }
    }
  });

  app.get('/api/thumbnail', (req, res) => {
    const filePath = req.query.file as string;
    if (!filePath) return res.status(400).send('Missing file');
    serveThumbnail(req, res, filePath, ffmpegStatic, CACHE_DIR);
  });

  app.get('/api/serve', async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).send('Missing path');
    try {
      const source = createMediaSource(filePath);
      await serveRawStream(req, res, source);
    } catch (e: unknown) {
      console.error('Serve error:', e);
      if (!res.headersSent) {
        const msg = (e as Error).message || '';
        if (msg.includes('Access denied'))
          res.status(403).send('Access denied');
        else res.status(500).send('Serve error');
      }
    }
  });

  // Frontend Serving (Production)
  if (!isDev) {
    // Serve any static files
    const clientDistPath = path.join(__dirname, '../client');
    app.use(express.static(clientDistPath));

    // SPA Fallback
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  return app;
}

export async function bootstrap() {
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Environment: ${isDev ? 'Development' : 'Production'}`);
  });
}

// Only run if called directly
// Check if this module is the entry point
const isEntryFile =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('server.ts');

if (isEntryFile) {
  bootstrap();
}
