import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import {
  getDriveFileStream,
  getDriveFileMetadata,
} from './google-drive-service';

class DriveCacheManager extends EventEmitter {
  private cacheDir: string;
  private activeDownloads: Map<string, Promise<string>>;
  private metadataCache: Map<string, { size: number; mimeType: string }>;

  constructor() {
    super();
    this.cacheDir = path.join(os.tmpdir(), 'model-viewer-drive-cache');
    this.activeDownloads = new Map();
    this.metadataCache = new Map();
    this.ensureCacheDir();
  }

  private ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  public async getCachedFilePath(
    fileId: string,
  ): Promise<{ path: string; totalSize: number; mimeType: string }> {
    const filePath = path.join(this.cacheDir, fileId);

    // Get metadata (cached or fresh) to return correct total size
    let metadata = this.metadataCache.get(fileId);
    if (!metadata) {
      try {
        const meta = await getDriveFileMetadata(fileId);
        metadata = {
          size: Number(meta.size),
          mimeType: meta.mimeType || 'video/mp4',
        };
        this.metadataCache.set(fileId, metadata);
      } catch (error) {
        console.error('[DriveCache] Failed to fetch metadata:', error);
        metadata = { size: 0, mimeType: 'video/mp4' }; // Fallback
      }
    }

    if (fs.existsSync(filePath)) {
      // Check if it's fully downloaded?
      // For now, we assume if it exists it's usable.
      // In a real robust system we'd check against totalSize or a .done flag.
      // But even partial files are fine for our "Active Caching" strategy.
      const stats = fs.statSync(filePath);
      // If active download is running, we trust it.
      // If no active download and size < totalSize, maybe resume?
      // For this "Radical Change" MVP, we'll start a download if not active and incomplete.

      if (!this.activeDownloads.has(fileId) && stats.size < metadata.size) {
        this.startDownload(fileId, filePath, stats.size).catch((err) =>
          console.error('[DriveCache] Download failed:', err),
        );
      }

      return {
        path: filePath,
        totalSize: metadata.size,
        mimeType: metadata.mimeType,
      };
    }

    // New download
    if (!this.activeDownloads.has(fileId)) {
      const downloadPromise = this.startDownload(fileId, filePath, 0);
      this.activeDownloads.set(fileId, downloadPromise);
      // Wait for it to be ready
      try {
        await downloadPromise;
      } catch (e) {
        console.error('[DriveCache] Failed to start download:', e);
        throw e;
      }
    } else {
      // If already downloading, wait for it to be ready (if not already)
      try {
        await this.activeDownloads.get(fileId);
      } catch (e) {
        // Ignore error if specific download failed, maybe retry?
        console.warn(
          '[DriveCache] Existing download errored, trying to proceed anyway:',
          e,
        );
      }
    }

    return {
      path: filePath,
      totalSize: metadata.size,
      mimeType: metadata.mimeType,
    };
  }

  private async startDownload(
    fileId: string,
    filePath: string,
    startByte: number,
  ): Promise<string> {
    const flags = startByte > 0 ? 'a' : 'w';

    // 1. Get the stream (async)
    const stream = await getDriveFileStream(fileId, { start: startByte });

    // 2. Create the file (sync-ish, but ensuring it exists for readers)
    const fileStream = fs.createWriteStream(filePath, { flags });

    // 3. Pipe setup
    stream.pipe(fileStream);

    return new Promise((resolve, reject) => {
      // Resolve AS SOON AS the stream is ready/writing, so we can return the path to the player.
      // The player needs the file to exist.
      fileStream.on('ready', () => {
        resolve(filePath);
      });

      // Also handle early errors (e.g. permission)
      fileStream.on('error', (err) => {
        console.error(`[DriveCache] File write error for ${fileId}:`, err);
        this.activeDownloads.delete(fileId);
        reject(err);
      });

      stream.on('error', (err) => {
        console.error(`[DriveCache] Drive Stream error for ${fileId}:`, err);
        fileStream.close();
        this.activeDownloads.delete(fileId);
        // We don't reject here because we already resolved 'ready'.
        // The player will just hit EOF if the stream dies.
      });

      fileStream.on('finish', () => {
        this.activeDownloads.delete(fileId);
      });
    });
  }

  // Cleanup hook
  public cleanup() {
    // Remove all files in temp dir?
    try {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
      console.log('[DriveCache] Cache cleared.');
    } catch (e) {
      console.error('[DriveCache] Cleanup failed:', e);
    }
  }
}

export const driveCacheManager = new DriveCacheManager();
