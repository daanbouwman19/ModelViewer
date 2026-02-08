/**
 * @file System routes (directories, filesystem, drive).
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { AppError } from '../../core/errors.ts';
import {
  ALL_SUPPORTED_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from '../../core/constants.ts';
import {
  addMediaDirectory,
  createSmartPlaylist,
  deleteSmartPlaylist,
  getMediaDirectories,
  getSmartPlaylists,
  removeMediaDirectory,
  setDirectoryActiveState,
  updateSmartPlaylist,
} from '../../core/database.ts';
import { listDirectory } from '../../core/file-system.ts';
import {
  isRestrictedPath,
  isSensitiveDirectory,
  validateInput,
  validateAbsolutePath,
} from '../../core/security.ts';
import { getQueryParam } from '../../core/utils/http-utils.ts';
import {
  getDriveClient,
  getDriveParent,
  listDriveDirectory,
} from '../../main/google-drive-service.ts';
import type { RateLimiters } from '../middleware/rate-limiters.ts';
import { asyncHandler } from '../middleware/async-handler.ts';
import { createRateLimiter } from '../../core/rate-limiter.ts';
import {
  RATE_LIMIT_FILE_MAX_REQUESTS,
  RATE_LIMIT_FILE_WINDOW_MS,
} from '../../core/constants.ts';

function validateMediaDirectoryPath(dirPath: string): void {
  if (!path.isAbsolute(dirPath)) {
    throw new AppError(400, 'Invalid path');
  }

  const normalized = path.normalize(dirPath);
  const segments = normalized.split(path.sep).filter(Boolean);
  if (segments.includes('..')) {
    throw new AppError(400, 'Invalid path');
  }
}

export function createSystemRoutes(limiters: RateLimiters) {
  const router = Router();

  router.get(
    '/api/directories',
    limiters.readLimiter,
    asyncHandler(async (_req, res) => {
      const dirs = await getMediaDirectories();
      res.json(dirs);
    }),
  );

  router.get(
    '/api/smart-playlists',
    limiters.readLimiter,
    asyncHandler(async (_req, res) => {
      const playlists = await getSmartPlaylists();
      res.json(playlists);
    }),
  );

  router.post(
    '/api/smart-playlists',
    limiters.writeLimiter,
    asyncHandler(async (req, res) => {
      const { name, criteria } = req.body;
      if (!name || !criteria) {
        throw new AppError(400, 'Missing name or criteria');
      }
      const result = await createSmartPlaylist(name, criteria);
      res.json(result);
    }),
  );

  router.put(
    '/api/smart-playlists/:id',
    limiters.writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseInt((req.params.id as string) || '', 10);
      const { name, criteria } = req.body;
      if (isNaN(id) || !name || !criteria) {
        throw new AppError(400, 'Invalid arguments');
      }
      await updateSmartPlaylist(id, name, criteria);
      res.sendStatus(200);
    }),
  );

  router.delete(
    '/api/smart-playlists/:id',
    limiters.writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseInt((req.params.id as string) || '', 10);
      if (isNaN(id)) {
        throw new AppError(400, 'Invalid id');
      }
      await deleteSmartPlaylist(id);
      res.sendStatus(200);
    }),
  );

  router.post(
    '/api/directories',
    limiters.writeLimiter,
    asyncHandler(async (req, res) => {
      const { path: dirPath } = req.body;
      if (!dirPath) {
        throw new AppError(400, 'Missing path');
      }

      if (typeof dirPath !== 'string') {
        throw new AppError(400, 'Invalid path');
      }

      const inputResult = validateInput(dirPath);
      if (inputResult) {
        throw new AppError(400, inputResult.message || 'Invalid path');
      }

      validateMediaDirectoryPath(dirPath);

      if (isSensitiveDirectory(dirPath)) {
        console.warn(
          `[Security] Blocked attempt to add sensitive directory: ${dirPath}`,
        );
        return res.status(403).json({
          error: 'Access restricted for sensitive system directories',
        });
      }

      let resolvedPath: string;
      try {
        resolvedPath = await fs.realpath(dirPath);
      } catch {
        throw new AppError(400, 'Directory does not exist');
      }

      if (isSensitiveDirectory(resolvedPath)) {
        console.warn(
          `[Security] Blocked attempt to add sensitive directory (resolved): ${resolvedPath}`,
        );
        return res.status(403).json({
          error: 'Access restricted for sensitive system directories',
        });
      }

      await addMediaDirectory(resolvedPath);
      res.json(resolvedPath);
    }),
  );

  router.delete(
    '/api/directories',
    limiters.writeLimiter,
    asyncHandler(async (req, res) => {
      const { path: dirPath } = req.body;
      if (!dirPath) {
        throw new AppError(400, 'Missing path');
      }
      if (typeof dirPath !== 'string') {
        throw new AppError(400, 'Invalid path');
      }
      const inputResult = validateInput(dirPath);
      if (inputResult) {
        throw new AppError(400, inputResult.message || 'Invalid path');
      }
      await removeMediaDirectory(dirPath);
      res.sendStatus(200);
    }),
  );

  router.put(
    '/api/directories/active',
    limiters.writeLimiter,
    asyncHandler(async (req, res) => {
      const { path: dirPath, isActive } = req.body;
      if (!dirPath) {
        throw new AppError(400, 'Missing path');
      }
      if (typeof dirPath !== 'string') {
        throw new AppError(400, 'Invalid path');
      }
      const inputResult = validateInput(dirPath);
      if (inputResult) {
        throw new AppError(400, inputResult.message || 'Invalid path');
      }
      await setDirectoryActiveState(dirPath, isActive);
      res.sendStatus(200);
    }),
  );

  const fsRateLimiter = createRateLimiter(
    RATE_LIMIT_FILE_WINDOW_MS,
    RATE_LIMIT_FILE_MAX_REQUESTS,
    'Too many file system requests. Please slow down.',
  );

  router.get(
    '/api/fs/ls',
    fsRateLimiter,
    asyncHandler(async (req, res) => {
      const dirPath = getQueryParam(req.query, 'path');
      if (!dirPath || typeof dirPath !== 'string') {
        throw new AppError(400, 'Missing path');
      }

      const inputResult = validateInput(dirPath);
      if (inputResult) {
        throw new AppError(400, inputResult.message || 'Invalid path');
      }

      // 'ROOT' is a special keyword used by the frontend/listDrives to request drive listing
      // It is not a real path and should not be validated as one.
      if (dirPath === 'ROOT') {
        const contents = await listDirectory(dirPath);
        return res.json(contents);
      }

      // [SECURITY] Validate path is absolute to prevent relative path traversal attacks
      validateAbsolutePath(dirPath);

      // [SECURITY] Resolve symlinks to prevent bypassing restricted path checks
      let resolvedPath = dirPath;
      try {
        resolvedPath = await fs.realpath(dirPath);
      } catch {
        // If path doesn't exist or access is denied, we can't list it anyway.
        // We let listDirectory handle the error for consistency, or fail here.
        // However, if we can't resolve it, we can't check restriction accurately.
        // For safety, we should probably fail or treat as restricted if unknown.
        // But since listDirectory would fail too, we can just proceed with original path
        // which will likely fail in listDirectory or be caught by isRestrictedPath if simple path.
        // To be safe and strict:
        throw new AppError(400, 'Invalid path or access denied');
      }

      if (isRestrictedPath(resolvedPath)) {
        console.warn(
          `[Security] Blocked attempt to list restricted directory: ${dirPath} (resolved to ${resolvedPath})`,
        );
        throw new AppError(403, 'Access denied');
      }

      const contents = await listDirectory(resolvedPath);
      res.json(contents);
    }),
  );

  router.get(
    '/api/fs/parent',
    limiters.fileLimiter,
    asyncHandler(async (req, res) => {
      const dirPath = getQueryParam(req.query, 'path');
      if (!dirPath || typeof dirPath !== 'string') {
        throw new AppError(400, 'Missing path');
      }
      const inputResult = validateInput(dirPath);
      if (inputResult) {
        throw new AppError(400, inputResult.message || 'Invalid path');
      }

      const parent = path.dirname(dirPath);
      if (parent === dirPath) {
        return res.json({ parent: null });
      }
      res.json({ parent });
    }),
  );

  router.get(
    '/api/config/extensions',
    limiters.readLimiter,
    asyncHandler(async (_req, res) => {
      res.json({
        images: SUPPORTED_IMAGE_EXTENSIONS,
        videos: SUPPORTED_VIDEO_EXTENSIONS,
        all: ALL_SUPPORTED_EXTENSIONS,
      });
    }),
  );

  router.post(
    '/api/sources/google-drive',
    limiters.writeLimiter,
    asyncHandler(async (req, res) => {
      const { folderId } = req.body;
      if (!folderId) {
        throw new AppError(400, 'Missing folderId');
      }

      const drive = await getDriveClient();
      const driveRes = await drive.files.get({
        fileId: folderId,
        fields: 'id, name',
      });
      const name = driveRes.data.name || 'Google Drive Folder';

      await addMediaDirectory(`gdrive://${driveRes.data.id}`);

      res.json({ success: true, name });
    }),
  );

  router.get(
    '/api/drive/files',
    limiters.fileLimiter,
    asyncHandler(async (req, res) => {
      const folderId = getQueryParam(req.query, 'folderId');
      const files = await listDriveDirectory(folderId || 'root');
      res.json(files);
    }),
  );

  router.get(
    '/api/drive/parent',
    limiters.fileLimiter,
    asyncHandler(async (req, res) => {
      const folderId = getQueryParam(req.query, 'folderId');
      if (!folderId) {
        throw new AppError(400, 'Missing folderId');
      }

      const parent = await getDriveParent(folderId);
      res.json({ parent });
    }),
  );

  return router;
}
