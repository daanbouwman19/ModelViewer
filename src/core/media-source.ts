import fs from 'fs';

import { Readable } from 'stream';
import { getDriveFileMetadata } from '../main/google-drive-service';
import { getDriveStreamWithCache } from './drive-stream';
import { authorizeFilePath, AuthorizationResult } from './security';
import { InternalMediaProxy } from './media-proxy';
import { IMediaSource } from './media-source-types';
import { getMimeType, isDrivePath, getDriveId } from './media-utils';

export class LocalMediaSource implements IMediaSource {
  private authResult: Promise<AuthorizationResult> | undefined;

  constructor(private filePath: string) {}

  private async ensureAuthorized(): Promise<void> {
    if (!this.authResult) {
      this.authResult = authorizeFilePath(this.filePath);
    }
    const auth = await this.authResult;
    if (!auth.isAllowed) {
      throw new Error(auth.message || 'Access denied');
    }
  }

  async getFFmpegInput(): Promise<string> {
    await this.ensureAuthorized();
    return this.filePath;
  }

  async getStream(range?: {
    start: number;
    end: number;
  }): Promise<{ stream: Readable; length: number }> {
    await this.ensureAuthorized();

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
      // Return empty stream or throw.
      // Since we want to be robust, let's return an empty stream
      // or rely on caller to handle the 416 based on lengthCheck?
      // Actually caller checks size. But if we are here, something is odd.
      // Let's just allow fs to handle or return empty.
      // fs.createReadStream with invalid range might error or return empty.
      // We'll throw to be safe so caller sends 416 if they catch it,
      // but serveRawStream checks size before calling this.
    }

    const length = end - start + 1;
    const stream = fs.createReadStream(this.filePath, options);

    return { stream, length };
  }

  async getMimeType(): Promise<string> {
    await this.ensureAuthorized();
    return getMimeType(this.filePath);
  }

  async getSize(): Promise<number> {
    await this.ensureAuthorized();
    const stats = await fs.promises.stat(this.filePath);
    return stats.size;
  }
}

export class DriveMediaSource implements IMediaSource {
  private fileId: string;

  constructor(filePath: string) {
    this.fileId = getDriveId(filePath);
  }

  async getFFmpegInput(): Promise<string> {
    const proxyUrl = await InternalMediaProxy.getInstance().getUrlForFile(
      this.fileId,
    );
    try {
      const meta = await getDriveFileMetadata(this.fileId);
      if (meta.name) {
        const lastDot = meta.name.lastIndexOf('.');
        if (lastDot !== -1) {
          const ext = meta.name.substring(lastDot); // includes dot
          return `${proxyUrl}${ext}`;
        }
      }
    } catch (e) {
      console.warn('Failed to resolve extension for Drive file input', e);
    }
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
  if (isDrivePath(filePath)) {
    return new DriveMediaSource(filePath);
  }
  return new LocalMediaSource(filePath);
}
