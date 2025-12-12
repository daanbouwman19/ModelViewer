/**
 * @file Provides utility functions for working with album data structures.
 */
import type { Album, MediaFile } from '../../core/types';

/**
 * Recursively counts the total number of textures in an album and all its children.
 * @param album - The album to count textures for.
 * @returns The total number of textures found in the album tree.
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
 * @returns A flattened list of all media files in the album tree.
 */
export const collectTexturesRecursive = (album: Album): MediaFile[] => {
  const results: MediaFile[] = [];

  // Use a stack for iterative traversal to avoid call stack limits
  // and avoid the performance penalty of array concatenation (O(n^2))
  const stack = [album];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.textures) {
      for (const texture of node.textures) {
        results.push(texture);
      }
    }

    if (node.children) {
      // Push children in reverse order so they are processed in original order
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }

  return results;
};

/**
 * Recursively gets all album names from a given album and its children.
 * This is useful for building a list of IDs or keys for tree traversal.
 * @param album - The album to start from.
 * @returns A flat list of album names.
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
export const selectAllAlbums = (
  albums: Album[],
  selectionMap: { [key: string]: boolean },
  isSelected: boolean,
): void => {
  for (const album of albums) {
    selectionMap[album.name] = isSelected;
    if (album.children) {
      selectAllAlbums(album.children, selectionMap, isSelected);
    }
  }
};
