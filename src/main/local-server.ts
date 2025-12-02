/**
 * @file Manages a local HTTP server for streaming media files.
 * This is crucial for handling large video files that cannot be efficiently
 * loaded as Data URLs. The server handles range requests for video streaming.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './constants';
import { getMediaDirectories, MediaDirectory } from './database';
import { AddressInfo } from 'net';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

/**
 * Holds the singleton instance of the HTTP server.
 */
let serverInstance: http.Server | null = null;

/**
 * Stores the port the server is currently running on. Defaults to 0 if not running.
 */
let serverPort = 0;

/**
 * Determines the MIME type of a file based on its extension.
 * @param filePath - The path to the file.
 * @returns The corresponding MIME type string (e.g., 'image/jpeg', 'video/mp4').
 */
function getMimeType(filePath: string): string {
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
  return 'application/octet-stream'; // Default for unknown types
}

/**
 * Checks if a file path is within the allowed media directories.
 * @param filePath - The file path to validate.
 * @param allowedDirectories - Array of allowed directory objects.
 * @returns True if the file is within an allowed directory, false otherwise.
 */
function isPathAllowed(
  filePath: string,
  allowedDirectories: MediaDirectory[],
): boolean {
  const normalizedPath = path.resolve(filePath);
  return allowedDirectories.some((dir) => {
    const normalizedDir = path.resolve(dir.path);

    if (process.platform === 'win32') {
      return (
        normalizedPath
          .toLowerCase()
          .startsWith(normalizedDir.toLowerCase() + path.sep) ||
        normalizedPath.toLowerCase() === normalizedDir.toLowerCase()
      );
    }

    return (
      normalizedPath.startsWith(normalizedDir + path.sep) ||
      normalizedPath === normalizedDir
    );
  });
}

/**
 * Starts the local HTTP server if it is not already running.
 * The server listens on a random available port and handles range requests for video streaming.
 * @param onReadyCallback - A callback function executed once the server has started.
 */
