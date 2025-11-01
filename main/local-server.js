/**
 * @file Manages a local HTTP server for streaming media files.
 * This is crucial for handling large video files that cannot be efficiently
 * loaded as Data URLs. The server handles range requests for video streaming.
 * @requires http
 * @requires fs
 * @requires path
 * @requires ./constants.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} = require('./constants.js');

/**
 * Holds the singleton instance of the HTTP server.
 * @type {http.Server | null}
 */
let serverInstance = null; // To keep a reference to the server

/**
 * Stores the port the server is currently running on. 0 if not running.
 * @type {number}
 */
let serverPort = 0; // Stores the port the server is running on.

/**
 * Determines the MIME type of a file based on its extension.
 * @param {string} filePath - The path to the file.
 * @returns {string} The MIME type string.
 */
function getMimeType(filePath) {
  const extension = path.extname(filePath).substring(1).toLowerCase();
  if (SUPPORTED_IMAGE_EXTENSIONS.includes(`.${extension}`)) {
    // Special case for jpeg
    return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  }
  if (SUPPORTED_VIDEO_EXTENSIONS.includes(`.${extension}`)) {
    // Provide specific MIME types for common video formats
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
        return `video/${extension}`; // Fallback for other video types
    }
  }
  return 'application/octet-stream'; // Default for unknown or unsupported types
}

/**
 * Starts a local HTTP server to stream media files if it's not already running.
 * This is primarily used for larger video files that exceed Data URL limits.
 * The server listens on a random available port on 127.0.0.1 and supports
 * HTTP Range requests for video streaming.
 * @param {() => void} onReadyCallback - A callback function that is executed once the server has successfully started and is listening for requests.
 * @returns {void}
 */
function startLocalServer(onReadyCallback) {
  if (serverInstance) {
    console.warn('[local-server.js] Server already started. Ignoring request.');
    if (onReadyCallback && typeof onReadyCallback === 'function') {
      onReadyCallback(); // Call callback if already running
    }
    return;
  }

  const server = http.createServer((req, res) => {
    // Use WHATWG URL API instead of deprecated url.parse()
    const parsedUrl = new URL(
      req.url,
      `http://${req.headers.host || 'localhost'}`,
    );
    // Decode URI component to handle spaces or special characters in file paths
    const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));

    // Security: Define the allowed base directory from which files can be served.
    // This prevents directory traversal attacks.
    // TODO: This should be configurable or derived more safely in a real application.
    // For now, allowing access to any path that fs.existsSync confirms.
    // A more robust solution would involve checking against a list of allowed base paths.
    const normalizedFilePath = path.normalize(requestedPath);

    if (!fs.existsSync(normalizedFilePath)) {
      // Simplified check
      console.error(`[local-server.js] File not found: ${normalizedFilePath}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File not found.');
    }

    try {
      const stat = fs.statSync(normalizedFilePath);
      const totalSize = stat.size;
      const range = req.headers.range;

      if (range) {
        // Handle byte range requests for streaming
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        // Validate range
        if (
          isNaN(start) ||
          start >= totalSize ||
          end >= totalSize ||
          start > end
        ) {
          console.error(
            `[local-server.js] Invalid range: ${range} for ${normalizedFilePath}`,
          );
          res.writeHead(416, {
            'Content-Range': `bytes */${totalSize}`,
            'Content-Type': 'text/plain',
          });
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
        // Serve the whole file
        const head = {
          'Content-Length': totalSize,
          'Content-Type': getMimeType(normalizedFilePath),
          'Accept-Ranges': 'bytes', // Indicate that range requests are supported
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

  serverInstance = server; // Store the server instance

  serverInstance.listen(0, '127.0.0.1', () => {
    // Listen on port 0 for a random available port
    serverPort = serverInstance.address().port;
    console.log(
      `[local-server.js] Local media server started on http://localhost:${serverPort}`,
    );

    // Allow the process to exit even if the server is still running (useful for tests)
    if (process.env.NODE_ENV === 'test') {
      serverInstance.unref();
    }

    if (onReadyCallback && typeof onReadyCallback === 'function') {
      onReadyCallback();
    }
  });

  serverInstance.on('error', (err) => {
    console.error('[local-server.js] Server Error:', err);
    serverInstance = null; // Reset serverInstance on error
    serverPort = 0;
    // Handle server errors, e.g., if the server fails to start.
  });
}

/**
 * Stops the local HTTP server if it is running.
 * @param {() => void} [callback] - An optional callback to execute after the server has been successfully closed.
 * @returns {void}
 */
function stopLocalServer(callback) {
  if (serverInstance) {
    // Close all existing connections
    serverInstance.closeAllConnections?.(); // Available in Node 18.2+

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
  } else {
    if (callback && typeof callback === 'function') {
      callback(); // Call immediately if not running
    }
  }
}

/**
 * Gets the port the local server is running on.
 * @returns {number} The server port, or 0 if not started/listening.
 */
function getServerPort() {
  return serverPort;
}

module.exports = {
  startLocalServer,
  stopLocalServer,
  getServerPort,
  getMimeType,
};
