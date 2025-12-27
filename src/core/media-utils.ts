import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { spawn } from 'child_process';

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
