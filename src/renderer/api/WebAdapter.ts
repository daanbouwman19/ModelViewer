import { IMediaBackend, LoadResult } from './types';
import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
} from '../../core/types';
import type { FileSystemEntry } from '../../core/file-system';

const API_BASE = '/api';

export class WebAdapter implements IMediaBackend {
  async loadFileAsDataURL(filePath: string): Promise<LoadResult> {
    // Web version: Returns HTTP URL directly for the file
    // The server should serve files via a route like /media/file?path=... or static serving
    // We can assume the server handles serving.
    // However, loadFileAsDataURL behavior implies fetching the content and converting to Base64 in some cases.
    // If the frontend can handle URLs, we should prefer that.
    // The interface says it returns { type: 'data-url' | 'http-url' ... }

    // We will assume the server mounts media at /media/... or we use a query param.
    // Let's use a generic serve endpoint: /api/serve?path=...
    const url = `${API_BASE}/serve?path=${encodeURIComponent(filePath)}`;
    return { type: 'http-url', url };
  }

  async recordMediaView(filePath: string): Promise<void> {
    await fetch(`${API_BASE}/media/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
  }

  async getMediaViewCounts(
    filePaths: string[],
  ): Promise<{ [filePath: string]: number }> {
    const res = await fetch(`${API_BASE}/media/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths }),
    });
    return res.json();
  }

  async getAlbumsWithViewCounts(): Promise<Album[]> {
    const res = await fetch(`${API_BASE}/albums`);
    return res.json();
  }

  async reindexMediaLibrary(): Promise<Album[]> {
    const res = await fetch(`${API_BASE}/albums/reindex`, { method: 'POST' });
    return res.json();
  }

  async addMediaDirectory(path?: string): Promise<string | null> {
    if (path) {
      await this.addMediaDirectoryByPath(path);
      return path;
    }
    // In Web, we cannot open a native dialog.
    console.warn('addMediaDirectory not supported in WebAdapter directly.');
    return null;
  }

  // Custom method for Web to add a directory by path (called by FileExplorer logic)
  async addMediaDirectoryByPath(path: string): Promise<void> {
    await fetch(`${API_BASE}/directories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  }

  async removeMediaDirectory(directoryPath: string): Promise<void> {
    await fetch(`${API_BASE}/directories`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: directoryPath }),
    });
  }

  async setDirectoryActiveState(
    directoryPath: string,
    isActive: boolean,
  ): Promise<void> {
    await fetch(`${API_BASE}/directories/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath, isActive }),
    });
  }

  async getMediaDirectories(): Promise<MediaDirectory[]> {
    const res = await fetch(`${API_BASE}/directories`);
    return res.json();
  }

  async getSupportedExtensions(): Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }> {
    const res = await fetch(`${API_BASE}/extensions`);
    return res.json();
  }

  async getServerPort(): Promise<number> {
    // Relevant for direct usage, but in Web we are talking to the server already.
    // We can return window.location.port or a dummy value.
    return parseInt(window.location.port || '80', 10);
  }

  async getMediaUrlGenerator(): Promise<(filePath: string) => string> {
    return (filePath: string) => {
      // In Web, we use a query param 'path' to serve the file
      return `${API_BASE}/serve?path=${encodeURIComponent(filePath)}`;
    };
  }

  async getThumbnailUrlGenerator(): Promise<(filePath: string) => string> {
    return (filePath: string) => {
      return `${API_BASE}/thumbnail?file=${encodeURIComponent(filePath)}`;
    };
  }

  async getVideoStreamUrlGenerator(): Promise<
    (filePath: string, startTime?: number) => string
  > {
    return (filePath: string, startTime = 0) => {
      return `${API_BASE}/stream?file=${encodeURIComponent(filePath)}&startTime=${startTime}`;
    };
  }

  async getVideoMetadata(filePath: string): Promise<{ duration: number }> {
    const res = await fetch(
      `${API_BASE}/metadata?file=${encodeURIComponent(filePath)}`,
    );
    return res.json();
  }

  async openInVlc(): Promise<{ success: boolean; message?: string }> {
    return { success: false, message: 'Not supported in Web version.' };
  }

  async listDirectory(path: string): Promise<FileSystemEntry[]> {
    const res = await fetch(
      `${API_BASE}/fs/ls?path=${encodeURIComponent(path)}`,
    );
    if (!res.ok) throw new Error('Failed to list directory');
    return res.json();
  }

  async getParentDirectory(path: string): Promise<string | null> {
    const res = await fetch(
      `${API_BASE}/fs/parent?path=${encodeURIComponent(path)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.parent;
  }

  async upsertMetadata(
    filePath: string,
    metadata: MediaMetadata,
  ): Promise<void> {
    await fetch(`${API_BASE}/media/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, metadata }),
    });
  }

  async getMetadata(
    filePaths: string[],
  ): Promise<{ [path: string]: MediaMetadata }> {
    const res = await fetch(`${API_BASE}/media/metadata/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths }),
    });
    if (!res.ok) return {};
    return res.json();
  }

  async setRating(filePath: string, rating: number): Promise<void> {
    await fetch(`${API_BASE}/media/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, rating }),
    });
  }

  async createSmartPlaylist(
    name: string,
    criteria: string,
  ): Promise<{ id: number }> {
    const res = await fetch(`${API_BASE}/smart-playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, criteria }),
    });
    return res.json();
  }

  async getSmartPlaylists(): Promise<SmartPlaylist[]> {
    const res = await fetch(`${API_BASE}/smart-playlists`);
    if (!res.ok) return [];
    return res.json();
  }

  async deleteSmartPlaylist(id: number): Promise<void> {
    await fetch(`${API_BASE}/smart-playlists/${id}`, { method: 'DELETE' });
  }

  async updateSmartPlaylist(
    id: number,
    name: string,
    criteria: string,
  ): Promise<void> {
    await fetch(`${API_BASE}/smart-playlists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, criteria }),
    });
  }

  async getAllMetadataAndStats(): Promise<MediaLibraryItem[]> {
    const res = await fetch(`${API_BASE}/media/all`);
    if (!res.ok) return [];
    return res.json();
  }

  async extractMetadata(_filePaths: string[]): Promise<void> {
    // Trigger extraction on server? Not strictly needed for user flow right now but good to have.
    // For now, let's keep it empty as extraction is usually automatic.
    // Or implement a route if needed.
    console.warn('extractMetadata not implemented for WebAdapter', _filePaths);
  }
}
