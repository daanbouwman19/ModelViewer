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
  getSetting,
  getMetadata,
} from './database.ts';
import { type WorkerOptions } from 'worker_threads';
import { WorkerClient } from './worker-client.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVideoDuration } from './media-handler.ts';
import type { Album, MediaMetadata } from './types.ts';
import fs from 'fs/promises';
import PQueue from 'p-queue';
import {
  METADATA_EXTRACTION_CONCURRENCY,
  METADATA_BATCH_SIZE,
} from './constants.ts';
import { isDrivePath } from './media-utils.ts';

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
  let workerOptions: WorkerOptions | undefined;
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
      workerPath = new URL('./scan-worker.ts', import.meta.url);
      workerOptions = {
        execArgv: ['--import', 'tsx/esm'],
      };
    }
  }

  // Run scan in a worker
  const albums = await new Promise<Album[]>(async (resolve, reject) => {
    const client = new WorkerClient(workerPath, {
      workerOptions,
      operationTimeout: 86400000, // 24h timeout
      name: 'scan-worker',
    });

    try {
      // Init client (starts worker)
      // We can skip 'init' message if the worker doesn't expect one, or send one if needed.
      // The worker expects START_SCAN.
      // WorkerClient init() creates the worker.

      // Fetch tokens
      let tokens = null;
      try {
        const tokenString = await getSetting('google_tokens');
        if (tokenString) {
          tokens = JSON.parse(tokenString);
        }
      } catch (e) {
        console.warn(
          '[media-service] Failed to fetch google tokens for worker:',
          e,
        );
      }

      // Fetch currently cached albums to determine what is already known
      const previousPaths: string[] = [];
      try {
        const cachedAlbums = await getCachedAlbums();
        if (cachedAlbums) {
          // Helper to flatten albums to paths
          const collectPaths = (albums: Album[], target: string[]) => {
            for (const album of albums) {
              for (const texture of album.textures) {
                target.push(texture.path);
              }
              collectPaths(album.children, target);
            }
          };
          collectPaths(cachedAlbums, previousPaths);
        }
      } catch (e) {
        console.warn(
          '[media-service] Failed to fetch cached albums for diffing:',
          e,
        );
      }

      await client.init();

      const result = await client.sendMessage<Album[]>('START_SCAN', {
        directories: activeDirectories,
        tokens,
        previousPaths, // Pass existing paths to worker
      });

      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      await client.terminate();
    }
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

  const [viewCountsMap, metadataMap] = await Promise.all([
    getMediaViewCounts(allFilePaths),
    getMetadata(allFilePaths),
  ]);

  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => {
      const metadata = metadataMap[texture.path];
      return {
        ...texture,
        viewCount: viewCountsMap[texture.path] || 0,
        duration: metadata?.duration,
        rating: metadata?.rating || texture.rating,
      };
    }),
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

  const [viewCountsMap, metadataMap] = await Promise.all([
    getMediaViewCounts(allFilePaths),
    getMetadata(allFilePaths),
  ]);

  return albums.map((album) => ({
    ...album,
    textures: album.textures.map((texture) => {
      const metadata = metadataMap[texture.path];
      return {
        ...texture,
        viewCount: viewCountsMap[texture.path] || 0,
        duration: metadata?.duration,
        rating: metadata?.rating || texture.rating,
      };
    }),
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
  const queue = new PQueue({ concurrency: METADATA_EXTRACTION_CONCURRENCY });

  // Batching logic
  const pendingUpdates: ({ filePath: string } & MediaMetadata)[] = [];

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
        if (isDrivePath(filePath)) {
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

        if (pendingUpdates.length >= METADATA_BATCH_SIZE) {
          await flush();
        }
      } catch (error) {
        console.warn(
          `[media-service] Error extracting metadata for ${filePath}:`,
          error,
        );
        // Add failure to batch
        pendingUpdates.push({ filePath, status: 'failed' });
        if (pendingUpdates.length >= METADATA_BATCH_SIZE) {
          await flush();
        }
      }
    });
  }

  await queue.onIdle();
  await flush();
}
