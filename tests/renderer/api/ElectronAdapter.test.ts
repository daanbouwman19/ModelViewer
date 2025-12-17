import { describe, it, expect, vi } from 'vitest';
import { ElectronAdapter } from '../../../src/renderer/api/ElectronAdapter';
import { runBackendContractTests } from './backend.contract';

describe('ElectronAdapter', () => {
  const mockElectronAPI = {
    loadFileAsDataURL: vi.fn(),
    recordMediaView: vi.fn(),
    getMediaViewCounts: vi.fn(),
    getAlbumsWithViewCounts: vi.fn(),
    reindexMediaLibrary: vi.fn(),
    addMediaDirectory: vi.fn(),
    removeMediaDirectory: vi.fn(),
    setDirectoryActiveState: vi.fn(),
    getMediaDirectories: vi.fn(),
    getSupportedExtensions: vi.fn(),
    getServerPort: vi.fn(),
    openInVlc: vi.fn(),
    getVideoMetadata: vi.fn(),
    listDirectory: vi.fn(),
    getParentDirectory: vi.fn(),
    setRating: vi.fn(),
    createSmartPlaylist: vi.fn(),
    getSmartPlaylists: vi.fn(),
    updateSmartPlaylist: vi.fn(),
    deleteSmartPlaylist: vi.fn(),
    upsertMetadata: vi.fn(),
    getMetadata: vi.fn(),
    getAllMetadataAndStats: vi.fn(),
    extractMetadata: vi.fn(),
    startGoogleDriveAuth: vi.fn(),
    submitGoogleDriveAuthCode: vi.fn(),
    addGoogleDriveSource: vi.fn(),
    listGoogleDriveDirectory: vi.fn(),
    getGoogleDriveParent: vi.fn(),
  };

  runBackendContractTests(
    'ElectronAdapter',
    () => new ElectronAdapter(mockElectronAPI as any),
    (method, result, error) => {
      const mock = mockElectronAPI[method as keyof typeof mockElectronAPI];
      if (!mock) throw new Error(`Method ${method} not mocked`);

      vi.clearAllMocks();

      if (method === 'getVideoMetadata' && error) {
         mock.mockResolvedValue({ error });
         return;
      }

      if (error) {
        mock.mockRejectedValue(new Error(error));
      } else {
        mock.mockResolvedValue(result);
      }
    },
    { supportsVlc: true }
  );

  // Additional specific tests if any
  it('loadFileAsDataURL calls bridge directly', async () => {
     mockElectronAPI.loadFileAsDataURL.mockResolvedValue({ type: 'test' });
     const adapter = new ElectronAdapter(mockElectronAPI as any);
     const res = await adapter.loadFileAsDataURL('file');
     expect(res).toEqual({ type: 'test' });
     expect(mockElectronAPI.loadFileAsDataURL).toHaveBeenCalledWith('file');
  });
});
