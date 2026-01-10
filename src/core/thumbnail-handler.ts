import fs from 'fs';
import fsPromises from 'fs/promises';
import { Response } from 'express';
import {
  getThumbnailArgs,
  runFFmpeg,
  getThumbnailCachePath,
  checkThumbnailCache,
  isDrivePath,
} from './media-utils.ts';
import { getProvider } from './fs-provider-factory.ts';
import { validateFileAccess } from './access-validator.ts';

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
export async function tryServeFromCache(
  res: Response,
  cacheFile: string,
): Promise<boolean> {
  const hit = await checkThumbnailCache(cacheFile);
  if (hit) {
    return new Promise((resolve) => {
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
      });

      const stream = fs.createReadStream(cacheFile);

      stream.on('open', () => {
        stream.pipe(res);
      });

      stream.on('error', (err) => {
        console.warn(
          `[Thumbnail] Cache Stream Error for ${cacheFile} (falling back to generate):`,
          err,
        );
        // Fallback to generation
        resolve(false);
      });

      stream.on('end', () => {
        resolve(true);
      });
    });
  }
  return false;
}

/**
 * Helper: Tries to fetch and serve a thumbnail from the provider (e.g. Google Drive).
 * Returns true if served, false otherwise.
 */
export async function tryServeFromProvider(
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
export async function generateLocalThumbnail(
  res: Response,
  filePath: string,
  cacheFile: string,
  ffmpegPath: string | null,
): Promise<void> {
  // Use validateFileAccess to enforce security
  if (!(await validateFileAccess(res, filePath))) return;

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

    // Use stream instead of sendFile
    const stream = fs.createReadStream(cacheFile);
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('[Thumbnail] Stream error sending generated file:', err);
      if (!res.headersSent) res.status(500).end();
    });
  } catch (err) {
    console.error('[Thumbnail] Generation failed:', err);
    if (!res.headersSent) {
      res.status(500).send('Generation failed');
    }
  }
}

/**
 * Handles thumbnail generation.
 */
export async function serveThumbnail(
  _req: unknown, // Request is unused but kept for interface consistency
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
  if (isDrivePath(filePath)) {
    if (!res.headersSent) {
      res.status(404).end();
    }
    return;
  }

  // 3. Fallback to FFmpeg (Local)
  await generateLocalThumbnail(res, filePath, cacheFile, ffmpegPath);
}
