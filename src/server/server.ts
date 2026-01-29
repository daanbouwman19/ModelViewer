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
import https from 'https';
import selfsigned from 'selfsigned';
import crypto from 'crypto';
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
  getRecentlyPlayed,
} from '../core/database.js';
import {
  getAlbumsWithViewCounts,
  getAlbumsWithViewCountsAfterScan,
} from '../core/media-service.js';
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
  ALL_SUPPORTED_EXTENSIONS,
  DEFAULT_SERVER_PORT,
  DEFAULT_SERVER_HOST,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX_REQUESTS,
  RATE_LIMIT_WRITE_WINDOW_MS,
  RATE_LIMIT_WRITE_MAX_REQUESTS,
  RATE_LIMIT_READ_WINDOW_MS,
  RATE_LIMIT_READ_MAX_REQUESTS,
  RATE_LIMIT_FILE_WINDOW_MS,
  RATE_LIMIT_FILE_MAX_REQUESTS,
  MAX_CONCURRENT_TRANSCODES,
  MAX_API_BATCH_SIZE,
  HLS_CACHE_DIR_NAME,
} from '../core/constants.js';
import { listDirectory } from '../core/file-system.ts';
import {
  authorizeFilePath,
  escapeHtml,
  isRestrictedPath,
  isSensitiveDirectory,
  registerSensitiveFile,
} from '../core/security.ts';
import { initializeDriveCacheManager } from '../main/drive-cache-manager.ts';
import { generateAuthUrl, authenticateWithCode } from '../main/google-auth.ts';
import {
  getDriveClient,
  listDriveDirectory,
  getDriveParent,
} from '../main/google-drive-service.ts';
import {
  serveMetadata,
  serveTranscodedStream,
  serveHlsMaster,
  serveHlsPlaylist,
  serveHlsSegment,
  serveRawStream,
  serveThumbnail,
  serveHeatmap,
  serveHeatmapProgress,
  validateFileAccess,
} from '../core/media-handler.ts';
import { getQueryParam } from '../core/utils/http-utils.ts';
import { createMediaSource } from '../core/media-source.ts';
import ffmpegStatic from 'ffmpeg-static';
import { createRateLimiter } from '../core/rate-limiter.ts';
import { getGoogleAuthSuccessPage } from './auth-views.ts';
import { HlsManager } from '../core/hls-manager.ts';
import { MediaAnalyzer } from '../core/analysis/media-analyzer.ts';

// Check if we are running in dev mode or production
const isDev = process.env.NODE_ENV !== 'production';

// Derive __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DB_PATH =
  process.env.DB_FILE_PATH || path.join(process.cwd(), 'media-library.db');

// [SECURITY] Register database file as sensitive to prevent download
registerSensitiveFile(path.basename(DB_PATH));
registerSensitiveFile(path.basename(DB_PATH) + '-wal');
registerSensitiveFile(path.basename(DB_PATH) + '-shm');

// In dev (tsx), the worker is TS. In prod (build), it is JS adjacent to this file.
const WORKER_PATH = isDev
  ? path.join(__dirname, '../core/database-worker.ts')
  : path.join(__dirname, 'worker.js');

const CACHE_ROOT = path.join(process.cwd(), 'cache');
const CACHE_DIR = path.join(CACHE_ROOT, 'thumbnails');
const HLS_CACHE_DIR = path.join(CACHE_ROOT, HLS_CACHE_DIR_NAME);
const DRIVE_CACHE_DIR = path.join(CACHE_ROOT, 'drive');
const CERT_DIR = path.join(process.cwd(), 'certs');
const KEY_PATH = path.join(CERT_DIR, 'server.key');
const CERT_PATH = path.join(CERT_DIR, 'server.cert');

async function ensureCertificates() {
  try {
    await Promise.all([fs.access(KEY_PATH), fs.access(CERT_PATH)]);
    console.log('SSL Certificates found.');
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code !== 'ENOENT') {
      console.error(
        'An unexpected error occurred while checking for SSL certificates:',
        error,
      );
      throw error;
    }

    console.log('Generating SSL Certificates...');
    await fs.mkdir(CERT_DIR, { recursive: true });

    const attrs = [{ name: 'commonName', value: 'localhost' }];
    // @ts-expect-error - The types might be slightly off or options vary by version, but days is standard.
    const pems = await selfsigned.generate(attrs, { days: 365 });

    await fs.writeFile(CERT_PATH, pems.cert);
    await fs.writeFile(KEY_PATH, pems.private);

    console.log('SSL Certificates generated successfully.');
  }
}

