/**
 * @file Shared media request handler.
 * Handles video streaming, metadata retrieval, and thumbnail generation.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './constants';
import { authorizeFilePath } from './security';
import {
  getDriveFileStream,
  getDriveFileMetadata,
} from '../main/google-drive-service';

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
}

/**
 * Determines the MIME type of a file based on its extension.
 */
export function getMimeType(filePath: string): string {
  if (filePath.startsWith('gdrive://')) {
    // For Google Drive, we might not have the extension in the path (it's an ID).
    // Ideally we should have stored the MIME type or name in the DB.
    // For MVP, we'll try to guess or default, but wait!
    // The scanner puts extensions in the name property of the MediaFile, but here we just have a path/ID.
    // We will rely on getDriveFileMetadata or a generic type.
    // Or we can return 'video/mp4' as a safe default for videos if we know it's being streamed.
    return 'application/octet-stream';
  }

  const extension = path.extname(filePath).substring(1).toLowerCase();
  if (SUPPORTED_IMAGE_EXTENSIONS.includes(`.${extension}`)) {
    return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  }
  if (SUPPORTED_VIDEO_EXTENSIONS.includes(`.${extension}`)) {
    switch (extension) {
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      case 'ogg':
        return 'video/ogg';
      case 'mov':
        return 'video/quicktime';
      case 'avi':
        return 'video/x-msvideo';
      case 'mkv':
        return 'video/x-matroska';
      default:
        return `video/${extension}`;
    }
  }
  return 'application/octet-stream';
}

/**
 * Retrieves video duration using ffmpeg.
 */
export async function getVideoDuration(
  filePath: string,
  ffmpegPath: string,
): Promise<{ duration: number } | { error: string }> {
  if (filePath.startsWith('gdrive://')) {
    // FFMPEG cannot read gdrive:// directly.
    // We could try to use Drive API metadata if available.
    const fileId = filePath.replace('gdrive://', '');
    try {
      const metadata = await getDriveFileMetadata(fileId);
      if (
        metadata.videoMediaMetadata &&
        metadata.videoMediaMetadata.durationMillis
      ) {
        return {
          duration: Number(metadata.videoMediaMetadata.durationMillis) / 1000,
        };
      }
      return { error: 'Duration not available from Drive API' };
    } catch {
      return { error: 'Failed to fetch Drive metadata' };
    }
  }

  return new Promise((resolve) => {
    const ffmpegProcess = spawn(ffmpegPath, ['-i', filePath]);
    let stderrData = '';
    ffmpegProcess.stderr.on('data', (data: Buffer) => {
      stderrData += data.toString();
    });

    ffmpegProcess.on('close', () => {
      const match = stderrData.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) {
        const hours = parseFloat(match[1]);
        const minutes = parseFloat(match[2]);
        const seconds = parseFloat(match[3]);
        const duration = hours * 3600 + minutes * 60 + seconds;
        resolve({ duration });
      } else {
        resolve({ error: 'Could not determine duration' });
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error('[Metadata] FFmpeg spawn error:', err);
      resolve({ error: 'FFmpeg execution failed' });
    });
  });
}

/**
 * Handles metadata retrieval.
 */
export async function serveMetadata(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
  ffmpegPath: string | null,
) {
  // If it's a drive file, we can skip standard authorization check because we don't have a file path to check against allowed dirs easily (it's an ID).
  // But we SHOULD verify that the ID is valid or that we have access.
  // For now, let's assume if we have a token we can try.

  if (!filePath.startsWith('gdrive://')) {
    try {
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed) {
        res.writeHead(403);
        return res.end('Access denied.');
      }
    } catch (error) {
      console.error('[Metadata] Path validation error:', error);
      res.writeHead(500);
      return res.end('Internal Error');
    }
  }

  if (!ffmpegPath && !filePath.startsWith('gdrive://')) {
    res.writeHead(500);
    return res.end('FFmpeg binary not found');
  }

  const result = await getVideoDuration(filePath, ffmpegPath || '');

  res.writeHead(200, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(result));
}

/**
 * Handles video transcoding.
 */
export async function serveTranscode(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
  startTime: string | null,
  ffmpegPath: string | null,
) {
  if (filePath.startsWith('gdrive://')) {
    const fileId = filePath.replace('gdrive://', '');
    try {
      // Direct stream from Google Drive.
      // Note: We are NOT transcoding here (ffmpeg is bypassed), so startTime won't work unless we implement range requests or ffmpeg piping from a URL.
      // For MVP, we will pipe the raw file. If the browser supports the codec (mp4/webm), it will play.
      // If it needs transcoding, we'd need to pipe the stream INTO ffmpeg.

      // Let's try to just pipe the stream. Browsers can handle range requests for seeking if we support it.
      // But the Drive stream might not support range requests easily via the API wrapper.
      const stream = await getDriveFileStream(fileId);

      let mimeType = 'video/mp4'; // Default fallback
      try {
        // We import getDriveFileMetadata dynamically if needed, or rely on the import at top
        const metadata = await getDriveFileMetadata(fileId);
        if (metadata.mimeType) {
          mimeType = metadata.mimeType;
        }
      } catch (e) {
        console.warn(
          '[Transcode] Failed to fetch Drive metadata for MIME type:',
          e,
        );
      }

      res.writeHead(200, {
        'Content-Type': mimeType,
      });
      stream.pipe(res);
      return;
    } catch (err) {
      console.error('[Transcode] Drive Stream Error:', err);
      res.writeHead(500);
      return res.end('Drive Stream Error');
    }
  }

  try {
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      res.writeHead(403);
      return res.end('Access denied.');
    }
  } catch (e) {
    console.error('[Transcode] Path validation error:', e);
    res.writeHead(500);
    return res.end('Internal Error');
  }

  if (!ffmpegPath) {
    res.writeHead(500);
    return res.end('FFmpeg binary not found');
  }

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
  });

  const ffmpegArgs = [
    '-i',
    filePath,
    '-f',
    'mp4',
    '-vcodec',
    'libx264',
    '-acodec',
    'aac',
    '-movflags',
    'frag_keyframe+empty_moov',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
  ];

  if (startTime) {
    ffmpegArgs.unshift('-ss', startTime);
  }

  ffmpegArgs.push('pipe:1');

  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
  ffmpegProcess.stdout.pipe(res);
  ffmpegProcess.on('error', (err) => {
    console.error('[Transcode] Spawn Error:', err);
  });
  req.on('close', () => {
    ffmpegProcess.kill('SIGKILL');
  });
}

