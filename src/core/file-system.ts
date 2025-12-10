/**
 * @file Provides file system operations for the application core.
 */
import fs from 'fs/promises';
import path from 'path';

export interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/**
 * Lists the contents of a directory.
 * @param directoryPath - The absolute path of the directory to list.
 * @returns A promise that resolves to an array of file system entries.
 */
export async function listDirectory(
  directoryPath: string,
): Promise<FileSystemEntry[]> {
  try {
    const items = await fs.readdir(directoryPath, { withFileTypes: true });
    const entries: FileSystemEntry[] = items.map((item) => ({
      name: item.name,
      path: path.join(directoryPath, item.name),
      isDirectory: item.isDirectory(),
    }));

    // Sort: Directories first, then files. Both alphabetically.
    entries.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });

    return entries;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[file-system.ts] Error listing directory ${directoryPath}:`,
        error,
      );
    }
    throw error;
  }
}

/**
 * Validates if a path exists and is a directory.
 * @param directoryPath - The path to check.
 * @returns True if it exists and is a directory, false otherwise.
 */
export async function isValidDirectory(
  directoryPath: string,
): Promise<boolean> {
  try {
    const stats = await fs.stat(directoryPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
