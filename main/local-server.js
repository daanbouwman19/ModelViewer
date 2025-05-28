const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS } = require('./constants.js');

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
            case 'mp4': return 'video/mp4';
            case 'webm': return 'video/webm';
            case 'ogg': return 'video/ogg';
            case 'mov': return 'video/quicktime';
            case 'avi': return 'video/x-msvideo';
            case 'mkv': return 'video/x-matroska';
            default: return `video/${extension}`; // Fallback for other video types
        }
    }
    return 'application/octet-stream'; // Default for unknown or unsupported types
}

/**
 * Starts a local HTTP server to stream media files.
 * This is primarily used for larger video files that exceed Data URL limits.
 * The server listens on a random available port on 127.0.0.1.
 * @param {function} onReadyCallback - Callback function executed when the server is ready.
 */
function startLocalServer(onReadyCallback) {
    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url);
        // Decode URI component to handle spaces or special characters in file paths
        const requestedPath = decodeURIComponent(parsedUrl.pathname.substring(1));

        // Security: Define the allowed base directory from which files can be served.
        // This prevents directory traversal attacks.
        // TODO: This should be configurable or derived more safely in a real application.
        const allowedBaseDirectory = path.normalize('D:\\');
        const normalizedFilePath = path.normalize(requestedPath);

        // Check if the normalized path is within the allowed directory and exists
        if (!normalizedFilePath.startsWith(allowedBaseDirectory) || !fs.existsSync(normalizedFilePath)) {
            console.error(`[local-server.js] Forbidden or not found: ${normalizedFilePath}`);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('File not found or access denied.');
        }

        try {
            const stat = fs.statSync(normalizedFilePath);
            const totalSize = stat.size;
            const range = req.headers.range;

            if (range) { // Handle byte range requests for streaming
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

                // Validate range
                if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
                    console.error(`[local-server.js] Invalid range: ${range} for ${normalizedFilePath}`);
                    res.writeHead(416, { 'Content-Range': `bytes */${totalSize}`, 'Content-Type': 'text/plain' });
                    return res.end('Requested range not satisfiable.');
                }

                const chunkSize = (end - start) + 1;
                const fileStream = fs.createReadStream(normalizedFilePath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': getMimeType(normalizedFilePath),
                };
                res.writeHead(206, head); // 206 Partial Content
                fileStream.pipe(res);
            } else { // Serve the whole file
                const head = {
                    'Content-Length': totalSize,
                    'Content-Type': getMimeType(normalizedFilePath),
                    'Accept-Ranges': 'bytes' // Indicate that range requests are supported
                };
                res.writeHead(200, head); // 200 OK
                fs.createReadStream(normalizedFilePath).pipe(res);
            }
        } catch (serverError) {
            console.error(`[local-server.js] Error processing file ${normalizedFilePath}:`, serverError);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Server error processing the file.");
        }
    });

    server.listen(0, '127.0.0.1', () => { // Listen on port 0 for a random available port
        serverPort = server.address().port;
        console.log(`[local-server.js] Local media server started on http://localhost:${serverPort}`);
        if (onReadyCallback && typeof onReadyCallback === 'function') {
            onReadyCallback();
        }
    });

    server.on('error', (err) => {
        console.error('[local-server.js] Server Error:', err);
        // Handle server errors, e.g., if the server fails to start.
        // The onReadyCallback might not be called in this case.
    });
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
    getServerPort,
    getMimeType // Exported for use in main.js and potentially tests
};
