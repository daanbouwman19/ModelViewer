/**
 * @file Repository for media-related database operations.
 */
import {
  cacheAlbums,
  getAllMediaViewCounts,
  getAllMetadata,
  getAllMetadataStats,
  getAllMetadataVerification,
  getCachedAlbums,
  getMediaDirectories,
  getMetadata,
  getPendingMetadata,
  getSetting,
  bulkUpsertMetadata,
  filterProcessingNeeded,
} from '../database.ts';
import type { Album, MediaMetadata } from '../types.ts';

export class MediaRepository {
  async getMediaDirectories() {
    return getMediaDirectories();
  }

  async cacheAlbums(albums: Album[]) {
    return cacheAlbums(albums);
  }

  async getCachedAlbums() {
    return getCachedAlbums();
  }

  async getAllMediaViewCounts() {
    return getAllMediaViewCounts();
  }

  async getAllMetadata() {
    return getAllMetadata();
  }

  async getAllMetadataStats() {
    return getAllMetadataStats();
  }

  async getAllMetadataVerification() {
    return getAllMetadataVerification();
  }

  async getMetadata(filePaths: string[]) {
    return getMetadata(filePaths);
  }

  async bulkUpsertMetadata(data: Array<{ filePath: string } & MediaMetadata>) {
    return bulkUpsertMetadata(data);
  }

  async getPendingMetadata() {
    return getPendingMetadata();
  }

  async filterProcessingNeeded(filePaths: string[]) {
    return filterProcessingNeeded(filePaths);
  }

  async getSetting(key: string) {
    return getSetting(key);
  }
}
