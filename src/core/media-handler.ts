/**
 * @file Shared media request handler.
 * Handles video streaming, metadata retrieval, and thumbnail generation.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { createMediaSource } from './media-source.ts';

import { IMediaSource } from './media-source-types.ts';
import { isDrivePath } from './media-utils.ts';
import { getTranscodeArgs, getFFmpegDuration } from './utils/ffmpeg-utils.ts';
import { parseHttpRange, getQueryParam } from './utils/http-utils.ts';
import { FileSystemProvider } from './fs-provider.ts';
import { getProvider } from './fs-provider-factory.ts';
import { authorizeFilePath } from './security.ts';
import { validateFileAccess } from './access-validator.ts';
import { serveThumbnail } from './thumbnail-handler.ts';
import { HlsManager } from './hls-manager.ts';
import { MediaAnalyzer } from './analysis/media-analyzer.ts';
import crypto from 'crypto';
import fs from 'fs/promises';
import {
  DATA_URL_THRESHOLD_BYTES,
  RATE_LIMIT_FILE_WINDOW_MS,
  RATE_LIMIT_FILE_MAX_REQUESTS,
} from './constants.ts';
import { createRateLimiter } from './rate-limiter.ts';
import { MediaRoutes } from './routes.ts';
import {
  GenerateUrlOptions,
  GenerateUrlResult,
} from './media-handler-types.ts';

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
  cacheDir: string;
}

export class MediaHandler {
  constructor(private config: MediaHandlerOptions) {}

  async handleStreamRequest(req: Request, res: Response) {
    return handleStreamRequest(req, res, this.config.ffmpegPath);
  }

  async serveMetadata(req: Request, res: Response, filePath: string) {
    return serveMetadata(req, res, filePath, this.config.ffmpegPath);
  }

  async serveThumbnail(req: Request, res: Response, filePath: string) {
    return serveThumbnail(
      req,
      res,
      filePath,
      this.config.ffmpegPath,
      this.config.cacheDir,
    );
  }

  async serveHeatmap(req: Request, res: Response, filePath: string) {
    return serveHeatmap(req, res, filePath);
  }

  async serveHeatmapProgress(req: Request, res: Response, filePath: string) {
    return serveHeatmapProgress(req, res, filePath);
  }

  async serveHlsMaster(req: Request, res: Response, filePath: string) {
    return serveHlsMaster(req, res, filePath);
  }

  async serveHlsPlaylist(req: Request, res: Response, filePath: string) {
    return serveHlsPlaylist(req, res, filePath);
  }

  async serveHlsSegment(
    req: Request,
    res: Response,
    filePath: string,
    segmentName: string,
  ) {
    return serveHlsSegment(req, res, filePath, segmentName);
  }

  async serveStaticFile(req: Request, res: Response, filePath: string) {
    return serveStaticFile(req, res, filePath);
  }
}

// Re-export for compatibility
export { validateFileAccess };

/**
 * Helper: Attempts to serve a local file directly using Express's sendFile.
 * Returns true if the file was sent (or at least attempted without immediate error),
 * false if we should fall back to manual streaming.
 */
function tryServeDirectFile(res: Response, filePath: string): boolean {
  if (isDrivePath(filePath)) return false;

  try {
    const rootDir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    res.sendFile(fileName, { root: rootDir });
    return true;
  } catch (e) {
    console.error('[Handler] SendFile check failed:', e);
    return false;
  }
}

/**
 * Processes the stream by creating a media source and choosing the appropriate streaming method.
 */
async function processStream(
  req: Request,
  res: Response,
  authorizedPath: string,
  options: {
    isTranscodeForced: boolean;
    ffmpegPath: string | null;
    startTime: string | undefined;
  },
) {
  const { isTranscodeForced, ffmpegPath, startTime } = options;
  const source = createMediaSource(authorizedPath);

  if (isTranscodeForced) {
    if (!ffmpegPath) {
      res.status(500).send('FFmpeg binary not found');
      return;
    }
    return serveTranscodedStream(req, res, source, ffmpegPath, startTime);
  }

  return serveRawStream(req, res, source);
}

/**
 * Handles video stream requests (raw or transcoded).
 */
