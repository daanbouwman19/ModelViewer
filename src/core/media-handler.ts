/**
 * @file Shared media request handler.
 * Handles video streaming, metadata retrieval, and thumbnail generation.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { createMediaSource } from './media-source.ts';

import { IMediaSource } from './media-source-types.ts';
import {
  getThumbnailCachePath,
  checkThumbnailCache,
  getVlcPath,
  getTranscodeArgs,
  getThumbnailArgs,
  runFFmpeg,
  parseHttpRange,
  getQueryParam,
} from './media-utils.ts';
import { getProvider } from './fs-provider-factory.ts';
import { authorizeFilePath } from './security.ts';
import { DATA_URL_THRESHOLD_MB } from './constants.ts';
import { MediaRoutes } from './routes.ts';
import {
  GenerateUrlOptions,
  GenerateUrlResult,
} from './media-handler-types.ts';

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
  cacheDir: string;
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
    const source = createMediaSource(filePath);

    // Optimization: If local file and no transcode, use res.sendFile for better range support
    if (!isTranscodeForced && !filePath.startsWith('gdrive://')) {
      try {
        const auth = await authorizeFilePath(filePath);
        if (!auth.isAllowed) {
          res.status(403).send('Access denied.');
          return;
        }
        return res.sendFile(filePath);
      } catch (e) {
        console.error('[Handler] SendFile check failed:', e);
        // Fallback to manual source handling if something fails (though unlikely)
      }
    }

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

let thumbnailQueue: InstanceType<typeof import('p-queue').default> | null =
  null;

async function getThumbnailQueue() {
  if (thumbnailQueue) return thumbnailQueue;
  const { default: PQueue } = await import('p-queue');
  thumbnailQueue = new PQueue({ concurrency: 2 });
  return thumbnailQueue;
}

async function runFFmpegThumbnail(
  filePath: string,
  cacheFile: string,
  ffmpegPath: string,
): Promise<void> {
  const generateArgs = getThumbnailArgs(filePath, cacheFile);
  const { code, stderr } = await runFFmpeg(ffmpegPath, generateArgs);
  if (code !== 0) {
    throw new Error(`FFmpeg failed with code ${code}: ${stderr}`);
  }
}

/**
 * Helper: Tries to serve a thumbnail from the local cache.
 * Returns true if served, false otherwise.
 */
async function tryServeFromCache(
  res: Response,
  cacheFile: string,
): Promise<boolean> {
  const hit = await checkThumbnailCache(cacheFile);
  if (hit) {
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    });
    // Use res.sendFile for cache file too
    res.sendFile(cacheFile);
    return true;
  }
  return false;
}

/**
 * Helper: Tries to fetch and serve a thumbnail from the provider (e.g. Google Drive).
 * Returns true if served, false otherwise.
 */
async function tryServeFromProvider(
  res: Response,
  filePath: string,
  cacheFile: string,
): Promise<boolean> {
  try {
    const provider = getProvider(filePath);
    const stream = await provider.getThumbnailStream(filePath);
    if (stream) {
      const writeStream = fs.createWriteStream(cacheFile);
      stream.pipe(writeStream);
      stream.pipe(res);
      return true;
    }
  } catch (e) {
    console.warn('[Thumbnail] Provider fetch failed:', e);
  }
  return false;
}

/**
 * Helper: Generates a thumbnail using local FFmpeg and serves it.
 */
async function generateLocalThumbnail(
  res: Response,
  filePath: string,
  cacheFile: string,
  ffmpegPath: string | null,
): Promise<void> {
  try {
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      res.status(403).send('Access denied.');
      return;
    }
  } catch {
    res.status(500).send('Internal Error');
    return;
  }

  if (!ffmpegPath) {
    res.status(500).send('FFmpeg binary not found');
    return;
  }

  try {
    const queue = await getThumbnailQueue();
    await queue.add(() => runFFmpegThumbnail(filePath, cacheFile, ffmpegPath));

    // Verify file exists
    await fsPromises.stat(cacheFile);

    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    });
    res.sendFile(cacheFile);
  } catch (err) {
    console.error('[Thumbnail] Generation failed:', err);
    if (!res.headersSent) {
      res.status(500).send('Generation failed');
    }
  }
}

