/**
 * @file Shared media service logic.
 * Orchestrates scanning, caching, and view count retrieval.
 */

import {
  getMediaDirectories,
  cacheAlbums,
  getCachedAlbums,
  getMediaViewCounts,
} from './database';
import { performFullMediaScan } from './media-scanner';
import type { Album } from './types';

/**
 * Scans active media directories for albums, caches the result in the database,
 * and returns the list of albums found.
 * @returns The list of albums found.
 */
export async function scanDiskForAlbumsAndCache(): Promise<Album[]> {
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
  return albums || [];
}

/**
 * Retrieves albums by first checking the cache, and if the cache is empty,
 * performs a disk scan.
 * @returns The list of albums.
 */
export async function getAlbumsFromCacheOrDisk(): Promise<Album[]> {
  const albums = await getCachedAlbums();
  if (albums && albums.length > 0) {
    return albums;
  }
  return scanDiskForAlbumsAndCache();
}

/**
 * Performs a fresh disk scan and returns the albums with their view counts.
 * This is a utility function to combine scanning and view count retrieval.
 * @returns The list of albums with view counts.
 */
export async function getAlbumsWithViewCountsAfterScan(): Promise<Album[]> {
  const albums = await scanDiskForAlbumsAndCache();
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
export async function getAlbumsWithViewCounts(): Promise<Album[]> {
  const albums = await getAlbumsFromCacheOrDisk();
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
