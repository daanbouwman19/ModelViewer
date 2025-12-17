import { Readable } from 'stream';
import { FileSystemProvider, FileMetadata } from '../fs-provider';
import { FileSystemEntry } from '../file-system';
import { getDriveStreamWithCache } from '../drive-stream';
import {
  listDriveDirectory,
  getDriveFileMetadata,
  getDriveParent,
  getDriveFileThumbnail,
} from '../../main/google-drive-service';

export class GoogleDriveProvider implements FileSystemProvider {
  canHandle(filePath: string): boolean {
    return filePath.startsWith('gdrive://');
  }

  async listDirectory(directoryPath: string): Promise<FileSystemEntry[]> {
    const folderId = directoryPath.replace('gdrive://', '') || 'root';
    return listDriveDirectory(folderId);
  }

  async getMetadata(filePath: string): Promise<FileMetadata> {
    const fileId = filePath.replace('gdrive://', '');
    const meta = await getDriveFileMetadata(fileId);

    let duration: number | undefined;
    if (meta.videoMediaMetadata?.durationMillis) {
      duration = Number(meta.videoMediaMetadata.durationMillis) / 1000;
    }

    return {
      size: Number(meta.size || 0),
      mimeType: meta.mimeType || 'application/octet-stream',
      lastModified: meta.createdTime ? new Date(meta.createdTime) : undefined,
      duration,
    };
  }

  async getStream(
    filePath: string,
    options?: { start?: number; end?: number },
  ): Promise<{ stream: Readable; length?: number }> {
    const fileId = filePath.replace('gdrive://', '');
    return getDriveStreamWithCache(fileId, options);
  }

  async getParent(filePath: string): Promise<string | null> {
    const fileId = filePath.replace('gdrive://', '');
    const parentId = await getDriveParent(fileId);
    if (parentId) {
      return `gdrive://${parentId}`;
    }
    return null;
  }

  async resolvePath(filePath: string): Promise<string> {
    return filePath;
  }

  async getThumbnailStream(filePath: string): Promise<Readable | null> {
    const fileId = filePath.replace('gdrive://', '');
    try {
      return await getDriveFileThumbnail(fileId);
    } catch {
      return null;
    }
  }
}