export async function handleStreamRequest(
  req: Request,
  res: Response,
  ffmpegPath: string | null,
) {
  const filePath = getQueryParam(req.query, 'file');
  const startTime = getQueryParam(req.query, 'startTime');
  const isTranscodeForced = req.query.transcode === 'true';

  if (!filePath) {
    return res.status(400).send('Missing file parameter');
  }

  try {
    // 1. Authorization Check
    const access = await validateFileAccess(filePath);
    if (!access.success) {
      if (!res.headersSent) res.status(access.statusCode).send(access.error);
      return;
    }
    const authorizedPath = access.path;

    // 2. Direct File Optimization
    if (!isTranscodeForced && tryServeDirectFile(res, authorizedPath)) {
      return;
    }

    // 3. Fallback / Transcoding Logic
    await processStream(req, res, authorizedPath, {
      isTranscodeForced,
      ffmpegPath,
      startTime,
    });
  } catch (e: unknown) {
    console.error('[Handler] Stream failed:', e);
    if (!res.headersSent) {
      const msg = (e as Error).message || '';
      if (msg.includes('Access denied')) {
        res.status(403).send('Access denied.');
      } else {
        res.status(500).send('Error initializing source');
      }
    }
  }
}

/**
 * Retrieves video duration using ffmpeg or provider metadata.
 */
export async function getVideoDuration(
  filePath: string,
  ffmpegPath: string,
): Promise<{ duration: number } | { error: string }> {
  try {
    // Bolt Optimization: Skip provider metadata check for local files
    // as LocalFileSystemProvider does not provide duration and performs redundant fs.stat
    if (isDrivePath(filePath)) {
      const provider = getProvider(filePath);
      const meta = await provider.getMetadata(filePath);
      if (meta.duration) {
        return { duration: meta.duration };
      }
    }
  } catch {
    // Ignore provider errors
  }

  // If it's a Drive file and we didn't get duration from metadata,
  // we can't easily use local FFmpeg on the ID string.
  if (isDrivePath(filePath)) {
    return { error: 'Duration not available' };
  }

  try {
    const duration = await getFFmpegDuration(filePath, ffmpegPath);
    return { duration };
  } catch (error: unknown) {
    return { error: (error as Error).message };
  }
}

/**
 * Handles metadata retrieval.
 */
export async function serveMetadata(
  _req: Request,
  res: Response,
  filePath: string,
  ffmpegPath: string | null,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  const authorizedPath = access.path;

  if (!ffmpegPath && !isDrivePath(authorizedPath)) {
    res.status(500).send('FFmpeg binary not found');
    return;
  }

  const result = await getVideoDuration(authorizedPath, ffmpegPath || '');

  res.json(result);
}

/**
 * Serves a raw stream (Direct Play) for a media source.
 */
export async function serveRawStream(
  req: Request,
  res: Response,
  source: IMediaSource,
) {
  const totalSize = await source.getSize();
  const mimeType = await source.getMimeType();
  const rangeHeader = req.headers.range;

  const { start, end, error } = parseHttpRange(totalSize, rangeHeader);

  if (error || start >= totalSize) {
    res
      .status(416)
      .set({ 'Content-Range': `bytes */${totalSize}` })
      .send('Requested range not satisfiable.');
    return;
  }

  const { stream, length } = await source.getStream({ start, end });
  const actualEnd = start + length - 1;

  res.status(206).set({
    'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': length.toString(),
    'Content-Type': mimeType,
  });

  stream.pipe(res);

  stream.on('error', (err) => {
    console.error('[RawStream] Stream error:', err);
    if (!res.headersSent) {
      res.status(500).end();
    }
  });

  req.on('close', () => {
    stream.destroy();
  });
}

/**
 * Spawns FFmpeg to transcode the source and pipes output to response.
 */
export async function serveTranscodedStream(
  req: Request,
  res: Response,
  source: IMediaSource,
  ffmpegPath: string,
  startTime: string | undefined,
) {
  const inputPath = await source.getFFmpegInput();

  res.set({
    'Content-Type': 'video/mp4',
  });

  const ffmpegArgs = getTranscodeArgs(inputPath, startTime);
  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

  ffmpegProcess.stdout.pipe(res);

  const stderrReader = createInterface({ input: ffmpegProcess.stderr });
  stderrReader.on('line', (line) => {
    console.error(`[Transcode] FFmpeg Stderr: ${line}`);
  });

  ffmpegProcess.on('error', (err) => {
    console.error('[Transcode] Spawn Error:', err);
  });

  req.on('close', () => {
    ffmpegProcess.kill('SIGKILL');
  });
}

/**
 * Serves the HLS Master Playlist.
 */
