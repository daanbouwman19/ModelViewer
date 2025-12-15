import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaMetadata,
  MediaLibraryItem,
} from '../../core/types';
import type { FileSystemEntry } from '../../core/file-system';

export interface LoadResult {
  type: 'data-url' | 'http-url' | 'error';
  url?: string;
  message?: string;
}

export interface IMediaBackend {
  loadFileAsDataURL(filePath: string): Promise<LoadResult>;
  recordMediaView(filePath: string): Promise<void>;
  getMediaViewCounts(
    filePaths: string[],
  ): Promise<{ [filePath: string]: number }>;
  getAlbumsWithViewCounts(): Promise<Album[]>;
  reindexMediaLibrary(): Promise<Album[]>;
  addMediaDirectory(path?: string): Promise<string | null>; // Electron only (opens dialog)
  removeMediaDirectory(directoryPath: string): Promise<void>;
  setDirectoryActiveState(
    directoryPath: string,
    isActive: boolean,
  ): Promise<void>;
  getMediaDirectories(): Promise<MediaDirectory[]>;
  getSupportedExtensions(): Promise<{
    images: string[];
    videos: string[];
    all: string[];
  }>;
  getServerPort(): Promise<number>;
  getMediaUrlGenerator(): Promise<(filePath: string) => string>;
  getThumbnailUrlGenerator(): Promise<(filePath: string) => string>;
  getVideoStreamUrlGenerator(): Promise<
    (filePath: string, startTime?: number) => string
  >;
  getVideoMetadata(filePath: string): Promise<{ duration: number }>;
  openInVlc(filePath: string): Promise<{ success: boolean; message?: string }>;

  listDirectory(path: string): Promise<FileSystemEntry[]>;

  getParentDirectory(path: string): Promise<string | null>;

  // Smart Playlists & Metadata
  upsertMetadata(filePath: string, metadata: MediaMetadata): Promise<void>;
  getMetadata(filePaths: string[]): Promise<{ [path: string]: MediaMetadata }>;
  setRating(filePath: string, rating: number): Promise<void>;
  createSmartPlaylist(name: string, criteria: string): Promise<{ id: number }>;
  getSmartPlaylists(): Promise<SmartPlaylist[]>;
  deleteSmartPlaylist(id: number): Promise<void>;
  updateSmartPlaylist(
    id: number,
    name: string,
    criteria: string,
  ): Promise<void>;

  getAllMetadataAndStats(): Promise<MediaLibraryItem[]>;
  extractMetadata(filePaths: string[]): Promise<void>;
}
