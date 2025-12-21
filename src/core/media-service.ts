/**
 * @file Shared media service logic.
 * Orchestrates scanning, caching, and view count retrieval.
 */

import {
  getMediaDirectories,
  cacheAlbums,
  getCachedAlbums,
  getMediaViewCounts,
  bulkUpsertMetadata, // Added for batching
  getPendingMetadata,
} from './database';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVideoDuration } from './media-handler';
import type { Album, MediaMetadata } from './types';
import fs from 'fs/promises';
import PQueue from 'p-queue';

/**
 * Scans active media directories for albums, caches the result in the database,
 * and returns the list of albums found.
 * @returns The list of albums found.
 */
export async function scanDiskForAlbumsAndCache(
  ffmpegPath?: string,
): Promise<Album[]> {
  const allDirectories = await getMediaDirectories();
  const activeDirectories = allDirectories
    .filter((dir) => dir.isActive)
    .map((dir) => dir.path);

  if (!activeDirectories || activeDirectories.length === 0) {
    await cacheAlbums([]);
    return [];
  }

  // Determine worker path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  let workerPath: string | URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const isElectron = !!process.versions['electron'];

  if (isElectron) {
    const { app } = await import('electron');
    if (app.isPackaged) {
      workerPath = path.join(__dirname, 'scan-worker.js');
    } else {
      workerPath = new URL('./scan-worker.js', import.meta.url);
    }
  } else {
    // Web Server Environment
    if (isProduction) {
      // In production built server, workers are adjacent to the entry point.
      workerPath = path.join(__dirname, 'scan-worker.js');
    } else {
      // Development (tsx)
      workerPath = new URL('./scan-worker.js', import.meta.url);
    }
  }

  // Run scan in a worker
  const albums = await new Promise<Album[]>((resolve, reject) => {
    const worker = new Worker(workerPath);

    const cleanup = () => {
      worker.removeAllListeners();
      worker.terminate();
    };

    worker.on('message', (message) => {
      cleanup();
      if (message.type === 'SCAN_COMPLETE') {
        resolve(message.albums);
      } else if (message.type === 'SCAN_ERROR') {
        reject(new Error(message.error));
      }
    });

    worker.on('error', (err) => {
      cleanup();
      reject(err);
    });

    worker.on('exit', (code) => {
      cleanup();
      // This is a fallback. If we get here, it means the worker exited without
      // sending a message or emitting an 'error' event.
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      } else {
        // A clean exit without a message is an error for us, as the promise would otherwise hang.
        reject(new Error('Worker exited without sending a result.'));
      }
    });

    worker.postMessage({
      type: 'START_SCAN',
      directories: activeDirectories,
    });
  });

  await cacheAlbums(albums || []);

  // Trigger metadata extraction in background if ffmpegPath is provided
  if (ffmpegPath && albums && albums.length > 0) {
    // 1. Process pending items from DB
    // 2. Process new items

    // For simplicity, we just trigger a check for all new items + pending items
    const allFilePaths = albums.flatMap((album) =>
      album.textures.map((texture) => texture.path),
    );

    // Fire and forget, but also include checking for previously pending items
    // We combine them or run them.
    // Ideally we should prioritize pending items?

    // Let's first fetch pending items from DB to ensure they are covered
    // Note: extractAndSaveMetadata checks existence or overwrites.
    // To properly resume, we should merge.

    // We launch async process:
    (async () => {
      try {
        const pending = await getPendingMetadata();
        // Merge unique paths
        const uniquePaths = new Set([...pending, ...allFilePaths]);
        await extractAndSaveMetadata(Array.from(uniquePaths), ffmpegPath);
      } catch (e) {
        console.error(
          '[media-service] Background metadata extraction failed:',
          e,
        );
      }
    })();
  }

  return albums || [];
}

/**
 * Retrieves albums by first checking the cache, and if the cache is empty,
 * performs a disk scan.
 * @returns The list of albums.
 */
export async function getAlbumsFromCacheOrDisk(
  ffmpegPath?: string,
): Promise<Album[]> {
  const albums = await getCachedAlbums();
  if (albums && albums.length > 0) {
    return albums;
  }
  return scanDiskForAlbumsAndCache(ffmpegPath);
}

/**
 * Performs a fresh disk scan and returns the albums with their view counts.
 * This is a utility function to combine scanning and view count retrieval.
 * @returns The list of albums with view counts.
 */
export async function getAlbumsWithViewCountsAfterScan(
  ffmpegPath?: string,
): Promise<Album[]> {
  const albums = await scanDiskForAlbumsAndCache(ffmpegPath);
  if (!albums || albums.length === 0) {
    return [];
  }

  const allFilePaths = albums.flatMap((album) =>
    album.textures.map((texture) => texture.path),
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);

  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0,
    })),
  }));
}

/**
 * Retrieves albums (from cache or disk) and augments them with view counts.
 * @returns The list of albums with view counts.
 */
export async function getAlbumsWithViewCounts(
  ffmpegPath?: string,
): Promise<Album[]> {
  const albums = await getAlbumsFromCacheOrDisk(ffmpegPath);
  if (!albums || albums.length === 0) {
    return [];
  }

  const allFilePaths = albums.flatMap((album) =>
    album.textures.map((texture) => texture.path),
  );
  const viewCountsMap = await getMediaViewCounts(allFilePaths);

  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => ({
      ...texture,
      viewCount: viewCountsMap[texture.path] || 0,
    })),
  }));
}
/**
 * Extracts metadata for a list of files and saves it to the database.
 * This is intended to be run in the background.
 */
export async function extractAndSaveMetadata(
  filePaths: string[],
  ffmpegPath: string,
): Promise<void> {
  const METADATA_EXTRACTION_CONCURRENCY = 5;
  const queue = new PQueue({ concurrency: METADATA_EXTRACTION_CONCURRENCY });

  // Batching logic
  const pendingUpdates: ({ filePath: string } & MediaMetadata)[] = [];
  const BATCH_SIZE = 50;

  const flush = async () => {
    if (pendingUpdates.length === 0) return;
    const batch = pendingUpdates.splice(0, pendingUpdates.length);
    try {
      await bulkUpsertMetadata(batch);
    } catch (e) {
      console.error('[media-service] Failed to bulk upsert metadata:', e);
    }
  };

  for (const filePath of filePaths) {
    if (!filePath) {
      continue;
    }

    queue.add(async () => {
      try {
        if (filePath.startsWith('gdrive://')) {
          return;
        }

        const stats = await fs.stat(filePath);
        const metadata: MediaMetadata = {
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          status: 'processing',
        };

        const result = await getVideoDuration(filePath, ffmpegPath);
        if (result && 'duration' in result) {
          metadata.duration = result.duration;
        }

        // Mark success
        metadata.status = 'success';

        // Add to batch
        pendingUpdates.push({ filePath, ...metadata });

        if (pendingUpdates.length >= BATCH_SIZE) {
          await flush();
        }
      } catch (error) {
        console.warn(
          `[media-service] Error extracting metadata for ${filePath}:`,
          error,
        );
        // Add failure to batch
        pendingUpdates.push({ filePath, status: 'failed' });
        if (pendingUpdates.length >= BATCH_SIZE) {
          await flush();
        }
      }
    });
  }

  await queue.onIdle();
  await flush();
}
