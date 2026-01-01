import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from '../constants';

/**
 * Extracts the file extension from a file path or name.
 * Returns the extension including the dot (e.g. '.jpg') in lowercase.
 * Returns an empty string if no extension is found or if it's a dotfile.
 *
 * @param filePath - The file path or name.
 */
export function getFileExtension(filePath: string): string {
  if (!filePath) return '';

  // Handle Google Drive paths or names
  // If it starts with gdrive://, we might need to look at the name if provided,
  // but this function assumes it receives a string that contains the extension at the end.
  // The caller is responsible for passing the name if the path doesn't contain it.

  const lastDotIndex = filePath.lastIndexOf('.');
  if (lastDotIndex === -1) return '';

  const lastSlashIndex = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\'),
  );

  // If the last dot is before the last slash, it's in the directory name
  if (lastDotIndex < lastSlashIndex) return '';

  // If the dot is the first character after the slash (or at start), it's a dotfile
  if (lastDotIndex === lastSlashIndex + 1) return '';

  return filePath.substring(lastDotIndex).toLowerCase();
}

/**
 * Checks if the given file path or name corresponds to a supported image.
 *
 * @param filePath - The file path or name.
 */
export function isImageFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Checks if the given file path or name corresponds to a supported video.
 *
 * @param filePath - The file path or name.
 */
export function isVideoFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return SUPPORTED_VIDEO_EXTENSIONS.includes(ext);
}
