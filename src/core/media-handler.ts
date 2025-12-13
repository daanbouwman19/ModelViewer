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

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
}

/**
 * Determines the MIME type of a file based on its extension.
 */
export function getMimeType(filePath: string): string {
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
 * Handles metadata retrieval.
 */
export async function serveMetadata(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
  ffmpegPath: string | null,
) {
  if (!ffmpegPath) {
    res.writeHead(500);
    return res.end('FFmpeg binary not found');
  }

  try {
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      res.writeHead(403);
      return res.end(auth.message || 'Access denied');
    }
  } catch (e) {
    console.error('[Metadata] Path validation error:', e);
    res.writeHead(500);
    return res.end('Internal Error');
  }

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

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ duration }));
    } else {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Could not determine duration' }));
    }
  });
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
  try {
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      res.writeHead(403);
      return res.end(auth.message || 'Access denied');
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
    'Access-Control-Allow-Origin': '*',
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
  try {
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      res.writeHead(403);
      return res.end(auth.message || 'Access denied');
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
    'Access-Control-Allow-Origin': '*',
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
  const normalizedFilePath = path.normalize(filePath);

  if (!fs.existsSync(normalizedFilePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('File not found.');
  }

  try {
    const auth = await authorizeFilePath(normalizedFilePath);
    if (!auth.isAllowed) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end(auth.message || 'Access denied.');
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
