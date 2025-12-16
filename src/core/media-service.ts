/**
 * @file Shared media service logic.
 * Orchestrates scanning, caching, and view count retrieval.
 */

import {
  getMediaDirectories,
  cacheAlbums,
  getCachedAlbums,
  getMediaViewCounts,
  upsertMetadata,
} from './database';
import { performFullMediaScan } from './media-scanner';
import { getVideoDuration } from './media-handler';
import type { Album, MediaMetadata } from './types';
import fs from 'fs/promises';

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

  const albums = await performFullMediaScan(activeDirectories);
  await cacheAlbums(albums || []);

  // Trigger metadata extraction in background if ffmpegPath is provided
  if (ffmpegPath && albums && albums.length > 0) {
    const allFilePaths = albums.flatMap((album) =>
      album.textures.map((texture) => texture.path),
    );
    // Fire and forget
    extractAndSaveMetadata(allFilePaths, ffmpegPath).catch((err) =>
      console.error(
        '[media-service] Background metadata extraction failed:',
        err,
      ),
    );
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
  // Process sequentially to verify stability, or use a concurrency limit
  // For now simple loop
  for (const filePath of filePaths) {
    try {
      if (filePath.startsWith('gdrive://')) {
        // Skip metadata extraction for Google Drive files for now
        // TODO: Implement Drive-specific metadata fetching via Google Drive API
        continue;
      }

      const stats = await fs.stat(filePath);
      const metadata: MediaMetadata = {
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
      };

      // Only get duration for video/audio
      // We can check extension or try ffmpeg
      const result = await getVideoDuration(filePath, ffmpegPath);
      if ('duration' in result) {
        metadata.duration = result.duration;
      }

      await upsertMetadata(filePath, metadata);
    } catch (error) {
      console.warn(
        `[media-service] Error extracting metadata for ${filePath}:`,
        error,
      );
    }
  }
}
