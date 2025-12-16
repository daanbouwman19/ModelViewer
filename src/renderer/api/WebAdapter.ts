import { IMediaBackend, LoadResult } from './types';
import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
} from '../../core/types';
import type { FileSystemEntry } from '../../core/file-system';

export class WebAdapter implements IMediaBackend {
  async loadFileAsDataURL(filePath: string): Promise<LoadResult> {
    // In web mode, we construct a URL to the backend
    const encodedPath = encodeURIComponent(filePath);
    return {
      type: 'http-url',
      url: `/api/serve?path=${encodedPath}`,
    };
  }

  async recordMediaView(filePath: string): Promise<void> {
    await fetch('/api/media/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
  }

  async getMediaViewCounts(
    filePaths: string[],
  ): Promise<{ [filePath: string]: number }> {
    const res = await fetch('/api/media/views', {
      method: 'POST', // Use POST for batch
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths }),
    });
    return res.json();
  }

  async getAlbumsWithViewCounts(): Promise<Album[]> {
    const res = await fetch('/api/albums');
    return res.json();
  }

  async reindexMediaLibrary(): Promise<Album[]> {
    const res = await fetch('/api/albums/reindex', { method: 'POST' });
    return res.json();
  }

  async addMediaDirectory(path?: string): Promise<string | null> {
    if (!path) {
      console.warn('WebAdapter: Adding directory requires a path input.');
      return null;
    }
    await fetch('/api/directories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return path;
  }

  async removeMediaDirectory(directoryPath: string): Promise<void> {
    await fetch('/api/directories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: directoryPath }),
    });
  }

  async setDirectoryActiveState(
    directoryPath: string,
    isActive: boolean,
  ): Promise<void> {
    await fetch('/api/directories/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath, isActive }),
    });
  }

  async getMediaDirectories(): Promise<MediaDirectory[]> {
    const res = await fetch('/api/directories');
    return res.json();
  }

  async getSupportedExtensions(): Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }> {
    const res = await fetch('/api/config/extensions');
    return res.json();
  }

  async getServerPort(): Promise<number> {
    const port = window.location.port;
    return port ? parseInt(port, 10) : 80;
  }

  async getMediaUrlGenerator(): Promise<(filePath: string) => string> {
    return (filePath: string) =>
      `/api/serve?path=${encodeURIComponent(filePath)}`;
  }

  async getThumbnailUrlGenerator(): Promise<(filePath: string) => string> {
    return (filePath: string) =>
      `/api/thumbnail?file=${encodeURIComponent(filePath)}`;
  }

  async getVideoStreamUrlGenerator(): Promise<
    (filePath: string, startTime?: number) => string
  > {
    return (filePath: string, startTime = 0) =>
      `/api/stream?file=${encodeURIComponent(filePath)}&startTime=${startTime}`;
  }

  async openInVlc(): Promise<{ success: boolean; message?: string }> {
    return { success: false, message: 'Not supported in Web version.' };
  }

  async getVideoMetadata(filePath: string): Promise<{ duration: number }> {
    try {
      const res = await fetch(
        `/api/metadata?file=${encodeURIComponent(filePath)}`,
      );
      const data = await res.json();
      if (typeof data.duration === 'number') {
        return { duration: data.duration };
      }
      return { duration: 0 };
    } catch {
      return { duration: 0 };
    }
  }

  async listDirectory(directoryPath: string): Promise<FileSystemEntry[]> {
    const res = await fetch(
      `/api/fs/ls?path=${encodeURIComponent(directoryPath)}`,
    );
    if (!res.ok) throw new Error('Failed to list directory');
    return res.json();
  }

  async getParentDirectory(path: string): Promise<string | null> {
    const res = await fetch(`/api/fs/parent?path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.parent;
  }

  async upsertMetadata(
    filePath: string,
    metadata: MediaMetadata,
  ): Promise<void> {
    await fetch('/api/media/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, metadata }),
    });
  }

  async getMetadata(
    filePaths: string[],
  ): Promise<{ [path: string]: MediaMetadata }> {
    const res = await fetch('/api/media/metadata/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths }),
    });
    return res.json();
  }

  async setRating(filePath: string, rating: number): Promise<void> {
    await fetch('/api/media/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, rating }),
    });
  }

  async createSmartPlaylist(
    name: string,
    criteria: string,
  ): Promise<{ id: number }> {
    const res = await fetch('/api/smart-playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, criteria }),
    });
    return res.json();
  }

  async getSmartPlaylists(): Promise<SmartPlaylist[]> {
    const res = await fetch('/api/smart-playlists');
    return res.json();
  }

  async deleteSmartPlaylist(id: number): Promise<void> {
    await fetch(`/api/smart-playlists/${id}`, {
      method: 'DELETE',
    });
  }

  async updateSmartPlaylist(
    id: number,
    name: string,
    criteria: string,
  ): Promise<void> {
    await fetch(`/api/smart-playlists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, criteria }),
    });
  }

  async getAllMetadataAndStats(): Promise<MediaLibraryItem[]> {
    const res = await fetch('/api/media/all');
    return res.json();
  }

  async extractMetadata(filePaths: string[]): Promise<void> {
    await fetch('/api/media/extract-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths }),
    });
  }

  // Google Drive (Not implemented for Web in this scope)
  async startGoogleDriveAuth(): Promise<string> {
    return '';
  }
  async submitGoogleDriveAuthCode(): Promise<boolean> {
    return false;
  }
  async addGoogleDriveSource(): Promise<{
    success: boolean;
    name?: string;
    error?: string;
  }> {
    return { success: false, error: 'Not supported in Web version' };
  }
}
