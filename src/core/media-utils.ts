import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { spawn } from 'child_process';
import rangeParser from 'range-parser';

import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './constants';

const FFMPEG_TRANSCODE_PRESET = 'ultrafast';
const FFMPEG_TRANSCODE_CRF = '23';

const KNOWN_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export function getMimeType(filePath: string): string {
  if (filePath.startsWith('gdrive://')) {
    return 'application/octet-stream';
  }

  const extension = path.extname(filePath).substring(1).toLowerCase();
  if (SUPPORTED_IMAGE_EXTENSIONS.includes(`.${extension}`)) {
    return KNOWN_MIME_TYPES[extension] || `image/${extension}`;
  }
  if (SUPPORTED_VIDEO_EXTENSIONS.includes(`.${extension}`)) {
    return KNOWN_MIME_TYPES[extension] || `video/${extension}`;
  }
  return 'application/octet-stream';
}

export function getThumbnailCachePath(filePath: string, cacheDir: string) {
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  return path.join(cacheDir, `${hash}.jpg`);
}

export async function checkThumbnailCache(cacheFile: string): Promise<boolean> {
  try {
    await fs.promises.access(cacheFile);
    return true;
  } catch {
    return false;
  }
}

export async function getVlcPath(): Promise<string | null> {
  const platform = process.platform;
  if (platform === 'win32') {
    const commonPaths = [
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    ];
    for (const p of commonPaths) {
      try {
        await fs.promises.access(p);
        return p;
      } catch {
        // Continue checking
      }
    }
    return null;
  } else if (platform === 'darwin') {
    const macPath = '/Applications/VLC.app/Contents/MacOS/VLC';
    try {
      await fs.promises.access(macPath);
      return macPath;
    } catch {
      return 'vlc';
    }
  } else {
    return 'vlc';
  }
}

export function isValidTimeFormat(time: string): boolean {
  // Allow simple seconds (e.g., "10", "10.5") or timestamps (e.g., "00:00:10", "00:10.5")
  return /^\d+(\.\d+)?$/.test(time) || /^(\d+:)+\d+(\.\d+)?$/.test(time);
}

export function getTranscodeArgs(
  inputPath: string,
  startTime: string | null,
): string[] {
  const args: string[] = [];

  if (startTime) {
    if (!isValidTimeFormat(startTime)) {
      throw new Error('Invalid start time format');
    }
    args.push('-ss', startTime);
  }

  args.push(
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
    FFMPEG_TRANSCODE_PRESET,
    '-crf',
    FFMPEG_TRANSCODE_CRF,
    '-pix_fmt',
    'yuv420p',
    'pipe:1',
  );

  return args;
}

export function getThumbnailArgs(
  filePath: string,
  cacheFile: string,
): string[] {
  return [
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
}

export function runFFmpeg(
  command: string,
  args: string[],
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let stderr = '';

    if (process.stderr) {
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    process.on('close', (code) => {
      resolve({ code, stderr });
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Parses the HTTP Range header to determine start and end bytes.
 * Handles parsing errors by falling back to the full file range.
 *
 * @param totalSize - The total size of the file in bytes.
 * @param rangeHeader - The 'Range' header string from the request.
 * @returns An object containing `start` and `end` offsets, or an `error` flag if unsatisfiable.
 */
export function parseHttpRange(
  totalSize: number,
  rangeHeader?: string,
): { start: number; end: number; error?: boolean } {
  // Default to full content
  if (!rangeHeader) {
    return { start: 0, end: totalSize - 1 };
  }

  const ranges = rangeParser(totalSize, rangeHeader);

  // Case: Unsatisfiable range (e.g. requesting bytes past end of file)
  if (ranges === -1) {
    return { start: 0, end: 0, error: true };
  }

  // Case: Malformed header or other error -> treat as full content (ignore header)
  // ranges === -2 is malformed
  if (ranges === -2 || !Array.isArray(ranges) || ranges.length === 0) {
    return { start: 0, end: totalSize - 1 };
  }

  // Success: Return the first range
  return { start: ranges[0].start, end: ranges[0].end };
}

/**
 * Extracts a query parameter from a query object, handling array/string cases.
 * Returns the first value if it's an array.
 *
 * @param query - The query object (e.g. req.query).
 * @param key - The query parameter key.
 * @returns The value as a string, or undefined if missing.
 */
export function getQueryParam(
  query: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) {
    return value[0] as string;
  }
  return value as string | undefined;
}
