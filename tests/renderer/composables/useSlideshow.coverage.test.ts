import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { reactive, toRefs } from 'vue';
import { useSlideshow } from '@/composables/useSlideshow';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';
import { createMockElectronAPI } from '../mocks/electronAPI';

vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');

// Mock the api module directly to avoid WebAdapter network calls
vi.mock('@/api', () => ({
  api: {
    recordMediaView: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the global window.electronAPI
global.window.electronAPI = createMockElectronAPI();

describe('useSlideshow additional coverage', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLibraryState = reactive({
      supportedExtensions: {
        videos: ['.mp4', '.webm'],
        images: ['.png', '.jpg', '.jpeg'],
      },
      globalMediaPoolForSelection: [],
      albumsSelectedForSlideshow: {},
      allAlbums: [],
      totalMediaInPool: 0,
      imageExtensionsSet: new Set(['.png', '.jpg', '.jpeg']),
      videoExtensionsSet: new Set(['.mp4', '.webm']),
    });

    mockPlayerState = reactive({
      displayedMediaFiles: [],
      currentMediaIndex: -1,
      currentMediaItem: null,
      isSlideshowActive: false,
      slideshowTimerId: null,
      isTimerRunning: false,
      timerDuration: 30,
    });

    mockUIState = reactive({
      mediaFilter: 'All',
    });

    (useLibraryStore as Mock).mockReturnValue({
      state: mockLibraryState,
      ...toRefs(mockLibraryState),
    });

    (usePlayerStore as Mock).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
      stopSlideshow: vi.fn(),
    });

    (useUIStore as Mock).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
    });
  });

  describe('selectWeightedRandom', () => {
    it('should use uniform random selection if total weight is near zero', () => {
      const items = [
        { path: 'a', name: 'a', viewCount: 1e9 }, // Very high view count, near-zero weight
        { path: 'b', name: 'b', viewCount: 1e9 },
      ];
      // Reuse the hook, which will pick up the mocks
      const { selectWeightedRandom } = useSlideshow();

      const mathRandomSpy = vi
        .spyOn(global.Math, 'random')
        .mockReturnValue(0.6);

      const selected = selectWeightedRandom(items);
      expect(selected!.path).toBe('b');

      mathRandomSpy.mockRestore();
    });

    it('should not return null if no eligible items and total weight is near zero', () => {
      const items = [{ path: 'a', name: 'a', viewCount: 1e9 }];
      const { selectWeightedRandom } = useSlideshow();
      const selected = selectWeightedRandom(items, ['a']);
      expect(selected).not.toBeNull();
    });
  });

  describe('Additional function coverage', () => {
    it('toggleAlbumSelection supports explicit boolean argument', () => {
      const { toggleAlbumSelection } = useSlideshow();
      mockLibraryState.albumsSelectedForSlideshow['test'] = true;
      toggleAlbumSelection('test', true);
      expect(mockLibraryState.albumsSelectedForSlideshow['test']).toBe(true);
      toggleAlbumSelection('test', false);
      expect(mockLibraryState.albumsSelectedForSlideshow['test']).toBe(false);
    });

    it('displayMedia handles API errors gracefully', async () => {
      // Import api to mock it for this specific test
      const { api } = await import('@/api');
      const { pickAndDisplayNextMediaItem } = useSlideshow();
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // We mocked api at the top level, so we can control it here.
      vi.mocked(api.recordMediaView).mockRejectedValueOnce(new Error('API fail'));

      mockLibraryState.globalMediaPoolForSelection = [{ path: 'a', name: 'a' }];
      mockUIState.mediaFilter = 'All';

      await pickAndDisplayNextMediaItem();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error recording media view:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('pauseSlideshowTimer clears existing timer', () => {
      const { pauseSlideshowTimer } = useSlideshow();
      mockPlayerState.slideshowTimerId = 123;
      mockPlayerState.isTimerRunning = true;
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      pauseSlideshowTimer();

      expect(clearIntervalSpy).toHaveBeenCalledWith(123);
      expect(mockPlayerState.slideshowTimerId).toBeNull();
      expect(mockPlayerState.isTimerRunning).toBe(false);
      clearIntervalSpy.mockRestore();
    });

    it('openAlbumInGrid sets view mode and stops slideshow', () => {
      const { openAlbumInGrid } = useSlideshow();
      const album = { id: 'a', textures: [{ path: 'p', name: 'n' }] };
      mockPlayerState.isSlideshowActive = true;

      openAlbumInGrid(album as any);

      expect(mockUIState.viewMode).toBe('grid');
      expect(mockPlayerState.isSlideshowActive).toBe(false);
      expect(mockUIState.gridMediaFiles).toHaveLength(1);
    });

    it('pickAndDisplayNextMediaItem warns if filtered pool is empty', async () => {
      const { pickAndDisplayNextMediaItem } = useSlideshow();
      mockLibraryState.globalMediaPoolForSelection = [
        { path: 'a.txt', name: 'a.txt' },
      ]; // txt not in supported
      mockUIState.mediaFilter = 'Images'; // Filter mismatch
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      await pickAndDisplayNextMediaItem();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Media pool is empty or no media matches the filter.',
      );
      consoleWarnSpy.mockRestore();
    });

    it('truncates displayedMediaFiles history', async () => {
      const { pickAndDisplayNextMediaItem } = useSlideshow();
      mockLibraryState.globalMediaPoolForSelection = [
        { path: 'a.png', name: 'a.png' },
      ];
      mockUIState.mediaFilter = 'All';

      // Fill history with 100 items
      const history = new Array(100)
        .fill(null)
        .map((_, i) => ({ path: `Item${i}`, name: `Item${i}` }));
      mockPlayerState.displayedMediaFiles = history;
      mockPlayerState.currentMediaIndex = 99;

      await pickAndDisplayNextMediaItem();

      // Should be 100 (one added, one removed)
      expect(mockPlayerState.displayedMediaFiles.length).toBe(100);
      expect(mockPlayerState.displayedMediaFiles[99].path).toBe('a.png');
    });
  });
});
