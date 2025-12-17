import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Must hoist mocks
vi.mock('../../../src/main/utils/ipc-helper', () => ({
  handleIpc: vi.fn(),
}));

// Mock ffmpeg-static to simulate missing binary or failure
vi.mock('ffmpeg-static', () => ({
  default: null,
}));

// Import after mocks
import { registerMediaHandlers } from '../../../src/main/ipc/media-controller';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import { handleIpc } from '../../../src/main/utils/ipc-helper';
import { validatePathAccess } from '../../../src/main/utils/security-utils';

vi.mock('../../../src/main/local-server', () => ({ getServerPort: vi.fn() }));
vi.mock('../../../src/core/media-handler', () => ({
  generateFileUrl: vi.fn(),
  getVideoDuration: vi.fn(),
}));
vi.mock('../../../src/main/utils/security-utils', () => ({
  validatePathAccess: vi.fn(),
  filterAuthorizedPaths: vi.fn(),
}));
vi.mock('../../../src/main/database', () => ({
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
}));
vi.mock('../../../src/main/google-drive-service', () => ({
  getDriveFileMetadata: vi.fn(),
  listDriveDirectory: vi.fn(),
  getDriveParent: vi.fn(),
}));
vi.mock('../../../src/core/media-service', () => ({
  getAlbumsWithViewCounts: vi.fn(),
  getAlbumsWithViewCountsAfterScan: vi.fn(),
  extractAndSaveMetadata: vi.fn(),
}));

describe('media-controller (ffmpeg missing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (handleIpc as Mock).mockClear();
    registerMediaHandlers();
  });

  const getHandler = (channel: string) => {
    const call = (handleIpc as Mock).mock.calls.find((c) => c[0] === channel);
    if (!call) throw new Error(`Handler for ${channel} not found`);
    return call[1];
  };

  describe('GET_VIDEO_METADATA', () => {
    it('throws if ffmpeg missing for local file', async () => {
      const handler = getHandler(IPC_CHANNELS.GET_VIDEO_METADATA);
      (validatePathAccess as Mock).mockResolvedValue(undefined);

      await expect(handler({}, '/path/to.mp4')).rejects.toThrow(
        'FFmpeg binary not found',
      );
    });
  });

  describe('MEDIA_EXTRACT_METADATA', () => {
    it('skips extraction if ffmpeg missing', async () => {
      const handler = getHandler(IPC_CHANNELS.MEDIA_EXTRACT_METADATA);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handler({}, ['/path']);

      expect(consoleSpy).toHaveBeenCalledWith(
        'FFmpeg not found, skipping metadata extraction',
      );
      consoleSpy.mockRestore();
    });
  });
});
