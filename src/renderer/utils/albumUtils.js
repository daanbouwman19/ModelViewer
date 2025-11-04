/**
 * @file Provides utility functions for working with album data structures.
 */

/**
 * @typedef {import('../../main/media-scanner.js').Album} Album
 * @typedef {import('../../main/media-scanner.js').MediaFile} MediaFile
 */

/**
 * Recursively counts the total number of textures in an album and all its children.
 * @param {Album} album - The album to count textures for.
 * @returns {number} The total number of textures.
 */
export const countTextures = (album) => {
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
 * @param {Album} album - The album to start from.
 * @returns {MediaFile[]} A list of media files.
 */
export const collectTexturesRecursive = (album) => {
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
 * @param {Album} album - The album to start from.
 * @returns {string[]} A list of album names.
 */
export const getAlbumAndChildrenNames = (album) => {
  return [
    album.name,
    ...(album.children?.flatMap(getAlbumAndChildrenNames) ?? []),
  ];
};

/**
 * Recursively sets the selection state for all albums in a tree.
 * @param {Album[]} albums - The albums to traverse.
 * @param {{ [key: string]: boolean }} selectionMap - The selection map to modify.
 * @param {boolean} isSelected - The selection state to set.
 */
export const selectAllAlbums = (albums, selectionMap, isSelected) => {
  for (const album of albums) {
    selectionMap[album.name] = isSelected;
    if (album.children) {
      selectAllAlbums(album.children, selectionMap, isSelected);
    }
  }
};