export async function serveHlsMaster(
  req: Request,
  res: Response,
  filePath: string,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  // We don't need to resolve realpath here as the file param in query should be usable?
  // Actually validateFileAccess returns authorizedPath.
  // We should preserve the original 'file' query param for the sub-requests to ensure consistency?
  // Or encode the authorized path?
  // Let's use the original query param 'file' to keep it simple, assuming it's what the client sent.
  // But we need to be careful.
  const fileQuery = getQueryParam(req.query, 'file');
  const encodedFile = encodeURIComponent(fileQuery || '');

  const bandwidth = 2000000;
  const resolution = '1280x720';

  res.set('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}
playlist.m3u8?file=${encodedFile}`);
}

/**
 * Serves the HLS Variant Playlist.
 */
export async function serveHlsPlaylist(
  req: Request,
  res: Response,
  filePath: string,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  const authorizedPath = access.path;
  const sessionId = crypto
    .createHash('md5')
    .update(authorizedPath)
    .digest('hex');

  try {
    const hlsManager = HlsManager.getInstance();
    await hlsManager.ensureSession(sessionId, authorizedPath);

    const sessionDir = hlsManager.getSessionDir(sessionId);
    if (!sessionDir) throw new Error('Session dir not found');

    const playlistPath = path.join(sessionDir, 'playlist.m3u8');
    let playlistContent = await fs.readFile(playlistPath, 'utf8');

    // Rewrite segment paths to include the file query param
    // The segments are named 'segment_000.ts'
    // We want 'segment_000.ts?file=...'
    const fileQuery = getQueryParam(req.query, 'file');
    const encodedFile = encodeURIComponent(fileQuery || '');

    // Simple regex replace
    // Use a more robust regex that handles potential variations in segment naming
    const segmentRegex = /(segment_\d+\.ts)/g;
    playlistContent = playlistContent.replace(
      segmentRegex,
      `$1?file=${encodedFile}`,
    );

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(playlistContent);

    // Keep session alive
    hlsManager.touchSession(sessionId);
  } catch (e) {
    console.error('[HLS] Playlist error:', e);
    res.status(500).send('HLS Generation failed');
  }
}

/**
 * Serves an HLS Segment.
 */
export async function serveHlsSegment(
  _req: Request,
  res: Response,
  filePath: string,
  segmentName: string,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  const authorizedPath = access.path;
  const sessionId = crypto
    .createHash('md5')
    .update(authorizedPath)
    .digest('hex');

  const hlsManager = HlsManager.getInstance();
  const sessionDir = hlsManager.getSessionDir(sessionId);

  // If session doesn't exist, we can't serve segment.
  // The player should have requested playlist first which creates session.
  // If session timed out, we assume segment is gone.
  if (!sessionDir) {
    res.status(404).send('Segment not found (Session expired)');
    return;
  }

  const segmentPath = path.join(sessionDir, segmentName);

  // Security check: segmentName should be simple filename
  if (segmentName.includes('/') || segmentName.includes('\\')) {
    res.status(400).send('Invalid segment name');
    return;
  }

  try {
    // Check if file exists
    await fs.access(segmentPath);
    res.sendFile(segmentPath);
    hlsManager.touchSession(sessionId);
  } catch {
    res.status(404).send('Segment not found');
  }
}

/**
 * Serves the Heatmap data for a media file.
 */
export async function serveHeatmap(
  req: Request,
  res: Response,
  filePath: string,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  const authorizedPath = access.path;

  try {
    const pointsStr = getQueryParam(req.query, 'points');
    const points = pointsStr ? parseInt(pointsStr, 10) : 100;

    const analyzer = MediaAnalyzer.getInstance();
    const data = await analyzer.generateHeatmap(authorizedPath, points);
    res.json(data);
  } catch (e) {
    console.error('[Heatmap] Error generating heatmap:', e);
    res.status(500).send('Heatmap generation failed');
  }
}

/**
 * Serves the progress of heatmap generation.
 */
export async function serveHeatmapProgress(
  _req: Request,
  res: Response,
  filePath: string,
) {
  // Authorization check is lightweight here, but good practice
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  const authorizedPath = access.path;

  const analyzer = MediaAnalyzer.getInstance();
  const progress = analyzer.getProgress(authorizedPath);

  if (progress === null) {
    // If null, job doesn't exist. It might be done or never started.
    // We return 200 with null to avoid console 404 errors during polling.
    res.json({ progress: null });
  } else {
    res.json({ progress });
  }
}

// Re-export serveThumbnail from the new handler for compatibility/convenience
export { serveThumbnail };

/**
 * Handles static file serving.
 */
export async function serveStaticFile(
  req: Request,
  res: Response,
  filePath: string,
) {
  try {
    const access = await validateFileAccess(filePath);
    if (access.success) {
      const authorizedPath = access.path;
      // If local file, use res.sendFile for optimizing range/seeking
      if (!isDrivePath(authorizedPath)) {
        // [SECURITY] Explicitly re-validate/sanitize local path to prevent traversal
        const auth = await authorizeFilePath(authorizedPath);
        if (!auth.isAllowed || !auth.realPath) {
          throw new Error(auth.message || 'Access denied (path sanitization)');
        }

        // Use the fully validated absolute path directly to avoid exposing arbitrary paths
        return res.sendFile(auth.realPath);
      }

      const source = createMediaSource(authorizedPath);
      return await serveRawStream(req, res, source);
    } else {
      if (!res.headersSent) res.status(access.statusCode).send(access.error);
      return;
    }
  } catch (err: unknown) {
    console.error('[ServeStatic] Error:', err);
    if (!res.headersSent) {
      const msg = (err as Error).message || '';
      if (msg.includes('Access denied')) {
        res.status(403).send('Access denied.');
      } else {
        res.status(500).send('Internal server error.');
      }
    }
  }
}

/**
 * Creates an Express application for media operations.
 */
export function createMediaApp(options: MediaHandlerOptions) {
  const { ffmpegPath, cacheDir } = options;

  // Initialize MediaAnalyzer cache dir
  MediaAnalyzer.getInstance().setCacheDir(cacheDir);

  const app = express();

  app.use(cors());
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const fileLimiter = createRateLimiter(
    RATE_LIMIT_FILE_WINDOW_MS,
    RATE_LIMIT_FILE_MAX_REQUESTS,
    'Too many requests. Please slow down.',
  );

  // Metadata Route
  app.get(MediaRoutes.METADATA, fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath) {
      res.status(400).send('Missing file parameter');
      return;
    }
    await serveMetadata(req, res, filePath, ffmpegPath);
  });

  // Streaming Route
  app.get(MediaRoutes.STREAM, fileLimiter, async (req, res) => {
    // Logic handled inside handleStreamRequest by reading req.query
    await handleStreamRequest(req, res, ffmpegPath);
  });

  // Thumbnail Route
  app.get(MediaRoutes.THUMBNAIL, fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath) {
      res.status(400).send('Missing file parameter');
      return;
    }
    await serveThumbnail(req, res, filePath, ffmpegPath, cacheDir);
  });

  // Heatmap Route
  app.get(MediaRoutes.HEATMAP, fileLimiter, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath) {
      res.status(400).send('Missing file parameter');
      return;
    }
    await serveHeatmap(req, res, filePath);
  });

  // Static File Serving (Fallback)
  app.use(fileLimiter, async (req, res) => {
    let requestedPath = decodeURIComponent(req.path);
    // On Windows, pathname start with a slash like /C:/Users... Express req.path preserves it.
    // parseHttpRange logic handles paths.
    // However, for serveStaticFile we need physical path.
    if (process.platform === 'win32' && requestedPath.startsWith('/')) {
      requestedPath = requestedPath.substring(1);
    }
    await serveStaticFile(req, res, requestedPath);
  });

  return app;
}

/**
 * Helper: Creates an HTTP URL result.
 */
function createHttpUrl(
  filePath: string,
  serverPort: number,
  isLarge: boolean,
): GenerateUrlResult {
  if (serverPort === 0) {
    return {
      type: 'error',
      message: isLarge
        ? 'Local server not ready to stream large file.'
        : 'Local server not ready to stream file.',
    };
  }
  const encodedPath = encodeURIComponent(filePath);
  return {
    type: 'http-url',
    url: `http://localhost:${serverPort}${MediaRoutes.STREAM}?file=${encodedPath}`,
  };
}

