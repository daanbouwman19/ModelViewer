import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { execa } from 'execa';

import {
  GDRIVE_PROTOCOL,
  SUPPORTED_IMAGE_EXTENSIONS_SET,
  SUPPORTED_VIDEO_EXTENSIONS_SET,
} from './constants';

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

  // Bolt Optimization: Use Set for O(1) lookup and avoid substring(1) until needed
  const ext = path.extname(filePath).toLowerCase();

  if (SUPPORTED_IMAGE_EXTENSIONS_SET.has(ext)) {
    const extNoDot = ext.slice(1);
    return KNOWN_MIME_TYPES[extNoDot] || `image/${extNoDot}`;
  }
  if (SUPPORTED_VIDEO_EXTENSIONS_SET.has(ext)) {
    const extNoDot = ext.slice(1);
    return KNOWN_MIME_TYPES[extNoDot] || `video/${extNoDot}`;
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

    return { code: result.exitCode ?? null, stderr: result.stderr };
  } catch (error: unknown) {
    // If it's a timeout error thrown by execa (can happen if reject: true, or maybe version diff)
    if (typeof error === 'object' && error !== null && 'timedOut' in error) {
      throw new Error(`Process timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
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
