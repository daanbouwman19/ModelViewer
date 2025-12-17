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
 * Recursively gets all album IDs from a given album and its children.
 * This is useful for building a list of IDs or keys for tree traversal.
 * Optimized to use iterative traversal instead of recursion to avoid O(N^2) array copying.
 * @param album - The album to start from.
 * @returns A flat list of album IDs.
 */
export const getAlbumAndChildrenIds = (album: Album): string[] => {
  const ids: string[] = [];
  const stack = [album];

  while (stack.length > 0) {
    const node = stack.pop()!;
    ids.push(node.id);

    if (node.children) {
      // Push children in reverse order so they are processed in original order
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  return ids;
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
    selectionMap[album.id] = isSelected;
    if (album.children) {
      selectAllAlbums(album.children, selectionMap, isSelected);
    }
  }
};

/**
 * Collects all textures (media files) from a list of albums and their children
 * if their IDs are marked as true in the provided selection map.
 * This is used to build the global media pool for the slideshow.
 * @param albums - The list of root albums to traverse.
 * @param selection - A map where keys are album IDs and values are booleans indicating selection.
 * @returns A flattened list of all media files from the selected albums.
 */
export const collectSelectedTextures = (
  albums: Album[],
  selection: { [key: string]: boolean },
): MediaFile[] => {
  const textures: MediaFile[] = [];
  // Use a stack for iterative traversal to avoid call stack limits
  // We process the list in reverse so that popping from stack maintains order
  const stack = [...albums].reverse();

  while (stack.length > 0) {
    const album = stack.pop()!;

    if (selection[album.id] && album.textures) {
      for (const texture of album.textures) {
        textures.push(texture);
      }
    }

    if (album.children && album.children.length > 0) {
      // Push children in reverse order so they are processed in original order
      for (let i = album.children.length - 1; i >= 0; i--) {
        stack.push(album.children[i]);
      }
    }
  }
  return textures;
};