export async function getFFmpegDuration(
  filePath: string,
  ffmpegPath: string,
): Promise<number> {
  try {
    const { stderr } = await runFFmpeg(ffmpegPath, ['-i', filePath]);
    const match = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      const hours = parseFloat(match[1]);
      const minutes = parseFloat(match[2]);
      const seconds = parseFloat(match[3]);
      return hours * 3600 + minutes * 60 + seconds;
    } else {
      throw new Error('Could not determine duration');
    }
  } catch (err) {
    if ((err as Error).message === 'Could not determine duration') throw err;
    console.error('[Metadata] FFmpeg spawn error:', err);
    throw new Error('FFmpeg execution failed');
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
    const provider = getProvider(filePath);
    const meta = await provider.getMetadata(filePath);
    if (meta.duration) {
      return { duration: meta.duration };
    }
  } catch {
    // Ignore provider errors
  }

  // If it's a Drive file and we didn't get duration from metadata,
  // we can't easily use local FFmpeg on the ID string.
  if (filePath.startsWith('gdrive://')) {
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
  if (!filePath.startsWith('gdrive://')) {
    try {
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed) {
        res.status(403).send('Access denied.');
        return;
      }
    } catch (error) {
      console.error('[Metadata] Path validation error:', error);
      res.status(500).send('Internal Error');
      return;
    }
  }

  if (!ffmpegPath && !filePath.startsWith('gdrive://')) {
    res.status(500).send('FFmpeg binary not found');
    return;
  }

  const result = await getVideoDuration(filePath, ffmpegPath || '');

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
 * Handles thumbnail generation.
 */
export async function serveThumbnail(
  _req: Request,
  res: Response,
  filePath: string,
  ffmpegPath: string | null,
  cacheDir: string,
) {
  // 1. Check Cache
  const cacheFile = getThumbnailCachePath(filePath, cacheDir);
  if (await tryServeFromCache(res, cacheFile)) {
    return;
  }

  // 2. Try Provider (Drive)
  if (await tryServeFromProvider(res, filePath, cacheFile)) {
    return;
  }

  // Ensure GDrive files don't fall through to local FS if provider fetch failed
  if (filePath.startsWith('gdrive://')) {
    if (!res.headersSent) {
      res.status(404).end();
    }
    return;
  }

  // 3. Fallback to FFmpeg (Local)
  await generateLocalThumbnail(res, filePath, cacheFile, ffmpegPath);
}

/**
 * Handles static file serving.
 */
export async function serveStaticFile(
  req: Request,
  res: Response,
  filePath: string,
) {
  try {
    // If local file, use res.sendFile for optimizing range/seeking
    if (!filePath.startsWith('gdrive://')) {
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed) {
        res.status(403).send('Access denied.');
        return;
      }
      return res.sendFile(filePath);
    }

    const source = createMediaSource(filePath);
    return await serveRawStream(req, res, source);
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

  // Metadata Route
  app.get(MediaRoutes.METADATA, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath) {
      res.status(400).send('Missing file parameter');
      return;
    }
    await serveMetadata(req, res, filePath, ffmpegPath);
  });

  // Streaming Route
  app.get(MediaRoutes.STREAM, async (req, res) => {
    // Logic handled inside handleStreamRequest by reading req.query
    await handleStreamRequest(req, res, ffmpegPath);
  });

  // Thumbnail Route
  app.get(MediaRoutes.THUMBNAIL, async (req, res) => {
    const filePath = getQueryParam(req.query, 'file');
    if (!filePath) {
      res.status(400).send('Missing file parameter');
      return;
    }
    await serveThumbnail(req, res, filePath, ffmpegPath, cacheDir);
  });

  // Static File Serving (Fallback)
  app.use(async (req, res) => {
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
    if (!filePath.startsWith('gdrive://')) {
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

/**
 * Opens a media file in VLC Media Player.
 */
export async function openMediaInVlc(
  filePath: string,
  serverPort: number,
): Promise<{ success: boolean; message?: string }> {
  let fileArg = filePath;

  if (filePath.startsWith('gdrive://')) {
    if (serverPort > 0) {
      fileArg = `http://localhost:${serverPort}${MediaRoutes.STREAM}?file=${encodeURIComponent(filePath)}`;
    } else {
      return {
        success: false,
        message: 'Local server is not running to stream files.',
      };
    }
  } else {
    // Local file auth check
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      return { success: false, message: auth.message || 'Access denied' };
    }
  }

  const vlcPath = await getVlcPath();

  if (!vlcPath) {
    return {
      success: false,
      message:
        'VLC Media Player not found. Please ensure it is installed in the default location.',
    };
  }

  try {
    const child = spawn(vlcPath, [fileArg], {
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', (err) => {
      console.error('[media-handler] Error launching VLC (async):', err);
    });

    child.unref();
    return { success: true };
  } catch (error: unknown) {
    console.error('[media-handler] Error launching VLC:', error);
    return {
      success: false,
      message: `Failed to launch VLC: ${(error as Error).message}`,
    };
  }
}
