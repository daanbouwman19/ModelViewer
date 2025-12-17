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
} from './media-utils';
import { getProvider } from './fs-provider-factory';
import { authorizeFilePath } from './security';
import { DATA_URL_THRESHOLD_MB } from './constants';
import { GenerateUrlOptions, GenerateUrlResult } from './media-handler-types';

export interface MediaHandlerOptions {
  ffmpegPath: string | null;
  cacheDir: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let thumbnailQueue: any = null;

async function getThumbnailQueue() {
  if (thumbnailQueue) return thumbnailQueue;
  const { default: PQueue } = await import('p-queue');
  thumbnailQueue = new PQueue({ concurrency: 2 });
  return thumbnailQueue;
}

function runFFmpegThumbnail(
  filePath: string,
  cacheFile: string,
  ffmpegPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
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
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
    });
    genProcess.on('error', (err) => reject(err));
  });
}

/**
 * Retrieves video duration using ffmpeg or provider metadata.
 */
export async function getVideoDuration(
  filePath: string,
  ffmpegPath: string,
): Promise<{ duration: number } | { error: string }> {
  try {
    const provider = getProvider(filePath);
    const meta = await provider.getMetadata(filePath);
    if (meta.duration) {
      return { duration: meta.duration };
    }
  } catch {
    // Ignore provider errors
  }

  // If it's a Drive file and we didn't get duration from metadata,
  // we can't easily use local FFmpeg on the ID string.
  if (filePath.startsWith('gdrive://')) {
    return { error: 'Duration not available' };
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
      start = ranges[0].start;
      end = ranges[0].end;
    } else if (ranges === -1) {
      res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
      return res.end('Requested range not satisfiable.');
    }
  }

  if (start >= totalSize && totalSize > 0) {
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

  // 2. Try Provider (Drive)
  try {
    const provider = getProvider(filePath);
    const stream = await provider.getThumbnailStream(filePath);
    if (stream) {
      const writeStream = fs.createWriteStream(cacheFile);
      stream.pipe(writeStream);
      stream.pipe(res);
      return;
    }
  } catch (e) {
    console.warn('[Thumbnail] Provider fetch failed:', e);
    if (filePath.startsWith('gdrive://')) {
      if (!res.headersSent) {
        res.writeHead(404);
        res.end();
      }
      return;
    }
  }

  // 3. Fallback to FFmpeg (Local)
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

  try {
    const queue = await getThumbnailQueue();
    await queue.add(() =>
      runFFmpegThumbnail(filePath, cacheFile, ffmpegPath),
    );

    // Verify file exists
    await fsPromises.stat(cacheFile);

    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    });
    fs.createReadStream(cacheFile).pipe(res);
  } catch (err) {
    console.error('[Thumbnail] Generation failed:', err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Generation failed');
    }
  }
}

/**
 * Handles static file serving.
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
  options: GenerateUrlOptions,
): Promise<GenerateUrlResult> {
  try {
    const { serverPort, preferHttp } = options;
    const provider = getProvider(filePath);

    // [SECURITY] Check access for local files
    if (!filePath.startsWith('gdrive://')) {
      const auth = await authorizeFilePath(filePath);
      if (!auth.isAllowed)
        return { type: 'error', message: auth.message || 'Access denied' };
    }

    const meta = await provider.getMetadata(filePath);
    const isLarge = meta.size > DATA_URL_THRESHOLD_MB * 1024 * 1024;

    if (preferHttp || isLarge) {
      if (serverPort === 0) {
        return {
          type: 'error',
          message: isLarge
            ? 'Local server not ready to stream large file.'
            : 'Local server not ready to stream file.',
        };
      }
      const encodedPath = encodeURIComponent(filePath);
      return {
        type: 'http-url',
        url: `http://localhost:${serverPort}/video/stream?file=${encodedPath}`,
      };
    }

    const result = await provider.getStream(filePath);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const mimeType = meta.mimeType || 'application/octet-stream';
    const dataURL = `data:${mimeType};base64,${buffer.toString('base64')}`;
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
  const platform = process.platform;
  let vlcPath: string | null = null;
  let fileArg = filePath;

  if (filePath.startsWith('gdrive://')) {
    if (serverPort > 0) {
      fileArg = `http://localhost:${serverPort}/video/stream?file=${encodeURIComponent(filePath)}`;
    } else {
      return {
        success: false,
        message: 'Local server is not running to stream files.',
      };
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
        // Continue checking
      }
    }
  } else if (platform === 'darwin') {
    const macPath = '/Applications/VLC.app/Contents/MacOS/VLC';
    try {
      await fsPromises.access(macPath);
      vlcPath = macPath;
    } catch {
      vlcPath = 'vlc';
    }
  } else {
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
