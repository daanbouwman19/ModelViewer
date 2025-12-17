import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { getDriveFileMetadata } from '../main/google-drive-service';
import { getDriveStreamWithCache } from './drive-stream';
import { authorizeFilePath } from './security';
import { InternalMediaProxy } from './media-proxy';
import { IMediaSource } from './media-source-types';

export class LocalMediaSource implements IMediaSource {
  constructor(private filePath: string) {}

  async getFFmpegInput(): Promise<string> {
    const auth = await authorizeFilePath(this.filePath);
    if (!auth.isAllowed) {
      throw new Error(auth.message || 'Access denied');
    }
    return this.filePath;
  }

  async getStream(range?: {
    start: number;
    end: number;
  }): Promise<{ stream: Readable; length: number }> {
    const auth = await authorizeFilePath(this.filePath);
    if (!auth.isAllowed) {
      throw new Error(auth.message || 'Access denied');
    }

    const options: { start?: number; end?: number } = {};
    if (range) {
      options.start = range.start;
      options.end = range.end;
    }

    // Check stats after auth
    const stats = await fs.promises.stat(this.filePath);
    const start = options.start || 0;
    const end = options.end !== undefined ? options.end : stats.size - 1;

    // Validate range
    if (start > end || start >= stats.size) {
      // Typically fs might handle this, but let's be safe
    }

    const length = end - start + 1;
    const stream = fs.createReadStream(this.filePath, options);

    return { stream, length };
  }

  async getMimeType(): Promise<string> {
    const auth = await authorizeFilePath(this.filePath);
    if (!auth.isAllowed) {
      throw new Error(auth.message || 'Access denied');
    }

    const ext = path.extname(this.filePath).toLowerCase();
    if (['.mp4', '.m4v'].includes(ext)) return 'video/mp4';
    if (['.webm'].includes(ext)) return 'video/webm';
    if (['.mkv'].includes(ext)) return 'video/x-matroska';
    if (['.avi'].includes(ext)) return 'video/x-msvideo';
    if (['.mov'].includes(ext)) return 'video/quicktime';
    return 'application/octet-stream';
  }

  async getSize(): Promise<number> {
    const auth = await authorizeFilePath(this.filePath);
    if (!auth.isAllowed) {
      throw new Error(auth.message || 'Access denied');
    }

    const stats = await fs.promises.stat(this.filePath);
    return stats.size;
  }
}

export class DriveMediaSource implements IMediaSource {
  private fileId: string;

  constructor(filePath: string) {
    this.fileId = filePath.replace('gdrive://', '');
  }

  async getFFmpegInput(): Promise<string> {
    const proxyUrl = await InternalMediaProxy.getInstance().getUrlForFile(
      this.fileId,
    );
    return proxyUrl;
  }

  async getStream(range?: {
    start: number;
    end: number;
  }): Promise<{ stream: Readable; length: number }> {
    return getDriveStreamWithCache(this.fileId, range);
  }

  async getMimeType(): Promise<string> {
    try {
      const meta = await getDriveFileMetadata(this.fileId);
      return meta.mimeType || 'application/octet-stream';
    } catch {
      return 'application/octet-stream';
    }
  }

  async getSize(): Promise<number> {
    const meta = await getDriveFileMetadata(this.fileId);
    return Number(meta.size);
  }
}

export function createMediaSource(filePath: string): IMediaSource {
  if (filePath.startsWith('gdrive://')) {
    return new DriveMediaSource(filePath);
  }
  return new LocalMediaSource(filePath);
}