export async function createApp() {
  const app = express();

  // Middleware

  // [SECURITY] CSP Nonce Generation
  // Generates a unique nonce for each request to allow inline scripts safely.
  app.use((_req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // Set security headers
  // [SECURITY] Content-Security-Policy enabled to prevent XSS.
  // We use nonces for scripts to avoid 'unsafe-inline'.
  // Styles still use 'unsafe-inline' due to Vue/library requirements.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            (_req, res) => `'nonce-${(res as express.Response).locals.nonce}'`,
            // Keep unsafe-inline for dev if strictly needed, but let's try nonce-only for better security
            // If HMR needs it, we might need to add it back conditionally.
            // Vite HMR usually uses 'self' or specific host, but some overlays might be inline.
            ...(isDev ? ["'unsafe-inline'"] : []),
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
        },
      },
    }),
  );

  // [SECURITY] Add Permissions-Policy header to disable unused powerful features
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
    );
    next();
  });

  // Restrict CORS to development server only, or disable in production (Same-Origin)
  const corsOptions = {
    origin: isDev
      ? process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
      : false,
  };
  app.use(cors(corsOptions));
  // [SECURITY] Limit JSON body size to 10MB to prevent DoS attacks while allowing batch metadata operations
  app.use(express.json({ limit: '10mb' }));

  // [UX] Dummy favicon to stop 404 noise in browser logs
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  // [SECURITY] Configure Rate Limiters
  // Auth: Strict limit (20 req / 15 min) to prevent brute force
  const authLimiter = createRateLimiter(
    RATE_LIMIT_AUTH_WINDOW_MS,
    RATE_LIMIT_AUTH_MAX_REQUESTS,
    'Too many auth attempts. Please try again later.',
  );

  // Write: Moderate limit (10 req / 1 min) for sensitive write operations (scan, create, rate)
  // This prevents DoS via resource exhaustion (e.g. disk scanning, DB spam)
  const writeLimiter = createRateLimiter(
    RATE_LIMIT_WRITE_WINDOW_MS,
    RATE_LIMIT_WRITE_MAX_REQUESTS,
    'Too many requests. Please slow down.',
  );

  // Read: For metadata/albums browsing (120 req / 1 min)
  const readLimiter = createRateLimiter(
    RATE_LIMIT_READ_WINDOW_MS,
    RATE_LIMIT_READ_MAX_REQUESTS,
    'Too many requests. Please slow down.',
  );

  // File/Expensive: For streaming/thumbnails/listing (60 req / 1 min)
  const fileLimiter = createRateLimiter(
    RATE_LIMIT_FILE_WINDOW_MS,
    RATE_LIMIT_FILE_MAX_REQUESTS,
    'Too many requests. Please slow down.',
  );

  // [SECURITY] Concurrency Limiter for Transcoding
  // Prevent CPU exhaustion by limiting concurrent ffmpeg processes
  let currentTranscodes = 0;

  // Initialize Database
  console.log(
    `Initializing database at ${DB_PATH} using worker ${WORKER_PATH}`,
  );

  const workerOptions = isDev
    ? {
        execArgv: ['--import', 'tsx'],
      }
    : undefined;

  try {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await initDatabase(DB_PATH, WORKER_PATH, workerOptions);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(DRIVE_CACHE_DIR, { recursive: true });
    await fs.mkdir(HLS_CACHE_DIR, { recursive: true });

    // Initialize Drive Cache Manager
    initializeDriveCacheManager(DRIVE_CACHE_DIR);
    console.log(
      `Initialized DriveCacheManager with cache dir: ${DRIVE_CACHE_DIR}`,
    );

    // Initialize HLS Manager
    HlsManager.getInstance().setCacheDir(HLS_CACHE_DIR);
    console.log(`Initialized HlsManager with cache dir: ${HLS_CACHE_DIR}`);

    // Initialize MediaAnalyzer (Heatmaps)
    MediaAnalyzer.getInstance().setCacheDir(CACHE_DIR);
    console.log(`Initialized MediaAnalyzer with cache dir: ${CACHE_DIR}`);
  } catch (e) {
    console.error('Failed to initialize database:', e);
    process.exit(1);
  }

  // --- API Routes (Mirroring IMediaBackend) ---

  // Albums
  app.get('/api/albums', readLimiter, async (_req, res) => {
    try {
      const albums = await getAlbumsWithViewCounts();
      res.json(albums);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch albums' });
    }
  });

  app.post('/api/albums/reindex', writeLimiter, async (_req, res) => {
    try {
      const albums = await getAlbumsWithViewCountsAfterScan();
      res.json(albums);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to reindex' });
    }
  });

  // Media Views
  app.post('/api/media/view', writeLimiter, async (req, res) => {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== 'string')
      return res.status(400).send('Missing or invalid filePath');

    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed)
      return res.status(403).send(auth.message || 'Access denied');

    await recordMediaView(filePath);
    res.sendStatus(200);
  });

  app.post('/api/media/views', readLimiter, async (req, res) => {
    const { filePaths } = req.body;
    if (
      !Array.isArray(filePaths) ||
      !filePaths.every((p) => typeof p === 'string')
    )
      return res.status(400).send('Invalid filePaths');

    if (filePaths.length > MAX_API_BATCH_SIZE) {
      return res
        .status(400)
        .send(`Batch size exceeds limit of ${MAX_API_BATCH_SIZE}`);
    }

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
  app.get('/api/smart-playlists', readLimiter, async (_req, res) => {
    try {
      const playlists = await getSmartPlaylists();
      res.json(playlists);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch smart playlists' });
    }
  });

  app.post('/api/smart-playlists', writeLimiter, async (req, res) => {
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

  app.put('/api/smart-playlists/:id', writeLimiter, async (req, res) => {
    const idParam = req.params.id;
    const idStr = Array.isArray(idParam) ? idParam[0] : idParam || '';
    const id = parseInt(idStr, 10);
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

  app.delete('/api/smart-playlists/:id', writeLimiter, async (req, res) => {
    const idParam = req.params.id;
    const idStr = Array.isArray(idParam) ? idParam[0] : idParam || '';
    const id = parseInt(idStr, 10);
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
  app.post('/api/media/rate', writeLimiter, async (req, res) => {
    const { filePath, rating } = req.body;
    if (!filePath || typeof filePath !== 'string' || typeof rating !== 'number')
      return res.status(400).send('Missing filePath or rating');

    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed)
      return res.status(403).send(auth.message || 'Access denied');

    try {
      await setRating(filePath, rating);
      res.sendStatus(200);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to set rating' });
    }
  });

  app.get('/api/media/all', readLimiter, async (_req, res) => {
    try {
      const items = await getAllMetadataAndStats();
      res.json(items);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get all media' });
    }
  });

  app.get('/api/media/history', readLimiter, async (req, res) => {
    const rawLimit = parseInt(getQueryParam(req.query, 'limit') as string, 10);
    const limit =
      !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 50;
    try {
      const items = await getRecentlyPlayed(limit);
      res.json(items);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get recently played media' });
    }
  });

  app.post('/api/media/metadata', writeLimiter, async (req, res) => {
    const { filePath, metadata } = req.body;
    if (!filePath || typeof filePath !== 'string' || !metadata)
      return res.status(400).send('Missing or invalid arguments');

    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed)
      return res.status(403).send(auth.message || 'Access denied');

    try {
      await upsertMetadata(filePath, metadata);
      res.sendStatus(200);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to upsert metadata' });
    }
  });

  app.post('/api/media/metadata/batch', readLimiter, async (req, res) => {
    const { filePaths } = req.body;
    if (
      !Array.isArray(filePaths) ||
      !filePaths.every((p) => typeof p === 'string')
    )
      return res.status(400).send('Invalid filePaths');

    if (filePaths.length > MAX_API_BATCH_SIZE) {
      return res
        .status(400)
        .send(`Batch size exceeds limit of ${MAX_API_BATCH_SIZE}`);
    }

    // Filter out unauthorized paths to prevent probing
    const allowedPaths: string[] = [];
    for (const p of filePaths) {
      const auth = await authorizeFilePath(p);
      if (auth.isAllowed) {
        allowedPaths.push(p);
      }
    }

    try {
      const result = await getMetadata(allowedPaths);
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get metadata batch' });
    }
  });

  // Directories
  app.get('/api/directories', readLimiter, async (_req, res) => {
    const dirs = await getMediaDirectories();
    res.json(dirs);
  });

  app.post('/api/directories', writeLimiter, async (req, res) => {
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).send('Missing path');

    try {
      if (typeof dirPath !== 'string' || dirPath.includes('\0')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      // Preliminary check on the input path before filesystem access
      if (isSensitiveDirectory(dirPath)) {
        console.warn(
          `[Security] Blocked attempt to add sensitive directory: ${dirPath}`,
        );
        return res.status(403).json({
          error: 'Access restricted for sensitive system directories',
        });
      }

      let resolvedPath: string;
      try {
        // Resolve path to handle symlinks and relative paths
        // Now that we've pre-validated, this is safe from basic path traversal
        resolvedPath = await fs.realpath(dirPath);
      } catch {
        return res.status(400).json({ error: 'Directory does not exist' });
      }

      // Final check on the resolved path to catch symlinks pointing to restricted areas
      if (isSensitiveDirectory(resolvedPath)) {
        console.warn(
          `[Security] Blocked attempt to add sensitive directory (resolved): ${resolvedPath}`,
        );
        return res.status(403).json({
          error: 'Access restricted for sensitive system directories',
        });
      }

      await addMediaDirectory(resolvedPath);
      res.json(resolvedPath);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to add directory' });
    }
  });

  app.delete('/api/directories', writeLimiter, async (req, res) => {
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).send('Missing path');
    try {
      await removeMediaDirectory(dirPath);
      res.sendStatus(200);
    } catch {
      res.status(500).json({ error: 'Failed to remove directory' });
    }
  });

  app.put('/api/directories/active', writeLimiter, async (req, res) => {
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
  app.get('/api/fs/ls', fileLimiter, async (req, res) => {
    const dirPath = getQueryParam(req.query, 'path');
    if (!dirPath || typeof dirPath !== 'string')
      return res.status(400).send('Missing path');

    if (isRestrictedPath(dirPath)) {
      console.warn(
        `[Security] Blocked attempt to list restricted directory: ${dirPath}`,
      );
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const contents = await listDirectory(dirPath);
      res.json(contents);
    } catch {
      res.status(500).json({ error: 'Failed to list directory' });
    }
  });

  app.get('/api/fs/parent', fileLimiter, (req, res) => {
    const dirPath = getQueryParam(req.query, 'path');
    if (!dirPath || typeof dirPath !== 'string')
      return res.status(400).send('Missing path');

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
  app.get('/api/config/extensions', readLimiter, (_req, res) => {
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

  app.get('/api/auth/google-drive/start', authLimiter, async (_req, res) => {
    try {
      const url = generateAuthUrl();
      res.send(url); // Send raw string
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  });

  app.post('/api/auth/google-drive/code', authLimiter, async (req, res) => {
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
  app.get('/auth/google/callback', authLimiter, (req, res) => {
    const code = getQueryParam(req.query, 'code');
    if (!code || typeof code !== 'string')
      return res.status(400).send('Missing or invalid code parameter');

    const safeCode = escapeHtml(code);
    const nonce = res.locals.nonce;

    const html = getGoogleAuthSuccessPage(safeCode, nonce);
    res.send(html);
  });

  app.post('/api/sources/google-drive', writeLimiter, async (req, res) => {
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

  app.get('/api/drive/files', fileLimiter, async (req, res) => {
    const folderId = getQueryParam(req.query, 'folderId');
    // folderId is optional, defaults to root but usually we pass it
    try {
      const files = await listDriveDirectory(folderId || 'root');
      res.json(files);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list Drive files' });
    }
  });

  app.get('/api/drive/parent', fileLimiter, async (req, res) => {
    const folderId = getQueryParam(req.query, 'folderId');
    if (!folderId) return res.status(400).send('Missing folderId');
    try {
      const parent = await getDriveParent(folderId);
      res.json({ parent });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get Drive parent' });
    }
  });

  app.get('/api/metadata', fileLimiter, (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath) return res.status(400).send('Missing file');
    serveMetadata(req, res, filePath, ffmpegStatic);
  });

  app.get('/api/stream', fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    const startTime = getQueryParam(req.query, 'startTime');
    const isTranscode = getQueryParam(req.query, 'transcode') === 'true';

    if (!filePath) return res.status(400).send('Missing file');

    try {
      const access = await validateFileAccess(filePath);
      if (!access.success) {
        if (!res.headersSent) res.status(access.statusCode).send(access.error);
        return;
      }
      const authorizedPath = access.path;

      const source = createMediaSource(authorizedPath);
      if (isTranscode) {
        // [SECURITY] Check concurrency limit
        if (currentTranscodes >= MAX_CONCURRENT_TRANSCODES) {
          console.warn(
            `[Security] Transcode blocked due to concurrency limit (${currentTranscodes}/${MAX_CONCURRENT_TRANSCODES})`,
          );
          return res
            .status(503)
            .send('Server too busy. Please try again later.');
        }

        if (!ffmpegStatic) return res.status(500).send('FFmpeg not found');

        try {
          currentTranscodes++;
          const cleanup = () => {
            currentTranscodes--;
            res.removeListener('finish', cleanup);
            res.removeListener('close', cleanup);
          };
          res.on('finish', cleanup);
          res.on('close', cleanup);

          await serveTranscodedStream(
            req,
            res,
            source,
            ffmpegStatic,
            startTime || undefined,
          );
        } catch (e) {
          // If any sync error occurs, ensure we don't leak the counter
          // Ideally listeners handle it, but if we haven't set them up yet...
          // We set them up before calling serveTranscodedStream, so we are good.
          throw e;
        }
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

  app.get('/api/thumbnail', fileLimiter, (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath || typeof filePath !== 'string')
      return res.status(400).send('Missing file');
    serveThumbnail(req, res, filePath, ffmpegStatic, CACHE_DIR);
  });

  app.get('/api/video/heatmap', fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath || typeof filePath !== 'string')
      return res.status(400).send('Missing file');
    await serveHeatmap(req, res, filePath);
  });

  app.get('/api/video/heatmap/status', fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath || typeof filePath !== 'string')
      return res.status(400).send('Missing file');
    await serveHeatmapProgress(req, res, filePath);
  });

  app.get('/api/hls/master.m3u8', fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath || typeof filePath !== 'string')
      return res.status(400).send('Missing file');
    await serveHlsMaster(req, res, filePath as string);
  });

  app.get('/api/hls/playlist.m3u8', fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath || typeof filePath !== 'string')
      return res.status(400).send('Missing file');
    await serveHlsPlaylist(req, res, filePath as string);
  });

  app.get('/api/hls/:segment', fileLimiter, async (req, res) => {
    const segment = req.params.segment;
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath || typeof filePath !== 'string')
      return res.status(400).send('Missing file');
    await serveHlsSegment(req, res, filePath as string, segment as string);
  });

  app.get('/api/serve', fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'path');
    if (!filePath) return res.status(400).send('Missing path');
    try {
      // [SECURITY] Explicitly validate access before creating source or streaming.
      const access = await validateFileAccess(filePath);
      if (!access.success) {
        if (!res.headersSent) res.status(access.statusCode).send(access.error);
        return;
      }
      const authorizedPath = access.path;

      const source = createMediaSource(authorizedPath);
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
    const clientDistPath = path.join(__dirname, '../client');

    // [PERFORMANCE] Serve immutable assets (JS/CSS with hash) aggressively
    // Vite puts hashed assets in /assets/, so we can cache them for 1 year.
    app.use(
      '/assets',
      express.static(path.join(clientDistPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }),
    );

    // Serve other static files (index.html, favicon.ico, etc.) with standard ETag behavior
    app.use(express.static(clientDistPath));

    // SPA Fallback
    app.get(/.*/, readLimiter, (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  return app;
}

export async function bootstrap() {
  await ensureCertificates();

  const app = await createApp();
  // [SECURITY] Default to localhost to prevent exposing unauthenticated endpoints
  // (like /api/fs/ls) to the local network. Use HOST=0.0.0.0 if network access is required.
  const host = process.env.HOST || DEFAULT_SERVER_HOST;

  const credentials = {
    key: await fs.readFile(KEY_PATH),
    cert: await fs.readFile(CERT_PATH),
  };

  const server = https.createServer(credentials, app);

  // [SECURITY] Set a timeout to prevent Slowloris attacks (30 seconds)
  server.setTimeout(30000);

  server.listen(DEFAULT_SERVER_PORT, host, () => {
    console.log(`Server running at https://${host}:${DEFAULT_SERVER_PORT}`);
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
