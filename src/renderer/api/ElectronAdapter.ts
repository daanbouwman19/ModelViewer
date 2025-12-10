import { IMediaBackend, LoadResult } from './types';
import type { Album, MediaDirectory } from '../../core/types';
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
    // Adapter to match interface if types differ slightly, but they should match
    // preload returns { path: string; isActive: boolean }[] which is MediaDirectory
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
      // Use standard encoding for query parameters
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
    const port = await window.electronAPI.getServerPort();
    const res = await fetch(
      `http://localhost:${port}/video/metadata?file=${encodeURIComponent(filePath)}`,
    );
    return res.json();
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
}
