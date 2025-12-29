import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerMediaHandlers } from '../../../src/main/ipc/media-controller';
import { handleIpc } from '../../../src/main/utils/ipc-helper';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import { getRecentlyPlayed } from '../../../src/main/database';

vi.mock('../../../src/main/utils/ipc-helper', () => ({
  handleIpc: vi.fn(),
}));

vi.mock('../../../src/main/database', () => ({
  recordMediaView: vi.fn(),
  getMediaViewCounts: vi.fn(),
  getRecentlyPlayed: vi.fn(), // Mock the new function
}));

// Mock other dependencies to avoid errors
vi.mock('../../../src/main/utils/security-utils', () => ({
  validatePathAccess: vi.fn(),
  filterAuthorizedPaths: vi.fn(),
}));
vi.mock('../../../src/core/media-handler', () => ({
  generateFileUrl: vi.fn(),
  getVideoDuration: vi.fn(),
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
vi.mock('../../../src/main/local-server', () => ({
  getServerPort: vi.fn(),
}));

describe('Media Controller - Recently Played', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMediaHandlers();
  });

  it('should register GET_RECENTLY_PLAYED handler', () => {
    expect(handleIpc).toHaveBeenCalledWith(
        IPC_CHANNELS.DB_GET_RECENTLY_PLAYED,
        expect.any(Function)
    );
  });

  it('GET_RECENTLY_PLAYED handler should call getRecentlyPlayed with limit', async () => {
    const handler = (handleIpc as any).mock.calls.find(
        (call: any) => call[0] === IPC_CHANNELS.DB_GET_RECENTLY_PLAYED
    )[1];

    const limit = 25;
    await handler({}, limit);

    expect(getRecentlyPlayed).toHaveBeenCalledWith(limit);
  });
});
