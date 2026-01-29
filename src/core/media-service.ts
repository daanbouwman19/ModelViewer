/**
 * @file Shared media service logic.
 * Orchestrates scanning, caching, and view count retrieval.
 */

import {
  getMediaDirectories,
  cacheAlbums,
  getCachedAlbums,
  getAllMediaViewCounts,
  bulkUpsertMetadata, // Added for batching
  getPendingMetadata,
  getSetting,
  getAllMetadata,
  getMetadata,
} from './database';
import { WorkerClient } from './worker-client';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVideoDuration } from './media-handler';
import { resolveWorkerPath } from './utils/worker-utils';
import type { Album, MediaMetadata } from './types';
import fs from 'fs/promises';
import PQueue from 'p-queue';
import {
  METADATA_EXTRACTION_CONCURRENCY,
  METADATA_BATCH_SIZE,
  SUPPORTED_VIDEO_EXTENSIONS,
  WORKER_SCAN_TIMEOUT_MS,
} from './constants';
import { isDrivePath } from './media-utils';

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

  // Determine worker path using shared utility
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const isElectron = !!process.versions['electron'];
  // In a real app we might pass isPackaged from main process or deduce it,
  // here we stick to the existing deduction logic if possible or assume a default.
  // The original code checked `app.isPackaged` dynamically.
  // We can pass `false` as default for `isPackaged` if we can't easily access it without importing electron,
  // OR we can keep the dynamic import logic ONLY for the boolean check if strictly needed.
  // To avoid `import('electron')` here, we might just try both or rely on env vars.
  // However, `resolveWorkerPath` was designed to handle this.
  // Let's check `isPackaged` safely.
  let isPackaged = false;
  if (isElectron) {
    try {
      // We still need to check if packaged if we want to be 100% correct about path
      const { app } = await import('electron');
      isPackaged = app.isPackaged;
    } catch {
      // Fallback
    }
  }

  const { path: workerPath, options: workerOptions } = await resolveWorkerPath(
    isElectron,
    isPackaged,
    __dirname,
    import.meta.url,
    'scan-worker',
  );

  // Run scan in a worker
  const albums = await new Promise<Album[]>(async (resolve, reject) => {
    const client = new WorkerClient(workerPath, {
      workerOptions,
      operationTimeout: WORKER_SCAN_TIMEOUT_MS,
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
          // Flatten albums to paths (Iterative)
          const stack = [...cachedAlbums];
          while (stack.length > 0) {
            const album = stack.pop();
            if (album) {
              for (const texture of album.textures) {
                previousPaths.push(texture.path);
              }
              if (album.children && album.children.length > 0) {
                // Push children in reverse order to maintain traversal order
                for (let i = album.children.length - 1; i >= 0; i--) {
                  stack.push(album.children[i]);
                }
              }
            }
          }
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
    const allFilePaths = collectAllFilePaths(albums);

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
        // Bolt Optimization: Avoid spread operator on large arrays to prevent stack overflow/high memory usage
        const uniquePaths = new Set(pending);
        for (const p of allFilePaths) {
          uniquePaths.add(p);
        }

        // Bolt Optimization: Do not force check for background scans. Only process new/pending items.
        await extractAndSaveMetadata(Array.from(uniquePaths), ffmpegPath, {
          forceCheck: false,
        });
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

  // Bolt Optimization: Use getAll... to avoid sending massive array of file paths to worker
  const [viewCountsMap, metadataMap] = await Promise.all([
    getAllMediaViewCounts(),
    getAllMetadata(),
  ]);

  return enrichAlbumsWithStats(albums, viewCountsMap, metadataMap);
}

/**
 * Collects all file paths from an album tree iteratively.
 * This avoids stack overflow issues with deeply nested directory structures.
 */
function collectAllFilePaths(albums: Album[]): string[] {
  const accumulator: string[] = [];
  const stack: Album[] = [...albums];

  while (stack.length > 0) {
    const album = stack.pop();
    if (!album) continue;

    for (const texture of album.textures) {
      accumulator.push(texture.path);
    }

    if (album.children && album.children.length > 0) {
      // Push children in reverse order to maintain pre-order traversal
      for (let i = album.children.length - 1; i >= 0; i--) {
        stack.push(album.children[i]);
      }
    }
  }

  return accumulator;
}

/**
 * Enriches albums to attach stats (view count, duration, rating) iteratively.
 * Bolt Optimization: Mutates the albums array in-place to avoid expensive deep copying
 * of the entire library structure.
 */
function enrichAlbumsWithStats(
  albums: Album[],
  viewCountsMap: { [path: string]: number },
  metadataMap: { [path: string]: MediaMetadata },
): Album[] {
  const stack: Album[] = [...albums];

  while (stack.length > 0) {
    const album = stack.pop();
    if (!album) continue;

    // Mutate textures in-place
    for (const texture of album.textures) {
      const metadata = metadataMap[texture.path];
      const rating =
        metadata?.rating !== undefined ? metadata.rating : texture.rating;

      texture.viewCount = viewCountsMap[texture.path] || 0;
      texture.duration = metadata?.duration;
      texture.rating = rating;
    }

    // Process children
    if (album.children && album.children.length > 0) {
      // Push children in reverse order to maintain pre-order traversal
      for (let i = album.children.length - 1; i >= 0; i--) {
        stack.push(album.children[i]);
      }
    } else if (!album.children) {
      // Ensure children is always an array (normalization behavior preservation)
      album.children = [];
    }
  }

  return albums;
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

  // Bolt Optimization: Use getAll... to avoid sending massive array of file paths to worker
  const [viewCountsMap, metadataMap] = await Promise.all([
    getAllMediaViewCounts(),
    getAllMetadata(),
  ]);

  return enrichAlbumsWithStats(albums, viewCountsMap, metadataMap);
}
/**
 * Extracts metadata for a list of files and saves it to the database.
 * This is intended to be run in the background.
 */
export async function extractAndSaveMetadata(
  filePaths: string[],
  ffmpegPath: string,
  options: { forceCheck?: boolean } = {},
): Promise<void> {
  const { forceCheck = false } = options;

  // Bolt Optimization: Fetch existing metadata to skip unnecessary processing
  // Use getAllMetadata for large batches (likely initial scan), getMetadata for small ones.
  let existingMetadataMap: { [path: string]: MediaMetadata } = {};
  try {
    if (filePaths.length > 1000) {
      existingMetadataMap = await getAllMetadata();
    } else if (filePaths.length > 0) {
      existingMetadataMap = await getMetadata(filePaths);
    }
  } catch (e) {
    console.warn(
      '[media-service] Failed to fetch existing metadata for optimization:',
      e,
    );
  }

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

    // Bolt Optimization: Skip redundant fs.stat if metadata exists and is valid, unless forced
    if (!forceCheck && existingMetadataMap[filePath]?.status === 'success') {
      continue;
    }

    queue.add(async () => {
      try {
        if (isDrivePath(filePath)) {
          return;
        }

        const stats = await fs.stat(filePath);

        // Check against existing metadata
        const existing = existingMetadataMap[filePath];
        if (
          existing &&
          existing.status === 'success' &&
          existing.size === stats.size &&
          existing.createdAt === stats.birthtime.toISOString()
        ) {
          return; // Skip redundant processing
        }

        const metadata: MediaMetadata = {
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          status: 'processing',
        };

        // Bolt Optimization: Only extract duration for video files
        const ext = path.extname(filePath).toLowerCase();
        if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
          const result = await getVideoDuration(filePath, ffmpegPath);
          if (result && 'duration' in result) {
            metadata.duration = result.duration;
          }
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
