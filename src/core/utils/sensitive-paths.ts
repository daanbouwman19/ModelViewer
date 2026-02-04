/**
 * @file Utilities for detecting and managing sensitive files and directories.
 */
import fs from 'fs/promises';
import path from 'path';
import {
  SENSITIVE_SUBDIRECTORIES,
  WINDOWS_RESTRICTED_ROOT_PATHS,
} from '../constants.ts';
import { safeLog, safeWarn } from './logger.ts';
import { isErrnoException } from './error-utils.ts';

// Mutable set of sensitive directories, initialized with defaults.
// Ensure all initial values are lowercase for case-insensitive checks.
const sensitiveSubdirectoriesSet = new Set(
  Array.from(SENSITIVE_SUBDIRECTORIES).map((d) => d.toLowerCase()),
);

/**
 * Registers a new sensitive file or directory name to block.
 * @param filename - The name of the file or directory.
 */
export function registerSensitiveFile(filename: string): void {
  if (!filename) return;
  sensitiveSubdirectoriesSet.add(filename.toLowerCase());
}

/**
 * Loads security configuration from a JSON file to extend sensitive directories.
 * @param configPath - Path to the security configuration file.
 */
export async function loadSecurityConfig(configPath: string): Promise<void> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    if (
      config &&
      typeof config === 'object' &&
      Array.isArray(config.sensitiveSubdirectories) &&
      config.sensitiveSubdirectories.every(
        (i: unknown) => typeof i === 'string',
      )
    ) {
      for (const dir of config.sensitiveSubdirectories) {
        registerSensitiveFile(dir);
      }
      safeLog(
        `[Security] Loaded ${config.sensitiveSubdirectories.length} custom sensitive directories.`,
      );
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      // Ignore missing config file, use defaults.
      return;
    }

    safeWarn(
      `[Security] Failed to load security config from ${configPath}:`,
      error,
    );
    throw error;
  }
}

/**
 * Helper to get Windows restricted paths from environment or defaults.
 */
function getWindowsRestrictedPaths(): string[] {
  const drive = process.env.SystemDrive || 'C:';
  return WINDOWS_RESTRICTED_ROOT_PATHS.map((r) => {
    switch (r) {
      case 'Windows':
        return process.env.SystemRoot || `${drive}\\Windows`;
      case 'Program Files':
        return process.env.ProgramFiles || `${drive}\\Program Files`;
      case 'Program Files (x86)':
        return (
          process.env['ProgramFiles(x86)'] || `${drive}\\Program Files (x86)`
        );
      case 'ProgramData':
        return process.env.ProgramData || `${drive}\\ProgramData`;
      default:
        // This case should not be reached with current constants.
        // Adding a warning helps catch future configuration errors.
        safeWarn(`[Security] Unhandled restricted path component: ${r}`);
        return `${drive}\\${r}`;
    }
  });
}

// Common Linux/Unix sensitive directories
const LINUX_RESTRICTED_PATHS = [
  '/etc',
  '/proc',
  '/sys',
  '/root',
  '/boot',
  '/dev',
  '/bin',
  '/sbin',
  '/usr',
  '/lib',
  '/lib64',
  '/opt',
  '/srv',
  '/tmp',
  '/run',
  '/var',
];

/**
 * Checks if a filename is sensitive (should be hidden/blocked).
 * @param filename - The name of the file.
 * @returns True if the filename is sensitive.
 */
export function isSensitiveFilename(filename: string): boolean {
  if (!filename) return false;
  const lower = filename.toLowerCase();

  // Check exact match first
  if (sensitiveSubdirectoriesSet.has(lower)) {
    return true;
  }

  // Also block variations of the sensitive directories (e.g. .ssh.bak, .env.local)
  for (const sensitiveDir of sensitiveSubdirectoriesSet) {
    if (lower.startsWith(sensitiveDir + '.')) {
      return true;
    }
  }

  // [SECURITY] Block sensitive file variations (e.g. backups, old versions)

  // 1. SSH Private Keys (block variations unless public key)
  const sshKeys = ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'];
  if (sshKeys.some((k) => lower.startsWith(k)) && !lower.endsWith('.pub')) {
    return true;
  }

  // 2. Generic Sensitive Prefixes (block all variations)
  // This covers configs, credentials, history files, etc.
  const sensitivePrefixes = [
    // Server Certs
    'server.key',
    'server.crt',
    'server.cert',
    // Docker
    'dockerfile',
    'docker-compose',
    // Package Managers
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    '.npmrc',
    // Env & Auth
    '.env',
    '.htpasswd',
    '.netrc',
    // Shell History & Config
    '.bash_history',
    '.zsh_history',
    '.sh_history',
    '.bashrc',
    '.zshrc',
    '.profile',
    '.bash_profile',
    // System
    'autorun.inf',
    'boot.ini',
    'bootmgr',
    'ntuser.dat',
  ];

  if (sensitivePrefixes.some((p) => lower.startsWith(p))) {
    return true;
  }

  return false;
}

