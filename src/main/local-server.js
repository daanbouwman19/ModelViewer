/**
 * @file Manages a local HTTP server for streaming media files.
 * This is crucial for handling large video files that cannot be efficiently
 * loaded as Data URLs. The server handles range requests for video streaming.
 * @requires http
 * @requires fs
 * @requires path
 * @requires ./constants.js
 * @requires ./database.js
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './constants.js';
import { getMediaDirectories } from './database.js';

/**
 * Holds the singleton instance of the HTTP server.
 * @type {http.Server | null}
 */
let serverInstance = null;

/**
 * Stores the port the server is currently running on. Defaults to 0 if not running.
 * @type {number}
 */
let serverPort = 0;

/**
 * Determines the MIME type of a file based on its extension.
 * @param {string} filePath - The path to the file.
 * @returns {string} The corresponding MIME type string (e.g., 'image/jpeg', 'video/mp4').
 */
function getMimeType(filePath) {
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
 * @param {string} filePath - The file path to validate.
 * @param {Array<{path: string}>} allowedDirectories - Array of allowed directory objects.
 * @returns {boolean} True if the file is within an allowed directory, false otherwise.
 */
function isPathAllowed(filePath, allowedDirectories) {
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
 * @param {() => void} onReadyCallback - A callback function executed once the server has started.
 * @returns {void}
 */
function startLocalServer(onReadyCallback) {
  if (serverInstance) {
    console.warn('[local-server.js] Server already started. Ignoring request.');
    if (onReadyCallback && typeof onReadyCallback === 'function') {
      onReadyCallback();
    }
    return;
  }

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(
      req.url,
      `http://${req.headers.host || 'localhost'}`,
    );
    const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));
    const normalizedFilePath = path.normalize(requestedPath);

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
    } catch (error) {
      console.error(
        `[local-server.js] Error validating path: ${error.message}`,
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
    const address = serverInstance.address();
    serverPort = address ? address.port : 0;
    console.log(
      `[local-server.js] Local media server started on http://localhost:${serverPort}`,
    );

    if (process.env.NODE_ENV === 'test') {
      serverInstance.unref();
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
 * @param {() => void} [callback] - An optional callback to execute after the server has closed.
 * @returns {void}
 */
function stopLocalServer(callback) {
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
 * @returns {number} The server port, or 0 if the server is not running.
 */
function getServerPort() {
  return serverPort;
}

export { startLocalServer, stopLocalServer, getServerPort, getMimeType };
