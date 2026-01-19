import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { execa } from 'execa';
import rangeParser from 'range-parser';

import {
  GDRIVE_PROTOCOL,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './constants.ts';

const FFMPEG_TRANSCODE_PRESET = 'ultrafast';
const FFMPEG_TRANSCODE_CRF = '23';

/**
 * Standard FFmpeg input options for probing and analysis.
 */
const FFMPEG_INPUT_OPTIONS = ['-analyzeduration', '100M', '-probesize', '100M'];

/**
 * Standard FFmpeg output options for transcoding to browser-compatible format (MP4/H.264).
 */
const FFMPEG_OUTPUT_OPTIONS = [
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
];

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

/**
 * Checks if the given path is a Google Drive path.
 * @param filePath The file path to check.
 */
export function isDrivePath(filePath: string): boolean {
  return filePath.startsWith(GDRIVE_PROTOCOL);
}

/**
 * Extracts the Google Drive file ID from a gdrive:// path.
 * @param filePath The gdrive:// path.
 */
export function getDriveId(filePath: string): string {
  if (!isDrivePath(filePath)) return filePath;
  return filePath.slice(GDRIVE_PROTOCOL.length);
}

/**
 * Creates a gdrive:// path from a file ID.
 * @param fileId The Google Drive file ID.
 */
export function createDrivePath(fileId: string): string {
  return `${GDRIVE_PROTOCOL}${fileId}`;
}

export function getMimeType(filePath: string): string {
  if (isDrivePath(filePath)) {
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
  // [SECURITY] Strictly validate format to prevent ReDoS and invalid FFmpeg arguments.
  // Limit to at most 2 colons (HH:MM:SS format).
  return /^(?:\d+:){0,2}\d+(?:\.\d+)?$/.test(time);
}

export function getTranscodeArgs(
  inputPath: string,
  startTime: string | undefined | null,
): string[] {
  const args: string[] = ['-hide_banner', '-loglevel', 'error'];

  if (startTime) {
    if (!isValidTimeFormat(startTime)) {
      throw new Error('Invalid start time format');
    }
    args.push('-ss', startTime);
  }

  args.push(...FFMPEG_INPUT_OPTIONS);
  args.push('-i', inputPath);
  args.push(...FFMPEG_OUTPUT_OPTIONS);

  return args;
}

export function getThumbnailArgs(
  filePath: string,
  cacheFile: string,
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
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

/**
 * Runs FFmpeg (or any command) with a timeout to prevent hanging processes (DoS).
 * Uses `execa` for robust process handling.
 *
 * @param command - The command to run (e.g. ffmpeg path).
 * @param args - Arguments for the command.
 * @param timeoutMs - Timeout in milliseconds (default: 30000).
 * @returns Promise resolving to { code, stderr }.
 * @throws Error if process fails or times out.
 */
export async function runFFmpeg(
  command: string,
  args: string[],
  timeoutMs = 30000,
): Promise<{ code: number | null; stderr: string }> {
  try {
    const result = await execa(command, args, {
      timeout: timeoutMs,
      reject: false, // We want to handle non-zero exit codes manually to match previous behavior
    });

    if (result.timedOut) {
      // [SECURITY] Process timed out, ensure it was killed.
      // Execa kills it automatically on timeout.
      throw new Error(`Process timed out after ${timeoutMs}ms`);
    }

    return { code: result.exitCode, stderr: result.stderr };
  } catch (error: unknown) {
    // If it's a timeout error thrown by execa (can happen if reject: true, or maybe version diff)
    if (typeof error === 'object' && error !== null && 'timedOut' in error) {
      throw new Error(`Process timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
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
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

export function parseFFmpegDuration(stderr: string): number | null {
  const match = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (match) {
    const hours = parseFloat(match[1]);
    const minutes = parseFloat(match[2]);
    const seconds = parseFloat(match[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

export async function getFFmpegDuration(
  filePath: string,
  ffmpegPath: string,
): Promise<number> {
  try {
    const { stderr } = await runFFmpeg(ffmpegPath, ['-i', filePath]);
    const duration = parseFFmpegDuration(stderr);
    if (duration !== null) {
      return duration;
    } else {
      throw new Error('Could not determine duration');
    }
  } catch (err) {
    if ((err as Error).message === 'Could not determine duration') throw err;
    console.error('[Metadata] FFmpeg spawn error:', err);
    throw new Error('FFmpeg execution failed');
  }
}
