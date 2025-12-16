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
  async loadFileAsDataURL(filePath: string): Promise<LoadResult> {
    return window.electronAPI.loadFileAsDataURL(filePath);
  }

  async recordMediaView(filePath: string): Promise<void> {
    return window.electronAPI.recordMediaView(filePath);
  }

  async getMediaViewCounts(
    filePaths: string[],
  ): Promise<{ [filePath: string]: number }> {
    return window.electronAPI.getMediaViewCounts(filePaths);
  }

  async getAlbumsWithViewCounts(): Promise<Album[]> {
    return window.electronAPI.getAlbumsWithViewCounts();
  }

  async reindexMediaLibrary(): Promise<Album[]> {
    return window.electronAPI.reindexMediaLibrary();
  }

  async addMediaDirectory(path?: string): Promise<string | null> {
    return window.electronAPI.addMediaDirectory(path);
  }

  async removeMediaDirectory(directoryPath: string): Promise<void> {
    return window.electronAPI.removeMediaDirectory(directoryPath);
  }

  async setDirectoryActiveState(
    directoryPath: string,
    isActive: boolean,
  ): Promise<void> {
    return window.electronAPI.setDirectoryActiveState(directoryPath, isActive);
  }

  async getMediaDirectories(): Promise<MediaDirectory[]> {
    return window.electronAPI.getMediaDirectories();
  }

  async getSupportedExtensions(): Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }> {
    return window.electronAPI.getSupportedExtensions();
  }

  async getServerPort(): Promise<number> {
    return window.electronAPI.getServerPort();
  }

  async getMediaUrlGenerator(): Promise<(filePath: string) => string> {
    const port = await window.electronAPI.getServerPort();
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
    const port = await window.electronAPI.getServerPort();
    return (filePath: string) => {
      // For Drive files, thumbnails might not work yet, but we generate the URL anyway
      return `http://localhost:${port}/video/thumbnail?file=${encodeURIComponent(filePath)}`;
    };
  }

  async getVideoStreamUrlGenerator(): Promise<
    (filePath: string, startTime?: number) => string
  > {
    const port = await window.electronAPI.getServerPort();
    return (filePath: string, startTime = 0) => {
      return `http://localhost:${port}/video/stream?file=${encodeURIComponent(filePath)}&startTime=${startTime}`;
    };
  }

  async getVideoMetadata(filePath: string): Promise<{ duration: number }> {
    const res = await window.electronAPI.getVideoMetadata(filePath);
    if (res.error || res.duration === undefined) {
      throw new Error(res.error || 'Failed to get video metadata');
    }
    return { duration: res.duration };
  }

  async openInVlc(
    filePath: string,
  ): Promise<{ success: boolean; message?: string }> {
    return window.electronAPI.openInVlc(filePath);
  }

  async listDirectory(path: string): Promise<FileSystemEntry[]> {
    return window.electronAPI.listDirectory(path);
  }

  async getParentDirectory(path: string): Promise<string | null> {
    return window.electronAPI.getParentDirectory(path);
  }

  async upsertMetadata(
    filePath: string,
    metadata: MediaMetadata,
  ): Promise<void> {
    return window.electronAPI.upsertMetadata(filePath, metadata);
  }

  async getMetadata(
    filePaths: string[],
  ): Promise<{ [path: string]: MediaMetadata }> {
    return window.electronAPI.getMetadata(filePaths);
  }

  async setRating(filePath: string, rating: number): Promise<void> {
    return window.electronAPI.setRating(filePath, rating);
  }

  async createSmartPlaylist(
    name: string,
    criteria: string,
  ): Promise<{ id: number }> {
    return window.electronAPI.createSmartPlaylist(name, criteria);
  }

  async getSmartPlaylists(): Promise<SmartPlaylist[]> {
    return window.electronAPI.getSmartPlaylists();
  }

  async deleteSmartPlaylist(id: number): Promise<void> {
    return window.electronAPI.deleteSmartPlaylist(id);
  }

  async updateSmartPlaylist(
    id: number,
    name: string,
    criteria: string,
  ): Promise<void> {
    return window.electronAPI.updateSmartPlaylist(id, name, criteria);
  }

  async getAllMetadataAndStats(): Promise<MediaLibraryItem[]> {
    return window.electronAPI.getAllMetadataAndStats();
  }

  async extractMetadata(filePaths: string[]): Promise<void> {
    return window.electronAPI.extractMetadata(filePaths);
  }

  async startGoogleDriveAuth(): Promise<string> {
    return window.electronAPI.startGoogleDriveAuth();
  }

  async submitGoogleDriveAuthCode(code: string): Promise<boolean> {
    return window.electronAPI.submitGoogleDriveAuthCode(code);
  }

  async addGoogleDriveSource(folderId: string): Promise<{ success: boolean; name?: string; error?: string }> {
    return window.electronAPI.addGoogleDriveSource(folderId);
  }
}
