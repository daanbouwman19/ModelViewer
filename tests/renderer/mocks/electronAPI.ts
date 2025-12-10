import { vi } from 'vitest';
import type { ElectronAPI } from '../../../src/preload/preload';

export const createMockElectronAPI = (): ElectronAPI => ({
  loadFileAsDataURL: vi.fn().mockResolvedValue({ type: 'data-url', url: '' }),
  getServerPort: vi.fn().mockResolvedValue(0),
  openInVlc: vi.fn().mockResolvedValue({ success: true }),
  recordMediaView: vi.fn().mockResolvedValue(undefined),
  getMediaViewCounts: vi.fn().mockResolvedValue({}),
  getAlbumsWithViewCounts: vi.fn().mockResolvedValue([]),
  reindexMediaLibrary: vi.fn().mockResolvedValue([]),
  addMediaDirectory: vi.fn().mockResolvedValue(null),
  removeMediaDirectory: vi.fn().mockResolvedValue(undefined),
  setDirectoryActiveState: vi.fn().mockResolvedValue(undefined),
  getMediaDirectories: vi.fn().mockResolvedValue([]),
  getSupportedExtensions: vi
    .fn()
    .mockResolvedValue({ images: [], videos: [], all: [] }),

  listDirectory: vi.fn().mockResolvedValue([]),
  getParentDirectory: vi.fn().mockResolvedValue(null),
});