/**
 * Checks if a path segment is hidden (starts with .) or sensitive.
 */
export function isHiddenOrSensitive(segment: string): boolean {
  return segment.startsWith('.') || isSensitiveFilename(segment);
}

/**
 * Checks if a relative path contains sensitive segments.
 */
export function hasSensitiveSegments(relativePath: string): boolean {
  // Normalize separators to handle mixed separators (e.g. in virtual paths)
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments.some(isHiddenOrSensitive);
}

/**
 * Checks if a path is restricted for listing contents.
 * Allows root listing for navigation, but blocks internal system folders.
 * @param dirPath - The path to check.
 * @returns True if the path is restricted.
 */
export function isRestrictedPath(dirPath: string): boolean {
  if (!dirPath) return true;
  const p = process.platform === 'win32' ? path.win32 : path.posix;
  const normalized = p.resolve(dirPath);
  const segments = normalized.split(p.sep);

  // Check if any segment is a sensitive directory (e.g. .ssh)
  // We use the same list, but check if the *target* directory itself is sensitive
  // or if we are trying to list inside it.
  // Note: listing /home/user is fine, listing /home/user/.ssh is not.
  if (segments.some(isHiddenOrSensitive)) {
    return true;
  }

  if (process.platform === 'win32') {
    // Allow C:\ (to navigate), but block C:\Windows etc.
    const restricted = getWindowsRestrictedPaths();
    return restricted.some(
      (r) =>
        normalized.toLowerCase() === r.toLowerCase() ||
        normalized.toLowerCase().startsWith(r.toLowerCase() + '\\'),
    );
  } else {
    // Allow / (to navigate), but block /etc, /proc, /root, etc.
    return LINUX_RESTRICTED_PATHS.some(
      (r) => normalized === r || normalized.startsWith(r + '/'),
    );
  }
}

/**
 * Checks if a path is a sensitive system root that should not be scanned recursively.
 * Used when adding media directories.
 * @param dirPath - The path to check.
 * @returns True if the path is sensitive.
 */
export function isSensitiveDirectory(dirPath: string): boolean {
  if (!dirPath) return true;
  const p = process.platform === 'win32' ? path.win32 : path.posix;
  const normalized = p.resolve(dirPath);
  const segments = normalized.split(p.sep);

  // Check against sensitive subdirectories (e.g. .ssh, .env)
  // This prevents adding a sensitive directory (like ~/.ssh) as a media root
  if (segments.some(isHiddenOrSensitive)) {
    return true;
  }

  if (process.platform === 'win32') {
    // Block C:\, C:\Windows, C:\Program Files, etc.
    const drive = process.env.SystemDrive || 'C:';
    const restricted = [`${drive}\\`, ...getWindowsRestrictedPaths()];
    return restricted.some(
      (r) =>
        normalized.toLowerCase() === r.toLowerCase() ||
        normalized.toLowerCase().startsWith(r.toLowerCase() + '\\'),
    );
  } else {
    // Block /, and all other restricted paths
    const restricted = ['/', ...LINUX_RESTRICTED_PATHS];
    return restricted.some(
      (r) => normalized === r || normalized.startsWith(r + '/'),
    );
  }
}

/**
 * Checks if a directory should be ignored during scanning or listing.
 * Includes hidden directories (starting with .) and sensitive directories.
 * @param name - The name of the directory (not the full path).
 * @returns True if the directory should be ignored.
 */
export function isIgnoredDirectory(name: string): boolean {
  if (!name) return true;
  return name.startsWith('.') || isSensitiveFilename(name);
}
