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
import { getProvider } from './fs-provider-factory.ts';
import { authorizeFilePath } from './security.ts';
import { validateFileAccess } from './access-validator.ts';
import { serveThumbnail } from './thumbnail-handler.ts';
import {
  DATA_URL_THRESHOLD_MB,
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
    // 1. Authorization Check (Unified)
    // Always validate access first, regardless of transcode or direct play
    const access = await validateFileAccess(filePath);
    if (!access.success) {
      if (!res.headersSent) res.status(access.statusCode).send(access.error);
      return;
    }
    const authorizedPath = access.path;

    // 2. Direct File Optimization
    // If not transcoding and it's a local file, try sendFile for better performance/range support
    if (!isTranscodeForced) {
      if (tryServeDirectFile(res, authorizedPath)) return;
    }

    // 3. Fallback / Transcoding Logic
    // If we are here, either:
    // a) Transcoding is forced
    // b) It is a GDrive file
    // c) Local sendFile failed (fallback to manual stream)
    const source = createMediaSource(authorizedPath);

    if (isTranscodeForced) {
      if (!ffmpegPath) {
        res.status(500).send('FFmpeg binary not found');
        return;
      }
      return await serveTranscodedStream(
        req,
        res,
        source,
        ffmpegPath,
        startTime,
      );
    } else {
      return await serveRawStream(req, res, source);
    }
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
    return;
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
 * Generates a URL (Data URL or HTTP URL) for loading a file.
 */
export async function generateFileUrl(
  filePath: string,
  options: GenerateUrlOptions,
): Promise<GenerateUrlResult> {
  try {
    const { serverPort, preferHttp } = options;
    const provider = getProvider(filePath);

    // [SECURITY] Check access for local files
    if (!isDrivePath(filePath)) {
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed)
        return { type: 'error', message: auth.message || 'Access denied' };
    }

    const meta = await provider.getMetadata(filePath);
    const isLarge = meta.size > DATA_URL_THRESHOLD_MB * 1024 * 1024;

    if (preferHttp || isLarge) {
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

    const result = await provider.getStream(filePath);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const mimeType = meta.mimeType || 'application/octet-stream';
    const dataURL = `data:${mimeType};base64,${buffer.toString('base64')}`;
    return { type: 'data-url', url: dataURL };
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
