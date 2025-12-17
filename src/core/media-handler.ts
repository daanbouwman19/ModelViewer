/**
 * @file Shared media request handler.
 * Handles video streaming, metadata retrieval, and thumbnail generation.
 */

import http from 'http';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { spawn } from 'child_process';
import rangeParser from 'range-parser';
import { createMediaSource } from './media-source';

import { IMediaSource } from './media-source-types';
import {
  getThumbnailCachePath,
  checkThumbnailCache,
  getMimeType,
} from './media-utils';
import {
  getDriveFileMetadata,
  getDriveFileThumbnail,
  getDriveFileStream,
} from '../main/google-drive-service';
import { authorizeFilePath } from './security';
import { DATA_URL_THRESHOLD_MB } from './constants';

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
  cacheDir: string;
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
    const ranges = rangeParser(totalSize, rangeHeader);

    if (Array.isArray(ranges) && ranges.length > 0) {
      // For simplicity, we only handle the first range.
      start = ranges[0].start;
      end = ranges[0].end;
    } else if (ranges === -1) {
      // -1: Unsatisfiable
      res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
      return res.end('Requested range not satisfiable.');
    } else if (ranges === -2) {
      // -2: Malformed -> typically ignore and serve full content or 400.
      // Standard behavior is often to treat as no range or error.
      // We will proceed with full content (default start=0, end=total-1)
    }
  }

  if (start >= totalSize) {
    res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
    return res.end('Requested range not satisfiable.');
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
    '-analyzeduration',
    '100M',
    '-probesize',
    '100M',
    '-i',
    inputPath,
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

  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
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
      const isTranscodeForced =
        parsedUrl.searchParams.get('transcode') === 'true';

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
          return await serveTranscodedStream(
            req,
            res,
            source,
            ffmpegPath,
            startTime,
          );
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

/**
 * Generates a URL (Data URL or HTTP URL) for loading a file.
 */
export async function generateFileUrl(
  filePath: string,
  options: { serverPort: number; preferHttp?: boolean },
): Promise<{
  type: 'data-url' | 'http-url' | 'error';
  url?: string;
  message?: string;
}> {
  try {
    const { serverPort, preferHttp } = options;

    // 1. Handle Google Drive Files
    if (filePath.startsWith('gdrive://')) {
      const fileId = filePath.replace('gdrive://', '');

      // For video, or preferHttp, return HTTP URL from local server which pipes Drive stream
      const meta = await getDriveFileMetadata(fileId);

      // Use threshold for ALL files (images or video)
      const isLarge = Number(meta.size) > DATA_URL_THRESHOLD_MB * 1024 * 1024;

      if (preferHttp || isLarge) {
        if (serverPort === 0) {
          return {
            type: 'error',
            message: 'Local server not ready to stream Drive file.',
          };
        }
        // We need to encode the URI because the file path is now a gdrive:// URI
        const encodedPath = encodeURIComponent(filePath);
        return {
          type: 'http-url',
          url: `http://localhost:${serverPort}/video/stream?file=${encodedPath}`,
        };
      }

      // For small files, return Data URL
      // Fetch buffer
      const stream = await getDriveFileStream(fileId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      const mimeType = meta.mimeType || 'application/octet-stream';
      const dataURL = `data:${mimeType};base64,${buffer.toString('base64')}`;
      return { type: 'data-url', url: dataURL };
    }

    // 2. Handle Local Files
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      return { type: 'error', message: auth.message || 'Access denied' };
    }

    // If preferHttp is true, always return an HTTP URL (if the server is running)
    if (preferHttp && serverPort > 0) {
      const pathForUrl = filePath.replace(/\\/g, '/');
      return {
        type: 'http-url',
        url: `http://localhost:${serverPort}/${pathForUrl}`,
      };
    }

    const stats = await fsPromises.stat(filePath);

    if (stats.size > DATA_URL_THRESHOLD_MB * 1024 * 1024) {
      if (serverPort === 0) {
        return {
          type: 'error',
          message: 'Local server not ready to stream large file.',
        };
      }
      const pathForUrl = filePath.replace(/\\/g, '/');
      return {
        type: 'http-url',
        url: `http://localhost:${serverPort}/${pathForUrl}`,
      };
    }

    const mimeType = getMimeType(filePath);
    const fileBuffer = await fsPromises.readFile(filePath);
    const dataURL = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    return { type: 'data-url', url: dataURL };
  } catch (error: unknown) {
    console.error(
      `[media-handler] Error processing ${filePath} in generateFileUrl:`,
      error,
    );
    return {
      type: 'error',
      message: (error as Error).message || 'Unknown error processing file.',
    };
  }
}

/**
 * Opens a media file in VLC Media Player.
 */
export async function openMediaInVlc(
  filePath: string,
  serverPort: number,
): Promise<{ success: boolean; message?: string }> {
  // Drive check replaced by streaming logic below

  if (filePath.startsWith('gdrive://')) {
    // Create a local stream URL for VLC
    if (serverPort === 0) {
      return {
        success: false,
        message: 'Local server is not running to stream Drive file.',
      };
    }
    const encodedPath = encodeURIComponent(filePath);
    const streamUrl = `http://localhost:${serverPort}/video/stream?file=${encodedPath}`;
    console.log(`[VLC] Streaming Drive file from: ${streamUrl}`);
  }

  // Logic to resolve VLC path
  const platform = process.platform;
  let vlcPath: string | null = null;
  let fileArg = filePath;

  if (filePath.startsWith('gdrive://')) {
    // We already checked port above
    if (serverPort > 0) {
      fileArg = `http://localhost:${serverPort}/video/stream?file=${encodeURIComponent(filePath)}`;
    } else {
      return { success: false, message: 'Server not ready for streaming' };
    }
  } else {
    // Local file auth check
    const auth = await authorizeFilePath(filePath);
    if (!auth.isAllowed) {
      return { success: false, message: auth.message || 'Access denied' };
    }
  }

  if (platform === 'win32') {
    const commonPaths = [
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    ];
    for (const p of commonPaths) {
      try {
        await fsPromises.access(p);
        vlcPath = p;
        break;
      } catch {
        // Continue checking other paths
      }
    }
  } else if (platform === 'darwin') {
    const macPath = '/Applications/VLC.app/Contents/MacOS/VLC';
    try {
      await fsPromises.access(macPath);
      vlcPath = macPath;
    } catch {
      // Fallback to trying 'vlc' in PATH if the standard app path fails
      vlcPath = 'vlc';
    }
  } else {
    // On Linux, assume 'vlc' is in the PATH
    vlcPath = 'vlc';
  }

  if (!vlcPath) {
    return {
      success: false,
      message:
        'VLC Media Player not found. Please ensure it is installed in the default location.',
    };
  }

  try {
    const child = spawn(vlcPath, [fileArg], {
      detached: true,
      stdio: 'ignore',
    });

    // Listen for spawn errors (e.g. ENOENT if 'vlc' is not in PATH)
    child.on('error', (err) => {
      console.error('[media-handler] Error launching VLC (async):', err);
    });

    child.unref();
    return { success: true };
  } catch (error: unknown) {
    console.error('[media-handler] Error launching VLC:', error);
    return {
      success: false,
      message: `Failed to launch VLC: ${(error as Error).message}`,
    };
  }
}