function startLocalServer(onReadyCallback?: () => void): void {
  if (serverInstance) {
    console.warn('[local-server.js] Server already started. Ignoring request.');
    if (onReadyCallback && typeof onReadyCallback === 'function') {
      onReadyCallback();
    }
    return;
  }

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    const parsedUrl = new URL(
      req.url,
      `http://${req.headers.host || 'localhost'}`,
    );
    const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));
    const normalizedFilePath = path.normalize(requestedPath);

    // Metadata Route
    if (parsedUrl.pathname === '/video/metadata') {
      const filePath = parsedUrl.searchParams.get('file');
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing file parameter');
      }
      const decodedPath = decodeURIComponent(filePath);

      if (!ffmpegPath) {
        res.writeHead(500);
        return res.end('FFmpeg binary not found');
      }

      // Security: Validate path
      try {
        const allowedDirectories = await getMediaDirectories();
        if (!isPathAllowed(decodedPath, allowedDirectories)) {
          res.writeHead(403);
          return res.end('Access denied');
        }
      } catch (e) {
        console.error('[Metadata] Path validation error:', e);
        res.writeHead(500);
        return res.end('Internal Error');
      }

      // Use ffmpeg to get duration
      const ffmpegProcess = spawn(ffmpegPath, ['-i', decodedPath]);

      let stderrData = '';
      ffmpegProcess.stderr.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      ffmpegProcess.on('close', (code) => {
        console.log('[Metadata] ffmpeg exited with code:', code);
        console.log('[Metadata] stderr output:', stderrData);

        // Parse Duration: 00:00:00.00
        // Regex to match Duration: HH:MM:SS.mm
        const match = stderrData.match(
          /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/,
        );
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
          console.error(
            '[Metadata] Failed to parse duration from:',
            stderrData,
          );
          res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Could not determine duration' }));
        }
      });

      return;
    }

    // Transcoding Route
    if (parsedUrl.pathname === '/video/stream') {
      const filePath = parsedUrl.searchParams.get('file');
      const startTime = parsedUrl.searchParams.get('startTime'); // Get start time
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing file parameter');
      }
      const decodedPath = decodeURIComponent(filePath);

      // Validate path again for security
      try {
        const allowedDirectories = await getMediaDirectories();
        if (!isPathAllowed(decodedPath, allowedDirectories)) {
          res.writeHead(403);
          return res.end('Access denied');
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

      // Spawn ffmpeg directly
      const ffmpegArgs = [
        '-i',
        decodedPath,
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

      // Add seeking if requested
      if (startTime) {
        ffmpegArgs.unshift('-ss', startTime);
      }

      ffmpegArgs.push('pipe:1'); // Output to stdout

      const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

      ffmpegProcess.stdout.pipe(res);

      ffmpegProcess.stderr.on('data', () => {
        // Optional: Log stderr for debugging
      });

      ffmpegProcess.on('error', (err: Error) => {
        console.error('[Transcode] Spawn Error:', err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Transcoding failed');
        }
      });

      // Kill ffmpeg if request is aborted
      req.on('close', () => {
        ffmpegProcess.kill('SIGKILL');
      });

      return;
    }

    // Thumbnail Route
    if (parsedUrl.pathname === '/video/thumbnail') {
      const filePath = parsedUrl.searchParams.get('file');
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing file parameter');
      }
      const decodedPath = decodeURIComponent(filePath);

      try {
        const allowedDirectories = await getMediaDirectories();
        if (!isPathAllowed(decodedPath, allowedDirectories)) {
          res.writeHead(403);
          return res.end('Access denied');
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

      // Extract a single frame at 10% or 1 second
      const ffmpegArgs = [
        '-ss',
        '1', // Seek to 1 second
        '-i',
        decodedPath,
        '-frames:v',
        '1',
        '-f',
        'image2',
        '-q:v',
        '5', // Quality
        'pipe:1',
      ];

      const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

      ffmpegProcess.stdout.pipe(res);

      ffmpegProcess.stderr.on('data', () => {}); // Ignore stderr

      ffmpegProcess.on('error', (err: Error) => {
        console.error('[Thumbnail] Spawn Error:', err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Thumbnail generation failed');
        }
      });

      return;
    }

    if (!fs.existsSync(normalizedFilePath)) {
      console.error(`[local-server.js] File not found: ${normalizedFilePath}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File not found.');
    }

    // Security: Validate that the requested file is within allowed media directories
    try {
      const allowedDirectories = await getMediaDirectories();
      if (!isPathAllowed(normalizedFilePath, allowedDirectories)) {
        console.error(
          `[local-server.js] Access denied: ${normalizedFilePath} is not within allowed directories`,
        );
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Access denied.');
      }
    } catch (error: unknown) {
      console.error(
        `[local-server.js] Error validating path: ${(error as Error).message}`,
      );
      res.writeHead(500, { 'Content-Type': 'text/plain' });
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
          console.error(
            `[local-server.js] Invalid range: ${range} for ${normalizedFilePath}`,
          );
          res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
          return res.end('Requested range not satisfiable.');
        }

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(normalizedFilePath, {
          start,
          end,
        });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': getMimeType(normalizedFilePath),
        };
        res.writeHead(206, head); // 206 Partial Content
        fileStream.pipe(res);
      } else {
        const head = {
          'Content-Length': totalSize,
          'Content-Type': getMimeType(normalizedFilePath),
          'Accept-Ranges': 'bytes',
        };
        res.writeHead(200, head); // 200 OK
        fs.createReadStream(normalizedFilePath).pipe(res);
      }
    } catch (serverError) {
      console.error(
        `[local-server.js] Error processing file ${normalizedFilePath}:`,
        serverError,
      );
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server error processing the file.');
    }
  });

  serverInstance = server;

  serverInstance.listen(0, '127.0.0.1', () => {
    const address = serverInstance?.address() as AddressInfo;
    serverPort = address ? address.port : 0;
    console.log(
      `[local-server.js] Local media server started on http://localhost:${serverPort}`,
    );

    if (process.env.NODE_ENV === 'test') {
      serverInstance?.unref();
    }

    if (onReadyCallback && typeof onReadyCallback === 'function') {
      onReadyCallback();
    }
  });

  serverInstance.on('error', (err) => {
    console.error('[local-server.js] Server Error:', err);
    serverInstance = null;
    serverPort = 0;
  });
}

/**
 * Stops the local HTTP server if it is running.
 * @param callback - An optional callback to execute after the server has closed.
 */
function stopLocalServer(callback?: () => void): void {
  if (serverInstance) {
    serverInstance.close((err) => {
      if (err) {
        console.error('[local-server.js] Error stopping server:', err);
      } else {
        console.log('[local-server.js] Local media server stopped.');
      }
      serverInstance = null;
      serverPort = 0;
      if (callback && typeof callback === 'function') {
        callback();
      }
    });
  } else if (callback && typeof callback === 'function') {
    callback();
  }
}

/**
 * Gets the port the local server is currently running on.
 * @returns The server port, or 0 if the server is not running.
 */
function getServerPort(): number {
  return serverPort;
}

export { startLocalServer, stopLocalServer, getServerPort, getMimeType };
