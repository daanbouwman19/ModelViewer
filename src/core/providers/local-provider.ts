import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { FileSystemProvider, FileMetadata } from '../fs-provider';
import { FileSystemEntry, listDirectory } from '../file-system';
import { getMimeType, isDrivePath } from '../media-utils';

export class LocalFileSystemProvider implements FileSystemProvider {
  canHandle(filePath: string): boolean {
    return !isDrivePath(filePath);
  }

  async listDirectory(directoryPath: string): Promise<FileSystemEntry[]> {
    return listDirectory(directoryPath);
  }

  async getMetadata(filePath: string): Promise<FileMetadata> {
    const stats = await fsPromises.stat(filePath);
    const mimeType = getMimeType(filePath);
    return {
      size: stats.size,
      mimeType,
      lastModified: stats.mtime,
    };
  }

  async getStream(
    filePath: string,
    options?: { start?: number; end?: number },
  ): Promise<{ stream: Readable; length?: number }> {
    return { stream: fs.createReadStream(filePath, options) };
  }

  async getParent(filePath: string): Promise<string | null> {
    if (!filePath) return null;
    const parent = path.dirname(filePath);
    if (parent === filePath) return null;
    return parent;
  }

  async resolvePath(filePath: string): Promise<string> {
    try {
      return await fsPromises.realpath(filePath);
    } catch {
      return path.resolve(filePath);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getThumbnailStream(_filePath: string): Promise<Readable | null> {
    return null;
  }
}
