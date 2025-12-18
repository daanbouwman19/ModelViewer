import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

import {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from './constants';

export function getMimeType(filePath: string): string {
  if (filePath.startsWith('gdrive://')) {
    return 'application/octet-stream';
  }

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