/**
 * Handles thumbnail generation.
 */
export async function serveThumbnail(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
  ffmpegPath: string | null,
) {
  if (filePath.startsWith('gdrive://')) {
    const fileId = filePath.replace('gdrive://', '');
    try {
      const { getDriveFileThumbnail } =
        await import('../main/google-drive-service');
      const stream = await getDriveFileThumbnail(fileId);
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      });
      stream.pipe(res);
      return;
    } catch (e) {
      console.error('[Thumbnail] Drive fetch failed:', e);
      res.writeHead(404);
      return res.end('Thumbnail not available');
    }
  }

  try {
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      res.writeHead(403);
      return res.end('Access denied.');
    }
  } catch {
    res.writeHead(500);
    return res.end('Internal Error');
  }

  if (!ffmpegPath) {
    res.writeHead(500);
    return res.end('FFmpeg binary not found');
  }

  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000',
  });

  const ffmpegArgs = [
    '-ss',
    '1',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-f',
    'image2',
    '-q:v',
    '5',
    'pipe:1',
  ];

  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
  ffmpegProcess.stdout.pipe(res);
}

/**
 * Handles static file serving.
 */
export async function serveStaticFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
) {
  if (filePath.startsWith('gdrive://')) {
    const fileId = filePath.replace('gdrive://', '');
    try {
      const stream = await getDriveFileStream(fileId);
      const metadata = await getDriveFileMetadata(fileId);
      res.writeHead(200, {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        'Content-Length': Number(metadata.size),
      });
      stream.pipe(res);
    } catch (err) {
      console.error('[ServeStatic] Drive Error:', err);
      res.writeHead(500);
      res.end('Drive Error');
    }
    return;
  }

  const normalizedFilePath = path.normalize(filePath);

  try {
    // SECURITY: Authorize FIRST to prevent file enumeration (timing/error message attacks)
    const auth = await authorizeFilePath(normalizedFilePath);
    if (!auth.isAllowed) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      // SECURITY: Do not leak whether the file exists or not in the error message
      return res.end('Access denied.');
    }
  } catch {
    res.writeHead(500);
    return res.end('Internal server error.');
  }

  try {
    const stat = fs.statSync(normalizedFilePath);
    const totalSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (
        isNaN(start) ||
        start >= totalSize ||
        end >= totalSize ||
        start > end
      ) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        return res.end('Requested range not satisfiable.');
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(normalizedFilePath, {
        start,
        end,
      });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': getMimeType(normalizedFilePath),
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': getMimeType(normalizedFilePath),
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(normalizedFilePath).pipe(res);
    }
  } catch (serverError) {
    console.error(
      `[MediaHandler] Error serving file ${normalizedFilePath}:`,
      serverError,
    );
    res.writeHead(500);
    res.end('Server error.');
  }
}

/**
 * Creates a request handler function for media operations.
 * @param options - Configuration options (e.g. ffmpegPath).
 * @returns An async function to handle http requests.
 */
export function createMediaRequestHandler(options: MediaHandlerOptions) {
  const { ffmpegPath } = options;

  return async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    // Optional: pre-parsed path if used in a router that strips prefixes
    // pathOverride?: string,
  ) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }

    const startUrl = `http://${req.headers.host || 'localhost'}`;
    const parsedUrl = new URL(req.url, startUrl);
    const pathname = parsedUrl.pathname;

    // Metadata Route
    if (pathname === '/video/metadata') {
      const filePath = parsedUrl.searchParams.get('file');
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing file parameter');
      }
      return serveMetadata(req, res, filePath, ffmpegPath);
    }

    // Transcoding Route
    if (pathname === '/video/stream') {
      const filePath = parsedUrl.searchParams.get('file');
      const startTime = parsedUrl.searchParams.get('startTime');

      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing file parameter');
      }
      return serveTranscode(req, res, filePath, startTime, ffmpegPath);
    }

    // Thumbnail Route
    if (pathname === '/video/thumbnail') {
      const filePath = parsedUrl.searchParams.get('file');
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing file parameter');
      }
      return serveThumbnail(req, res, filePath, ffmpegPath);
    }

    // Static File Serving (with Range support)
    const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));
    return serveStaticFile(req, res, requestedPath);
  };
}
