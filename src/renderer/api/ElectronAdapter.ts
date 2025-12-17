import { IMediaBackend, LoadResult } from './types';
import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
  IpcResult,
} from '../../core/types';
import type { FileSystemEntry } from '../../core/file-system';

export class ElectronAdapter implements IMediaBackend {
  constructor(private bridge = window.electronAPI) {}

  private async invoke<T>(promise: Promise<IpcResult<T>>): Promise<T> {
    const result = await promise;
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  async loadFileAsDataURL(filePath: string): Promise<LoadResult> {
    return this.invoke(this.bridge.loadFileAsDataURL(filePath));
  }

  async recordMediaView(filePath: string): Promise<void> {
    return this.invoke(this.bridge.recordMediaView(filePath));
  }

  async getMediaViewCounts(
    filePaths: string[],
  ): Promise<{ [filePath: string]: number }> {
    return this.invoke(this.bridge.getMediaViewCounts(filePaths));
  }

  async getAlbumsWithViewCounts(): Promise<Album[]> {
    return this.invoke(this.bridge.getAlbumsWithViewCounts());
  }

  async reindexMediaLibrary(): Promise<Album[]> {
    return this.invoke(this.bridge.reindexMediaLibrary());
  }

  async addMediaDirectory(path?: string): Promise<string | null> {
    return this.invoke(this.bridge.addMediaDirectory(path));
  }

  async removeMediaDirectory(directoryPath: string): Promise<void> {
    return this.invoke(this.bridge.removeMediaDirectory(directoryPath));
  }

  async setDirectoryActiveState(
    directoryPath: string,
    isActive: boolean,
  ): Promise<void> {
    return this.invoke(this.bridge.setDirectoryActiveState(directoryPath, isActive));
  }

  async getMediaDirectories(): Promise<MediaDirectory[]> {
    return this.invoke(this.bridge.getMediaDirectories());
  }

  async getSupportedExtensions(): Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }> {
    return this.invoke(this.bridge.getSupportedExtensions());
  }

  async getServerPort(): Promise<number> {
    return this.invoke(this.bridge.getServerPort());
  }

  async getMediaUrlGenerator(): Promise<(filePath: string) => string> {
    const port = await this.invoke(this.bridge.getServerPort());
    return (filePath: string) => {
      if (filePath.startsWith('gdrive://')) {
        return `http://localhost:${port}/${encodeURIComponent(filePath)}`;
      }
      let pathForUrl = filePath.replace(/\\/g, '/');
      pathForUrl = pathForUrl
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      return `http://localhost:${port}/${pathForUrl}`;
    };
  }

  async getThumbnailUrlGenerator(): Promise<(filePath: string) => string> {
    const port = await this.invoke(this.bridge.getServerPort());
    return (filePath: string) => {
      return `http://localhost:${port}/video/thumbnail?file=${encodeURIComponent(filePath)}`;
    };
  }

  async getVideoStreamUrlGenerator(): Promise<
    (filePath: string, startTime?: number) => string
  > {
    const port = await this.invoke(this.bridge.getServerPort());
    return (filePath: string, startTime = 0) => {
      return `http://localhost:${port}/video/stream?file=${encodeURIComponent(filePath)}&startTime=${startTime}`;
    };
  }

  async getVideoMetadata(filePath: string): Promise<{ duration: number }> {
    const res = await this.invoke(this.bridge.getVideoMetadata(filePath));
    if (res.error || res.duration === undefined) {
      throw new Error(res.error || 'Failed to get video metadata');
    }
    return { duration: res.duration };
  }

  async openInVlc(
    filePath: string,
  ): Promise<{ success: boolean; message?: string }> {
    return this.invoke(this.bridge.openInVlc(filePath));
  }

  async listDirectory(path: string): Promise<FileSystemEntry[]> {
    return this.invoke(this.bridge.listDirectory(path));
  }

  async getParentDirectory(path: string): Promise<string | null> {
    return this.invoke(this.bridge.getParentDirectory(path));
  }

  async upsertMetadata(
    filePath: string,
    metadata: MediaMetadata,
  ): Promise<void> {
    return this.invoke(this.bridge.upsertMetadata(filePath, metadata));
  }

  async getMetadata(
    filePaths: string[],
  ): Promise<{ [path: string]: MediaMetadata }> {
    return this.invoke(this.bridge.getMetadata(filePaths));
  }

  async setRating(filePath: string, rating: number): Promise<void> {
    return this.invoke(this.bridge.setRating(filePath, rating));
  }

  async createSmartPlaylist(
    name: string,
    criteria: string,
  ): Promise<{ id: number }> {
    return this.invoke(this.bridge.createSmartPlaylist(name, criteria));
  }

  async getSmartPlaylists(): Promise<SmartPlaylist[]> {
    return this.invoke(this.bridge.getSmartPlaylists());
  }

  async deleteSmartPlaylist(id: number): Promise<void> {
    return this.invoke(this.bridge.deleteSmartPlaylist(id));
  }

  async updateSmartPlaylist(
    id: number,
    name: string,
    criteria: string,
  ): Promise<void> {
    return this.invoke(this.bridge.updateSmartPlaylist(id, name, criteria));
  }

  async getAllMetadataAndStats(): Promise<MediaLibraryItem[]> {
    return this.invoke(this.bridge.getAllMetadataAndStats());
  }

  async extractMetadata(filePaths: string[]): Promise<void> {
    return this.invoke(this.bridge.extractMetadata(filePaths));
  }

  async startGoogleDriveAuth(): Promise<string> {
    const url = await this.invoke(this.bridge.startGoogleDriveAuth());
    await this.invoke(this.bridge.openExternal(url));
    return url;
  }

  async submitGoogleDriveAuthCode(code: string): Promise<boolean> {
    return this.invoke(this.bridge.submitGoogleDriveAuthCode(code));
  }

  async addGoogleDriveSource(
    folderId: string,
  ): Promise<{ success: boolean; name?: string; error?: string }> {
    try {
      const res = await this.invoke(this.bridge.addGoogleDriveSource(folderId));
      return { success: true, name: res.name };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  async listGoogleDriveDirectory(folderId: string): Promise<FileSystemEntry[]> {
    return this.invoke(this.bridge.listGoogleDriveDirectory(folderId));
  }

  async getGoogleDriveParent(folderId: string): Promise<string | null> {
    return this.invoke(this.bridge.getGoogleDriveParent(folderId));
  }
}
