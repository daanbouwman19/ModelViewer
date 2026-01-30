import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAlbumsWithViewCountsAfterScan } from '../../src/core/media-service';
import * as database from '../../src/core/database';
// import { WorkerClient } from '../../src/core/worker-client';

// Mock dependencies
vi.mock('../../src/core/database', () => ({
  getAllMetadata: vi.fn(),
  getAllMediaViewCounts: vi.fn(),
  cacheAlbums: vi.fn(),
  getMediaDirectories: vi.fn(),
  getPendingMetadata: vi.fn(),
  getSetting: vi.fn(),
  getCachedAlbums: vi.fn(),
}));

const mockSendMessage = vi.fn();
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockTerminate = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/core/worker-client', () => {
  return {
    WorkerClient: class {
      init = mockInit;
      sendMessage = mockSendMessage;
      terminate = mockTerminate;
      constructor() {}
    },
  };
});

describe('media-service mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should mutate albums in-place', async () => {
    // 1. Setup Data
    const mockAlbum = {
      id: 'album-1',
      name: 'Test Album',
      textures: [{ name: 'video.mp4', path: '/video.mp4', rating: 0 } as any],
      children: [
        {
          id: 'child-1',
          name: 'Child Album',
          textures: [{ name: 'image.jpg', path: '/image.jpg' }],
          children: [],
        },
      ],
    };

    // Make database.getMediaDirectories return something valid
    vi.mocked(database.getMediaDirectories).mockResolvedValue([
      { id: '1', path: '/media', type: 'local', name: 'Media', isActive: true },
    ]);
    vi.mocked(database.getPendingMetadata).mockResolvedValue([]);

    // Mock WorkerClient to return our album
    mockSendMessage.mockResolvedValue([mockAlbum]);

    // Mock DB responses for stats
    vi.mocked(database.getAllMediaViewCounts).mockResolvedValue({
      '/video.mp4': 5,
    });
    vi.mocked(database.getAllMetadata).mockResolvedValue({
      '/video.mp4': { duration: 120, rating: 4 },
    });

    // 2. Execute
    // This calls scanDiskForAlbumsAndCache -> WorkerClient -> returns mockAlbum
    // Then calls enrichAlbumsWithStats (which we want to test)
    // We do NOT pass 'ffmpeg' to avoid triggering background metadata extraction,
    // which is not relevant for this test and causes noise due to incomplete mocks.
    const result = await getAlbumsWithViewCountsAfterScan();

    // 3. Verify
    // Check Referential Equality: The result array should contain the SAME album object we mocked.
    expect(result[0]).toBe(mockAlbum);

    // Check In-Place Updates
    expect(mockAlbum.textures[0].viewCount).toBe(5);
    expect(mockAlbum.textures[0].duration).toBe(120);
    expect(mockAlbum.textures[0].rating).toBe(4); // Metadata override

    // Check Child Recursion
    expect(result[0].children[0]).toBe(mockAlbum.children[0]);
    // Even if no stats for child, it should be the same object
    expect(result[0].children[0].textures[0].viewCount).toBe(0);
  });
});
