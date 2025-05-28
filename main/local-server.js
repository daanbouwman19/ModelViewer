const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS } = require('./constants.js');

let serverPort = 0;

// Moved from main.js
function getMimeType(filePath) {
    const extension = path.extname(filePath).substring(1).toLowerCase();
    if (SUPPORTED_IMAGE_EXTENSIONS.includes(`.${extension}`)) return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    if (SUPPORTED_VIDEO_EXTENSIONS.includes(`.${extension}`)) {
        if (extension === 'mp4') return 'video/mp4';
        if (extension === 'webm') return 'video/webm';
        if (extension === 'ogg') return 'video/ogg';
        if (extension === 'mov') return 'video/quicktime';
        if (extension === 'avi') return 'video/x-msvideo';
        if (extension === 'mkv') return 'video/x-matroska';
        return `video/${extension}`; // Fallback for other video types
    }
    return 'application/octet-stream'; // Default for unknown types
}

// Moved and modified from main.js
function startLocalServer(onReadyCallback) {
    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url);
        // Decode URI component to handle spaces or special characters in file paths
        const filePath = decodeURIComponent(parsedUrl.pathname.substring(1));

        // IMPORTANT: Define the allowed base directory for security.
        // This should ideally be configurable or derived safely.
        const allowedBaseDirectory = path.normalize('D:\\'); 
                                                        
        const normalizedFilePath = path.normalize(filePath);

        if (!normalizedFilePath.startsWith(allowedBaseDirectory) || !fs.existsSync(normalizedFilePath)) {
            console.error(`[local-server.js] Forbidden or not found: ${normalizedFilePath}`);
            res.writeHead(404);
            return res.end('File not found.');
        }

        try {
            const stat = fs.statSync(normalizedFilePath);
            const totalSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
                
                if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
                    console.error(`[local-server.js] Invalid range: ${range} for ${normalizedFilePath}`);
                    res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                    return res.end();
                }

                const chunkSize = (end - start) + 1;
                const file = fs.createReadStream(normalizedFilePath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': getMimeType(normalizedFilePath),
                };
                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': totalSize,
                    'Content-Type': getMimeType(normalizedFilePath),
                    'Accept-Ranges': 'bytes' // Good to include even for full content
                };
                res.writeHead(200, head);
                fs.createReadStream(normalizedFilePath).pipe(res);
            }
        } catch (serverError) {
            console.error(`[local-server.js] Error processing file ${normalizedFilePath}:`, serverError);
            res.writeHead(500);
            res.end("Server error.");
        }
    }).listen(0, '127.0.0.1', () => { // Listen on port 0 for a random available port
        serverPort = server.address().port;
        console.log(`[local-server.js] Local media server started on http://localhost:${serverPort}`);
        if (onReadyCallback && typeof onReadyCallback === 'function') {
            onReadyCallback(); // Call the callback (e.g., createWindow)
        }
    });

    server.on('error', (err) => {
        console.error('[local-server.js] Server Error:', err);
        // Handle server errors, e.g., port in use (though port 0 makes this unlikely for starting)
    });
}

function getServerPort() {
    return serverPort;
}

module.exports = {
    startLocalServer,
    getServerPort,
    getMimeType // Exporting if any other part needs it, or can be kept private if not
};