/**
 * Helper: Creates a Data URL result by reading the file stream.
 */
async function createDataUrl(
  filePath: string,
  provider: FileSystemProvider,
  mimeType: string,
): Promise<GenerateUrlResult> {
  const result = await provider.getStream(filePath);
  const chunks: Buffer[] = [];
  for await (const chunk of result.stream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  const dataURL = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return { type: 'data-url', url: dataURL };
}

/**
 * Generates a URL (Data URL or HTTP URL) for loading a file.
 */
export async function generateFileUrl(
  filePath: string,
  options: GenerateUrlOptions,
): Promise<GenerateUrlResult> {
  try {
    const { serverPort, preferHttp } = options;
    const provider = getProvider(filePath);

    // [SECURITY] Check access for all files (local and drive)
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed)
      return { type: 'error', message: auth.message || 'Access denied' };

    const meta = await provider.getMetadata(filePath);
    const isLarge = meta.size > DATA_URL_THRESHOLD_BYTES;

    if (preferHttp || isLarge) {
      return createHttpUrl(filePath, serverPort, isLarge);
    }

    const mimeType = meta.mimeType || 'application/octet-stream';
    return await createDataUrl(filePath, provider, mimeType);
  } catch (error: unknown) {
    console.error(
      `[media-handler] Error processing ${filePath} in generateFileUrl:`,
      error,
    );
    return {
      type: 'error',
      message: (error as Error).message || 'Unknown error processing file.',
    };
  }
}
