/**
 * @file Node.js Web Server for the Hosted Web App.
 * This server replaces Electron's main process for the web deployment.
 * It serves the frontend assets and provides the API endpoints mirroring IMediaBackend.
 */

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

export async function createApp() {
  const app = express();

  // Middleware
  // Set security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabling CSP to ensure compatibility with external fonts and Vue
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
  app.get('/api/extensions', (_req, res) => {
    res.json({
      images: SUPPORTED_IMAGE_EXTENSIONS,
      videos: SUPPORTED_VIDEO_EXTENSIONS,
      all: ALL_SUPPORTED_EXTENSIONS,
    });
  });

  // Media handler (Streaming, Thumbnails, Metadata, Static Files)
  // We define specific routes for granular control.

  // Imports for granular functions
  const { serveMetadata, serveTranscode, serveThumbnail, serveStaticFile } =
    await import('../core/media-handler');

  app.get('/api/metadata', (req, res) => {
    const filePath = req.query.file as string;
    if (!filePath) return res.status(400).send('Missing file');
    serveMetadata(req, res, filePath, ffmpegStatic);
  });

  app.get('/api/stream', (req, res) => {
    const filePath = req.query.file as string;
    const startTime = req.query.startTime as string;
    if (!filePath) return res.status(400).send('Missing file');
    serveTranscode(req, res, filePath, startTime, ffmpegStatic);
  });

  app.get('/api/thumbnail', (req, res) => {
    const filePath = req.query.file as string;
    if (!filePath) return res.status(400).send('Missing file');
    serveThumbnail(req, res, filePath, ffmpegStatic);
  });

  app.get('/api/serve', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).send('Missing path');
    serveStaticFile(req, res, filePath);
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
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Environment: ${isDev ? 'Development' : 'Production'}`);
  });
}

// Only run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrap();
}
