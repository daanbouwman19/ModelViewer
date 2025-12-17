import { IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  validatePathAccess,
  filterAuthorizedPaths,
} from '../utils/security-utils';
import { generateFileUrl, getVideoDuration } from '../../core/media-handler';
import {
  getDriveFileMetadata,
  listDriveDirectory,
  getDriveParent,
} from '../google-drive-service';
import { recordMediaView, getMediaViewCounts } from '../database';
import {
  getAlbumsWithViewCounts,
  getAlbumsWithViewCountsAfterScan,
  extractAndSaveMetadata,
} from '../../core/media-service';
import { getServerPort } from '../local-server';
import { handleIpc } from '../utils/ipc-helper';

async function getFFmpegPath(): Promise<string | null> {
  try {
    const { default: path } = await import('ffmpeg-static');
    return path;
  } catch {
    return null;
  }
}

export function registerMediaHandlers() {
  handleIpc(
    IPC_CHANNELS.LOAD_FILE_AS_DATA_URL,
    async (
      _event: IpcMainInvokeEvent,
      filePath: string,
      options: { preferHttp?: boolean } = {},
    ) => {
      return generateFileUrl(filePath, {
        serverPort: getServerPort(),
        preferHttp: options.preferHttp,
      });
    },
  );

  handleIpc(
    IPC_CHANNELS.RECORD_MEDIA_VIEW,
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      await recordMediaView(filePath);
    },
    { validators: [(filePath) => validatePathAccess(filePath)] },
  );

  handleIpc(
    IPC_CHANNELS.GET_MEDIA_VIEW_COUNTS,
    async (_event: IpcMainInvokeEvent, filePaths: string[]) => {
      const allowedPaths = await filterAuthorizedPaths(filePaths);
      return getMediaViewCounts(allowedPaths);
    },
  );

  handleIpc(
    IPC_CHANNELS.GET_VIDEO_METADATA,
    async (_event: IpcMainInvokeEvent, filePath: string) => {
      try {
        if (filePath.startsWith('gdrive://')) {
          const fileId = filePath.replace('gdrive://', '');
          const meta = await getDriveFileMetadata(fileId);
          if (meta.videoMediaMetadata?.durationMillis) {
            return {
              duration: Number(meta.videoMediaMetadata.durationMillis) / 1000,
            };
          }
          throw new Error('Duration not available');
        }

        await validatePathAccess(filePath);

        const ffmpegPath = await getFFmpegPath();
        if (!ffmpegPath) {
          throw new Error('FFmpeg binary not found');
        }

        const res = await getVideoDuration(filePath, ffmpegPath);
        if ('error' in res) throw new Error(res.error);
        return res;
      } catch (error: unknown) {
        console.error('[MediaController] Error getting video metadata:', error);
        throw error;
      }
    },
  );

  handleIpc(IPC_CHANNELS.GET_ALBUMS_WITH_VIEW_COUNTS, async () => {
    const ffmpegPath = await getFFmpegPath();
    return getAlbumsWithViewCounts(ffmpegPath || undefined);
  });

  handleIpc(IPC_CHANNELS.REINDEX_MEDIA_LIBRARY, async () => {
    const ffmpegPath = await getFFmpegPath();
    return getAlbumsWithViewCountsAfterScan(ffmpegPath || undefined);
  });

  handleIpc(
    IPC_CHANNELS.MEDIA_EXTRACT_METADATA,
    async (_event: IpcMainInvokeEvent, filePaths: string[]) => {
      const ffmpegPath = await getFFmpegPath();
      if (!ffmpegPath) {
        console.warn('FFmpeg not found, skipping metadata extraction');
        return;
      }
      extractAndSaveMetadata(filePaths, ffmpegPath).catch((err) =>
        console.error('State extraction failed', err),
      );
    },
  );

  handleIpc(
    IPC_CHANNELS.DRIVE_LIST_DIRECTORY,
    async (_event, folderId: string) => {
      return await listDriveDirectory(folderId || 'root');
    },
  );

  handleIpc(IPC_CHANNELS.DRIVE_GET_PARENT, async (_event, folderId: string) => {
    try {
      return await getDriveParent(folderId);
    } catch (err) {
      console.error('Failed to get drive parent', err);
      return null;
    }
  });
}
