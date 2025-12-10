/**
 * @file Shared type definitions for the application core.
 */

export interface MediaFile {
  name: string;
  path: string;
  viewCount?: number;
}

export interface Album {
  name: string;
  textures: MediaFile[];
  children: Album[];
}

export interface MediaDirectory {
  path: string;
  isActive: boolean;
}
