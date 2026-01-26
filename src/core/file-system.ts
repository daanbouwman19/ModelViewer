/**
 * @file Provides file system operations for the application core.
 */
import fs from 'fs/promises';
import path from 'path';
import { SENSITIVE_SUBDIRECTORIES } from './constants.ts';

// Pre-calculate lowercase set for O(1) case-insensitive lookup
const SENSITIVE_SET_LOWER = new Set(
  Array.from(SENSITIVE_SUBDIRECTORIES).map((s) => s.toLowerCase()),
);

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
  if (!directoryPath || directoryPath === 'ROOT') {
    return listDrives();
  }

  if (typeof directoryPath !== 'string' || directoryPath.includes('\0')) {
    throw new Error('Invalid directory path');
  }

  try {
    const items = await fs.readdir(directoryPath, { withFileTypes: true });
    const entries: FileSystemEntry[] = items
      // [SECURITY] Filter out hidden files/dirs and known sensitive files to prevent exposing sensitive data (e.g. .env, .git, server.key)
      .filter((item) => {
        if (item.name.startsWith('.')) return false;
        if (SENSITIVE_SET_LOWER.has(item.name.toLowerCase())) return false;
        return true;
      })
      .map((item) => ({
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
        '[file-system.ts] Error listing directory %s:',
        directoryPath,
        error,
      );
    }
    throw error;
  }
}

import os from 'os';
import { execa } from 'execa';

/**
 * Lists the available drives on Windows.
 * On other platforms, returns the root directory.
 */
export async function listDrives(): Promise<FileSystemEntry[]> {
  if (os.platform() !== 'win32') {
    // For non-Windows, simply return root
    return [
      {
        name: 'Root',
        path: '/',
        isDirectory: true,
      },
    ];
  }

  try {
    const { stdout } = await execa('fsutil', ['fsinfo', 'drives']);
    // Output format: "Drives: C:\ D:\"

    // Remove "Drives:" prefix and split by space
    const drivesLine = stdout.replace('Drives:', '').trim();
    const drives = drivesLine.split(/\s+/).filter((d) => d);

    return drives.map((drive) => ({
      name: drive.replace(/\\$/, ''), // "C:"
      path: drive, // "C:\" (fsutil returns with backslash)
      isDirectory: true,
    }));
  } catch (error) {
    console.error('Failed to list drives:', error);
    // Fallback to C:\ if fsutil fails
    return [
      {
        name: 'C:',
        path: 'C:\\',
        isDirectory: true,
      },
    ];
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
