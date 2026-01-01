/**
 * @file Utilities for media file operations, including caching.
 */
import type { MediaFile } from '../../core/types';

/**
 * Cache for file extensions to reduce string operations.
 * Keyed by MediaFile object reference.
 */
const extensionCache = new WeakMap<MediaFile, string>();

/**
 * Gets the file extension for a media file, using a cache to avoid repeated string operations.
 * @param file - The media file object.
 * @returns The lowercased file extension (including the dot), or an empty string.
 */
export const getCachedExtension = (file: MediaFile): string => {
  if (extensionCache.has(file)) {
    return extensionCache.get(file)!;
  }

  const nameOrPath = file.name || file.path;
  const lastDotIndex = nameOrPath.lastIndexOf('.');

  let ext = '';
  if (lastDotIndex !== -1) {
    // Check if the dot is actually part of the filename and not a directory separator
    // (though for 'name' this is less likely, for 'path' it matters)
    const lastSlashIndex = Math.max(
      nameOrPath.lastIndexOf('/'),
      nameOrPath.lastIndexOf('\\'),
    );

    // Ensure dot is after the last slash, and not a leading dot (hidden file) unless it has an extension
    // Logic from MediaGridItem:
    // if (lastDotIndex < lastSlashIndex) return '';
    // if (lastDotIndex === lastSlashIndex + 1) return '';

    if (lastDotIndex > lastSlashIndex && lastDotIndex !== lastSlashIndex + 1) {
      ext = nameOrPath.substring(lastDotIndex).toLowerCase();
    }
  }

  extensionCache.set(file, ext);
  return ext;
};
