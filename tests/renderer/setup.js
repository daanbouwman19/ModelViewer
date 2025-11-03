import { vi } from 'vitest';

global.window = {
  electronAPI: {
    loadFileAsDataURL: vi.fn(),
    addMediaDirectory: vi.fn(),
    removeMediaDirectory: vi.fn(),
    setDirectoryActiveState: vi.fn(),
    getMediaDirectories: vi.fn(),
    reindexMediaLibrary: vi.fn(),
    getModelsWithViewCounts: vi.fn(),
    getSupportedExtensions: vi.fn(),
    recordMediaView: vi.fn(),
  },
};
