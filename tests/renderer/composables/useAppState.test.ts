/**
 * Tests for useAppState composable
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppState } from '@/composables/useAppState';
// Import the api instance so we can spy/mock on it.
// We mock the module below, so this import gets the mocked version.
import { api } from '@/api';

// Mock the api module.
// We only mock the methods we use in the test.
vi.mock('@/api', () => ({
  api: {
    getAlbumsWithViewCounts: vi.fn(),
    getMediaDirectories: vi.fn(),
    getSupportedExtensions: vi.fn(),
    getSmartPlaylists: vi.fn(),
  },
}));

describe('useAppState', () => {
  let appState: ReturnType<typeof useAppState>;

  beforeEach(() => {
    // Reset the state before each test
    appState = useAppState();
    appState.state.allAlbums = [];
    appState.state.albumsSelectedForSlideshow = {};
    appState.state.mediaDirectories = [];
    appState.state.supportedExtensions = { images: [], videos: [], all: [] };
    appState.state.isSlideshowActive = false;
    appState.state.slideshowTimerId = null;
    appState.state.isTimerRunning = false;

    // Clear mocks
    vi.clearAllMocks();
  });

  describe('initializeApp', () => {
    it('should initialize app state with data from API', async () => {
      const mockAlbums = [
        { name: 'Album1', textures: [], totalViews: 0, children: [] },
        { name: 'Album2', textures: [], totalViews: 5, children: [] },
      ];
      const mockDirectories = [
        {
          path: '/dir1',
          isActive: true,
          id: '1',
          name: 'dir1',
          type: 'local' as const,
        },
        {
          path: '/dir2',
          isActive: false,
          id: '2',
          name: 'dir2',
          type: 'local' as const,
        },
      ];
      const mockExtensions = {
        images: ['.jpg', '.png'],
        videos: ['.mp4'],
        all: ['.jpg', '.png', '.mp4'],
      };

      // Setup mock returns
      vi.mocked(api.getAlbumsWithViewCounts).mockResolvedValue(mockAlbums);
      vi.mocked(api.getMediaDirectories).mockResolvedValue(mockDirectories);
      vi.mocked(api.getSmartPlaylists).mockResolvedValue([]);
      vi.mocked(api.getSupportedExtensions).mockResolvedValue(mockExtensions);

      await appState.initializeApp();

      expect(appState.state.allAlbums).toEqual(mockAlbums);
      expect(appState.state.mediaDirectories).toEqual(mockDirectories);
      expect(appState.state.supportedExtensions).toEqual(mockExtensions);
      expect(appState.state.albumsSelectedForSlideshow).toEqual({
        Album1: true,
        Album2: true,
      });
    });

    it('should handle error when API calls fail', async () => {
      vi.mocked(api.getAlbumsWithViewCounts).mockRejectedValue(
        new Error('API Error'),
      );
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await appState.initializeApp();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useAppState] Error during initial load:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('resetState', () => {
    it('should reset all slideshow-related state', () => {
      // Set up some state
      appState.state.isSlideshowActive = true;
      appState.state.displayedMediaFiles = [
        {
          name: 'file1.jpg',
          path: '/path/file1.jpg',
        },
      ];
      appState.state.currentMediaIndex = 5;
      appState.state.currentMediaItem = {
        name: 'test.jpg',
        path: '/path/test.jpg',
      };
      appState.state.globalMediaPoolForSelection = [
        {
          name: 'file3.jpg',
          path: '/path/file3.jpg',
        },
      ];

      appState.resetState();

      expect(appState.state.isSlideshowActive).toBe(false);
      expect(appState.state.displayedMediaFiles).toEqual([]);
      expect(appState.state.currentMediaIndex).toBe(-1);
      expect(appState.state.currentMediaItem).toBe(null);
      expect(appState.state.globalMediaPoolForSelection).toEqual([]);
    });
  });

  describe('stopSlideshow', () => {
    it('should clear timer and set isTimerRunning to false', () => {
      const timerId = setInterval(() => {}, 1000);
      appState.state.slideshowTimerId = timerId;
      appState.state.isTimerRunning = true;

      appState.stopSlideshow();

      expect(appState.state.slideshowTimerId).toBe(null);
      expect(appState.state.isTimerRunning).toBe(false);
    });

    it('should handle case when no timer is active', () => {
      appState.state.slideshowTimerId = null;
      appState.state.isTimerRunning = true;

      appState.stopSlideshow();

      expect(appState.state.slideshowTimerId).toBe(null);
      expect(appState.state.isTimerRunning).toBe(false);
    });
  });

  describe('state management', () => {
    it('should expose reactive state properties', () => {
      expect(appState.allAlbums).toBeDefined();
      expect(appState.albumsSelectedForSlideshow).toBeDefined();
      expect(appState.globalMediaPoolForSelection).toBeDefined();
      expect(appState.totalMediaInPool).toBeDefined();
      expect(appState.displayedMediaFiles).toBeDefined();
      expect(appState.currentMediaItem).toBeDefined();
      expect(appState.currentMediaIndex).toBeDefined();
      expect(appState.isSlideshowActive).toBeDefined();
      expect(appState.slideshowTimerId).toBeDefined();
      expect(appState.timerDuration).toBeDefined();
      expect(appState.isTimerRunning).toBeDefined();
      expect(appState.mediaFilter).toBeDefined();
      expect(appState.isSourcesModalVisible).toBeDefined();
      expect(appState.mediaDirectories).toBeDefined();
      expect(appState.supportedExtensions).toBeDefined();
    });

    it('should allow state modifications', () => {
      appState.state.timerDuration = 10;
      expect(appState.state.timerDuration).toBe(10);

      appState.state.mediaFilter = 'Images';
      expect(appState.state.mediaFilter).toBe('Images');

      appState.state.isSourcesModalVisible = true;
      expect(appState.state.isSourcesModalVisible).toBe(true);
    });
  });

  describe('computed properties', () => {
    it('should provide sets for supported extensions', () => {
      appState.state.supportedExtensions = {
        images: ['.jpg', '.png'],
        videos: ['.mp4'],
        all: ['.jpg', '.png', '.mp4'],
      };

      expect(appState.imageExtensionsSet.value.has('.jpg')).toBe(true);
      expect(appState.imageExtensionsSet.value.has('.mp4')).toBe(false);
      expect(appState.videoExtensionsSet.value.has('.mp4')).toBe(true);
      expect(appState.videoExtensionsSet.value.has('.jpg')).toBe(false);
    });

    it('should update when state changes', () => {
      appState.state.supportedExtensions = {
        images: [],
        videos: [],
        all: [],
      };
      expect(appState.imageExtensionsSet.value.size).toBe(0);

      appState.state.supportedExtensions = {
        images: ['.gif'],
        videos: [],
        all: ['.gif'],
      };
      expect(appState.imageExtensionsSet.value.has('.gif')).toBe(true);
    });
  });
});
