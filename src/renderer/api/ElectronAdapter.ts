import { IMediaBackend, LoadResult } from './types';
import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
} from '../../core/types';
import type { FileSystemEntry } from '../../core/file-system';

export class ElectronAdapter implements IMediaBackend {
  constructor(private bridge = window.electronAPI) {}

  async loadFileAsDataURL(filePath: string): Promise<LoadResult> {
    return this.bridge.loadFileAsDataURL(filePath);
  }

  async recordMediaView(filePath: string): Promise<void> {
    return this.bridge.recordMediaView(filePath);
  }

  async getMediaViewCounts(
    filePaths: string[],
  ): Promise<{ [filePath: string]: number }> {
    return this.bridge.getMediaViewCounts(filePaths);
  }

  async getAlbumsWithViewCounts(): Promise<Album[]> {
    return this.bridge.getAlbumsWithViewCounts();
  }

  async reindexMediaLibrary(): Promise<Album[]> {
    return this.bridge.reindexMediaLibrary();
  }

  async addMediaDirectory(path?: string): Promise<string | null> {
    return this.bridge.addMediaDirectory(path);
  }

  async removeMediaDirectory(directoryPath: string): Promise<void> {
    return this.bridge.removeMediaDirectory(directoryPath);
  }

  async setDirectoryActiveState(
    directoryPath: string,
    isActive: boolean,
  ): Promise<void> {
    return this.bridge.setDirectoryActiveState(directoryPath, isActive);
  }

  async getMediaDirectories(): Promise<MediaDirectory[]> {
    return this.bridge.getMediaDirectories();
  }

  async getSupportedExtensions(): Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }> {
    return this.bridge.getSupportedExtensions();
  }

  async getServerPort(): Promise<number> {
    return this.bridge.getServerPort();
  }

  async getMediaUrlGenerator(): Promise<(filePath: string) => string> {
    const port = await this.bridge.getServerPort();
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
    const port = await this.bridge.getServerPort();
    return (filePath: string) => {
      // For Drive files, thumbnails might not work yet, but we generate the URL anyway
      return `http://localhost:${port}/video/thumbnail?file=${encodeURIComponent(filePath)}`;
    };
  }

  async getVideoStreamUrlGenerator(): Promise<
    (filePath: string, startTime?: number) => string
  > {
    const port = await this.bridge.getServerPort();
    return (filePath: string, startTime = 0) => {
      return `http://localhost:${port}/video/stream?file=${encodeURIComponent(filePath)}&startTime=${startTime}`;
    };
  }

  async getVideoMetadata(filePath: string): Promise<{ duration: number }> {
    const res = await this.bridge.getVideoMetadata(filePath);
    if (res.error || res.duration === undefined) {
      throw new Error(res.error || 'Failed to get video metadata');
    }
    return { duration: res.duration };
  }

  async openInVlc(
    filePath: string,
  ): Promise<{ success: boolean; message?: string }> {
    return this.bridge.openInVlc(filePath);
  }

  async listDirectory(path: string): Promise<FileSystemEntry[]> {
    return this.bridge.listDirectory(path);
  }

  async getParentDirectory(path: string): Promise<string | null> {
    return this.bridge.getParentDirectory(path);
  }

  async upsertMetadata(
    filePath: string,
    metadata: MediaMetadata,
  ): Promise<void> {
    return this.bridge.upsertMetadata(filePath, metadata);
  }

  async getMetadata(
    filePaths: string[],
  ): Promise<{ [path: string]: MediaMetadata }> {
    return this.bridge.getMetadata(filePaths);
  }

  async setRating(filePath: string, rating: number): Promise<void> {
    return this.bridge.setRating(filePath, rating);
  }

  async createSmartPlaylist(
    name: string,
    criteria: string,
  ): Promise<{ id: number }> {
    return this.bridge.createSmartPlaylist(name, criteria);
  }

  async getSmartPlaylists(): Promise<SmartPlaylist[]> {
    return this.bridge.getSmartPlaylists();
  }

  async deleteSmartPlaylist(id: number): Promise<void> {
    return this.bridge.deleteSmartPlaylist(id);
  }

  async updateSmartPlaylist(
    id: number,
    name: string,
    criteria: string,
  ): Promise<void> {
    return this.bridge.updateSmartPlaylist(id, name, criteria);
  }

  async getAllMetadataAndStats(): Promise<MediaLibraryItem[]> {
    return this.bridge.getAllMetadataAndStats();
  }

  async extractMetadata(filePaths: string[]): Promise<void> {
    return this.bridge.extractMetadata(filePaths);
  }

  async startGoogleDriveAuth(): Promise<string> {
    const url = await this.bridge.startGoogleDriveAuth();
    // In strict hexagonal architecture, the backend returns the URL,
    // and the "Adapter" (Client) decides how to present it.
    // For Electron, we open it in the default browser.
    window.open(url, '_blank');
    return url;
  }

  async submitGoogleDriveAuthCode(code: string): Promise<boolean> {
    return this.bridge.submitGoogleDriveAuthCode(code);
  }

  async addGoogleDriveSource(
    folderId: string,
  ): Promise<{ success: boolean; name?: string; error?: string }> {
    return this.bridge.addGoogleDriveSource(folderId);
  }

  async listGoogleDriveDirectory(folderId: string): Promise<FileSystemEntry[]> {
    return this.bridge.listGoogleDriveDirectory(folderId);
  }

  async getGoogleDriveParent(folderId: string): Promise<string | null> {
    return this.bridge.getGoogleDriveParent(folderId);
  }
}
