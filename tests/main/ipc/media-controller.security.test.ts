import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Must hoist mocks
vi.mock('../../../src/main/utils/ipc-helper', () => ({
  handleIpc: vi.fn(),
}));

// Mock ffmpeg-static to simulate present binary
vi.mock('ffmpeg-static', () => ({
  default: '/mock/ffmpeg',
}));

// Import after mocks
import { registerMediaHandlers } from '../../../src/main/ipc/media-controller';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import { handleIpc } from '../../../src/main/utils/ipc-helper';
import { filterAuthorizedPaths } from '../../../src/main/utils/security-utils';
import { extractAndSaveMetadata } from '../../../src/core/media-service';

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

describe('media-controller security', () => {
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

  describe('MEDIA_EXTRACT_METADATA', () => {
    it('should filter unauthorized paths before extraction', async () => {
      const handler = getHandler(IPC_CHANNELS.MEDIA_EXTRACT_METADATA);
      const inputPaths = ['/authorized/path.mp4', '/unauthorized/path.mp4'];
      const authorizedPaths = ['/authorized/path.mp4'];

      (filterAuthorizedPaths as Mock).mockResolvedValue(authorizedPaths);
      (extractAndSaveMetadata as Mock).mockResolvedValue(undefined);

      await handler({}, inputPaths);

      expect(filterAuthorizedPaths).toHaveBeenCalledWith(inputPaths);
      expect(extractAndSaveMetadata).toHaveBeenCalledWith(
        authorizedPaths,
        '/mock/ffmpeg',
        { forceCheck: true },
      );
    });
  });
});
