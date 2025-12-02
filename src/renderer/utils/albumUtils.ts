/**
 * @file Provides utility functions for working with album data structures.
 */
import type { Album, MediaFile } from '../../main/media-scanner';

/**
 * Recursively counts the total number of textures in an album and all its children.
 * @param album - The album to count textures for.
 * @returns The total number of textures.
 */
export const countTextures = (album: Album): number => {
  let count = album.textures.length;
  if (album.children) {
    for (const child of album.children) {
      count += countTextures(child);
    }
  }
  return count;
};

/**
 * Recursively collects all textures from an album and its children.
 * @param album - The album to start from.
 * @returns A list of media files.
 */
export const collectTexturesRecursive = (album: Album): MediaFile[] => {
  let textures = [...album.textures];
  if (album.children) {
    for (const child of album.children) {
      textures = textures.concat(collectTexturesRecursive(child));
    }
  }
  return textures;
};

/**
 * Recursively gets all album names from a given album and its children.
 * @param album - The album to start from.
 * @returns A list of album names.
 */
export const getAlbumAndChildrenNames = (album: Album): string[] => {
  return [
    album.name,
    ...(album.children?.flatMap(getAlbumAndChildrenNames) ?? []),
  ];
};

/**
 * Recursively sets the selection state for all albums in a tree.
 * @param albums - The albums to traverse.
 * @param selectionMap - The selection map to modify.
 * @param isSelected - The selection state to set.
 */
export const selectAllAlbums = (albums: Album[], selectionMap: { [key: string]: boolean }, isSelected: boolean): void => {
  for (const album of albums) {
    selectionMap[album.name] = isSelected;
    if (album.children) {
      selectAllAlbums(album.children, selectionMap, isSelected);
    }
  }
};
