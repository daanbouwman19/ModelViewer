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
  getDriveFileThumbnail,
} from '../main/google-drive-service';
import { getDriveCacheManager } from '../main/drive-cache-manager';
import { getThumbnailCachePath, checkThumbnailCache } from './media-utils';

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
  cacheDir: string;
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
      const {
        path: cachedPath,
        totalSize,
        mimeType,
      } = await getDriveCacheManager().getCachedFilePath(fileId);
      const isTranscodeForced = req.url?.includes('transcode=true');

      if (isTranscodeForced) {
        if (!ffmpegPath) {
          res.writeHead(500);
          return res.end('FFmpeg binary not found');
        }

        // USE LOCALHOST LOOPBACK PROXY
        // This allows FFmpeg to seek (Range requests) via serveStaticFile -> Drive API
        const host = req.headers.host || 'localhost';
        // Construct base URL. req.url includes query params.
        // We need to remove 'transcode=true' to get the raw stream URL.
        // e.g. /video/stream?file=gdrive://ID&transcode=true -> /video/stream?file=gdrive://ID
        let inputUrl = `http://${host}${req.url}`;
        inputUrl = inputUrl.replace(/[?&]transcode=true/, '');

        res.writeHead(200, { 'Content-Type': 'video/mp4' });

        const ffmpegArgs = [
          '-analyzeduration',
          '100M',
          '-probesize',
          '100M',
          '-i',
          inputUrl,
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
          'pipe:1',
        ];

        if (startTime) {
          // Forward start time to FFmpeg (input seeking works nicely with http)
          // Actually for HTTP input, -ss before -i is faster (seeks tcp stream)
          ffmpegArgs.splice(0, 0, '-ss', startTime);
        }

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

        // No piping to stdin anymore!
        // FFmpeg reads from URL.

        ffmpegProcess.stdout.pipe(res);
        ffmpegProcess.stderr.on('data', (d) =>
          console.log('[Transcode] FFmpeg stderr:', d.toString()),
        );

        req.on('close', () => {
          ffmpegProcess.kill('SIGKILL');
        });
        return;
      }

      // Direct Play with Hybrid Caching
      const rangeHeader = req.headers.range;
      const stats = await fs.promises
        .stat(cachedPath)
        .catch(() => ({ size: 0 }));
      const currentSize = stats.size;

      let startByte = 0;
      let endByte = totalSize - 1;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        startByte = parseInt(parts[0], 10);
        if (parts[1]) endByte = parseInt(parts[1], 10);
      }

      // Headers based on TOTAL expected size
      // Headers based on TOTAL expected size
      const chunksize = endByte - startByte + 1;
      const headers: Record<string, string | number> = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${startByte}-${endByte}/${totalSize}`,
        'Content-Length': chunksize,
      };
      // REMOVED unconditional writeHead here

      // HYBRID SERVING LOGIC
      if (startByte < currentSize) {
        // We have the start data on disk!

        const safeEnd = Math.min(endByte, currentSize - 1);

        // Update Headers for the partial chunk
        res.writeHead(206, {
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${startByte}-${safeEnd}/${totalSize}`,
          'Content-Length': safeEnd - startByte + 1,
        });

        const fileStream = fs.createReadStream(cachedPath, {
          start: startByte,
          end: safeEnd,
        });
        fileStream.pipe(res);
        return;
      } else {
        // Fallback to Drive Pipe

        const stream = await getDriveFileStream(fileId, {
          start: startByte,
          end: endByte,
        });

        // Write headers for the pipe response
        res.writeHead(206, headers);

        stream.pipe(res);
        stream.on('error', (err) =>
          console.error('[DriveHandler] Stream Error:', err),
        );
        req.on('close', () => stream.destroy());
        return;
      }
    } catch (err) {
      console.error('[DriveHandler] Error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Drive Handler Error');
      }
    }
    // STOP FALLTHROUGH
    return;
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

  const isTranscodeForced = req.url?.includes('transcode=true');
  if (isTranscodeForced) {
    if (!ffmpegPath) {
      res.writeHead(500);
      return res.end('FFmpeg binary not found');
    }

    try {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
      });

      // Local file specific args
      const ffmpegArgs = [
        '-analyzeduration',
        '100M',
        '-probesize',
        '100M',
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
        'pipe:1',
      ];

      if (startTime) {
        // For local files, input seeking is fast and supported
        ffmpegArgs.splice(0, 0, '-ss', startTime);
      }

      const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

      // Pipe FFmpeg -> Response
      ffmpegProcess.stdout.pipe(res);

      ffmpegProcess.stderr.on('data', () => {
        // console.log('[Transcode] FFmpeg stderr:', d.toString())
      });

      req.on('close', () => {
        ffmpegProcess.kill('SIGKILL');
      });
      return;
    } catch (err) {
      console.error('[Transcode] Local Transcode Error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Transcode Error');
      }
      return;
    }
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
  cacheDir: string,
) {
  // 1. Check Cache
  const cacheFile = getThumbnailCachePath(filePath, cacheDir);

  const hit = await checkThumbnailCache(cacheFile);
  if (hit) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    });
    fs.createReadStream(cacheFile).pipe(res);
    return;
  }

  if (filePath.startsWith('gdrive://')) {
    const fileId = filePath.replace('gdrive://', '');
    try {
      const stream = await getDriveFileThumbnail(fileId);
      const writeStream = fs.createWriteStream(cacheFile);
      stream.pipe(writeStream);
      stream.pipe(res);
      return;
    } catch (e) {
      console.warn('[Thumbnail] Drive fetch failed, fallback disabled:', e);
      if (!res.headersSent) {
        res.writeHead(404);
        res.end();
      }
      return;
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

  // 3. Local File Logic (Cache check already done)

  // Let's change approach: Output to cacheFile directly, then stream cacheFile to res.
  // FFMPEG overwrite (-y)
  const generateArgs = [
    '-y',
    '-ss',
    '1',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-q:v',
    '5',
    cacheFile,
  ];

  const genProcess = spawn(ffmpegPath, generateArgs);

  // Capture stderr for debugging
  let stderr = '';
  if (genProcess.stderr) {
    genProcess.stderr.on('data', (d) => (stderr += d.toString()));
  }

  genProcess.on('close', (code) => {
    if (code === 0) {
      fs.promises
        .stat(cacheFile)
        .then(() => {
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
          });
          fs.createReadStream(cacheFile).pipe(res);
        })
        .catch((err) => {
          console.error(
            '[Thumbnail] Local FFmpeg success but no file:',
            err,
            '\nStderr:',
            stderr,
          );
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
    } else {
      console.error(
        '[Thumbnail] FFmpeg failed with code',
        code,
        '\nStderr:',
        stderr,
      );
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  genProcess.on('error', (err) => {
    console.error('[Thumbnail] Spawn failed', err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Generation failed');
    }
  });
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
      const {
        path: cachedPath,
        totalSize,
        mimeType,
      } = await getDriveCacheManager().getCachedFilePath(fileId);

      const rangeHeader = req.headers.range;
      const stats = await fs.promises
        .stat(cachedPath)
        .catch(() => ({ size: 0 }));
      const currentSize = stats.size;

      // Default to full range if no header
      let startByte = 0;
      let endByte = totalSize - 1;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        startByte = parseInt(parts[0], 10);
        if (parts[1]) endByte = parseInt(parts[1], 10);
      }

      const headers: Record<string, string | number> = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      };

      if (startByte < currentSize) {
        // Serve from Cache (Partial)
        const safeEnd = Math.min(endByte, currentSize - 1);
        headers['Content-Range'] = `bytes ${startByte}-${safeEnd}/${totalSize}`;
        headers['Content-Length'] = safeEnd - startByte + 1;
        res.writeHead(206, headers);

        const fileStream = fs.createReadStream(cachedPath, {
          start: startByte,
          end: safeEnd,
        });
        fileStream.pipe(res);
        return;
      } else {
        // Cache miss (fallback to pipe)
        // Note: If we fall back to pipe, we send the FULL range/content info for the requested chunk?
        // getDriveFileStream handles this? No, it returns a stream.
        // We need to set headers correctly for the pipe.

        const stream = await getDriveFileStream(fileId, {
          start: startByte,
          end: endByte,
        });

        const chunksize = endByte - startByte + 1;
        headers['Content-Range'] = `bytes ${startByte}-${endByte}/${totalSize}`;
        headers['Content-Length'] = chunksize;
        res.writeHead(206, headers);

        stream.pipe(res);
        req.on('close', () => stream.destroy());
        return;
      }
    } catch (err) {
      console.error('[StaticServe] Drive Error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Drive Error');
      }
      return;
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
    const stat = await fs.promises.stat(normalizedFilePath);
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
  const { ffmpegPath, cacheDir } = options;

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
      return serveThumbnail(req, res, filePath, ffmpegPath, cacheDir);
    }

    // Static File Serving (with Range support)
    const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));
    return serveStaticFile(req, res, requestedPath);
  };
}
