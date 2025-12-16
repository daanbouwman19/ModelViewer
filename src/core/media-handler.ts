/**
 * @file Shared media request handler.
 * Handles video streaming, metadata retrieval, and thumbnail generation.
 */

import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './constants';
import { createMediaSource } from './media-source';
import { IMediaSource } from './media-source-types';
import { getThumbnailCachePath, checkThumbnailCache } from './media-utils';
import {
  getDriveFileThumbnail,
  getDriveFileMetadata,
} from '../main/google-drive-service';
import { authorizeFilePath } from './security';
import path from 'path';

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
  cacheDir: string;
}

/**
 * Determines the MIME type of a file based on its extension.
 */
export function getMimeType(filePath: string): string {
  if (filePath.startsWith('gdrive://')) {
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
 * Serves a raw stream (Direct Play) for a media source.
 * Throws errors instead of handling them, to allow caller control.
 */
export async function serveRawStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  source: IMediaSource,
) {
    const totalSize = await source.getSize();
    const mimeType = await source.getMimeType();
    const rangeHeader = req.headers.range;

    let start = 0;
    let end = totalSize - 1;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      start = parseInt(parts[0], 10);
      if (parts[1]) end = parseInt(parts[1], 10);
    }

    const { stream, length } = await source.getStream({ start, end });
    const actualEnd = start + length - 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': length,
      'Content-Type': mimeType,
    });

    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('[RawStream] Stream error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });

    req.on('close', () => {
      stream.destroy();
    });
}

/**
 * Spawns FFmpeg to transcode the source and pipes output to response.
 * Throws errors instead of handling them.
 */
export async function serveTranscodedStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  source: IMediaSource,
  ffmpegPath: string,
  startTime: string | null,
) {
    const inputPath = await source.getFFmpegInput();

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
    });

    const ffmpegArgs = [];

    if (startTime) {
      ffmpegArgs.push('-ss', startTime);
    }

    ffmpegArgs.push(
      '-analyzeduration', '100M',
      '-probesize', '100M',
      '-i', inputPath,
      '-f', 'mp4',
      '-vcodec', 'libx264',
      '-acodec', 'aac',
      '-movflags', 'frag_keyframe+empty_moov',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      'pipe:1'
    );

    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', () => {
       // Optional: verbose logging
    });

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
    '-update',
    '1',
    cacheFile,
  ];

  const genProcess = spawn(ffmpegPath, generateArgs);

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
 * Handles static file serving (Unified with Raw Stream logic via IMediaSource).
 */
export async function serveStaticFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
) {
  try {
      const source = createMediaSource(filePath);
      return await serveRawStream(req, res, source);
  } catch (err: unknown) {
      console.error('[ServeStatic] Error:', err);
      if (!res.headersSent) {
         // Check for specific auth error messages
         const msg = (err as Error).message || '';
         if (msg.includes('Access denied')) {
             res.writeHead(403);
             res.end('Access denied.');
         } else {
             res.writeHead(500);
             res.end('Internal server error.');
         }
      }
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

    // Streaming Route (Direct or Transcoded)
    if (pathname === '/video/stream') {
      const filePath = parsedUrl.searchParams.get('file');
      const startTime = parsedUrl.searchParams.get('startTime');
      const isTranscodeForced = parsedUrl.searchParams.get('transcode') === 'true';

      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing file parameter');
      }

      try {
        const source = createMediaSource(filePath);

        if (isTranscodeForced) {
             if (!ffmpegPath) {
                 res.writeHead(500);
                 return res.end('FFmpeg binary not found');
             }
             return await serveTranscodedStream(req, res, source, ffmpegPath, startTime);
        } else {
             return await serveRawStream(req, res, source);
        }
      } catch (e: unknown) {
         console.error('[Handler] Stream failed:', e);
         if (!res.headersSent) {
             const msg = (e as Error).message || '';
             if (msg.includes('Access denied')) {
                 res.writeHead(403);
                 res.end('Access denied.');
             } else {
                res.writeHead(500);
                res.end('Error initializing source');
             }
         }
         return;
      }
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

    // Static File Serving
    const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));
    return serveStaticFile(req, res, requestedPath);
  };
}
