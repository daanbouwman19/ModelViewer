/**
 * @file Express application setup for the web server.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import ffmpegStatic from 'ffmpeg-static';
import { initDatabase } from '../core/database.ts';
import { HLS_CACHE_DIR_NAME } from '../core/constants.ts';
import { registerSensitiveFile } from '../core/security.ts';
import { initializeDriveCacheManager } from '../main/drive-cache-manager.ts';
import { HlsManager } from '../core/hls-manager.ts';
import { MediaAnalyzer } from '../core/analysis/media-analyzer.ts';
import * as mediaHandlerModule from '../core/media-handler.ts';
import { WorkerFactory } from '../core/worker-factory.ts';
import { createRateLimiters } from './middleware/rate-limiters.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { createAlbumRoutes } from './routes/album.routes.ts';
import { createMediaRoutes } from './routes/media.routes.ts';
import { createAuthRoutes } from './routes/auth.routes.ts';
import { createSystemRoutes } from './routes/system.routes.ts';

const isDev = process.env.NODE_ENV !== 'production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH =
  process.env.DB_FILE_PATH || path.join(process.cwd(), 'media-library.db');

registerSensitiveFile(path.basename(DB_PATH));
registerSensitiveFile(path.basename(DB_PATH) + '-wal');
registerSensitiveFile(path.basename(DB_PATH) + '-shm');

const CACHE_ROOT = path.join(process.cwd(), 'cache');
const CACHE_DIR = path.join(CACHE_ROOT, 'thumbnails');
const HLS_CACHE_DIR = path.join(CACHE_ROOT, HLS_CACHE_DIR_NAME);
const DRIVE_CACHE_DIR = path.join(CACHE_ROOT, 'drive');

export async function createApp() {
  const app = express();

  app.use((_req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            (_req, res) => `'nonce-${(res as express.Response).locals.nonce}'`,
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

  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
    );
    next();
  });

  const corsOptions = {
    origin: isDev
      ? process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
      : false,
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));

  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  const limiters = createRateLimiters();

  const transcodeState = { current: 0 };

  try {
    const isElectron = !!process.versions.electron;

    const { path: workerPath, options: workerOptions } =
      await WorkerFactory.getWorkerPath('database-worker', {
        currentDirname: __dirname,
        currentUrl: import.meta.url,
        isElectron,
        workerDir: path.join(__dirname, '../core'),
        serverWorkerAlias: 'worker',
      });

    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await initDatabase(DB_PATH, workerPath, workerOptions);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(DRIVE_CACHE_DIR, { recursive: true });
    await fs.mkdir(HLS_CACHE_DIR, { recursive: true });

    initializeDriveCacheManager(DRIVE_CACHE_DIR);

    HlsManager.getInstance().setCacheDir(HLS_CACHE_DIR);

    MediaAnalyzer.getInstance().setCacheDir(CACHE_DIR);
  } catch (e) {
    console.error('Failed to initialize database:', e);
    process.exit(1);
  }

  const useModuleFunctions =
    process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  const mediaHandler =
    !useModuleFunctions && mediaHandlerModule.MediaHandler
      ? new mediaHandlerModule.MediaHandler({
          ffmpegPath: ffmpegStatic,
          cacheDir: CACHE_DIR,
        })
      : {
          serveMetadata: (
            req: express.Request,
            res: express.Response,
            filePath: string,
          ) =>
            mediaHandlerModule.serveMetadata(req, res, filePath, ffmpegStatic),
          serveThumbnail: (
            req: express.Request,
            res: express.Response,
            filePath: string,
          ) =>
            mediaHandlerModule.serveThumbnail(
              req,
              res,
              filePath,
              ffmpegStatic,
              CACHE_DIR,
            ),
          serveHeatmap: (
            req: express.Request,
            res: express.Response,
            filePath: string,
          ) => mediaHandlerModule.serveHeatmap(req, res, filePath),
          serveHeatmapProgress: (
            req: express.Request,
            res: express.Response,
            filePath: string,
          ) => mediaHandlerModule.serveHeatmapProgress(req, res, filePath),
          serveHlsMaster: (
            req: express.Request,
            res: express.Response,
            filePath: string,
          ) => mediaHandlerModule.serveHlsMaster(req, res, filePath),
          serveHlsPlaylist: (
            req: express.Request,
            res: express.Response,
            filePath: string,
          ) => mediaHandlerModule.serveHlsPlaylist(req, res, filePath),
          serveHlsSegment: (
            req: express.Request,
            res: express.Response,
            filePath: string,
            segmentName: string,
          ) =>
            mediaHandlerModule.serveHlsSegment(req, res, filePath, segmentName),
          serveStaticFile: (
            req: express.Request,
            res: express.Response,
            filePath: string,
          ) => mediaHandlerModule.serveStaticFile(req, res, filePath),
        };

  app.use(createAlbumRoutes(limiters));
  app.use(
    createMediaRoutes({
      limiters,
      mediaHandler,
      transcodeState,
      ffmpegPath: ffmpegStatic,
    }),
  );
  app.use(createAuthRoutes(limiters));
  app.use(createSystemRoutes(limiters));

  if (!isDev) {
    const clientDistPath = path.join(__dirname, '../client');

    app.use(
      '/assets',
      express.static(path.join(clientDistPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }),
    );

    app.use(express.static(clientDistPath));

    app.get(/.*/, limiters.readLimiter, (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
