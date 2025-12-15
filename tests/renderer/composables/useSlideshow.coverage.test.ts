import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { reactive, computed } from 'vue';
import { useSlideshow } from '@/composables/useSlideshow';
import { useAppState } from '@/composables/useAppState';
import { createMockElectronAPI } from '../mocks/electronAPI';

// Mock the entire useAppState module
vi.mock('@/composables/useAppState.js', () => ({
  useAppState: vi.fn(),
}));

// Mock the global window.electronAPI
global.window.electronAPI = createMockElectronAPI();

describe('useSlideshow additional coverage', () => {
  let mockState: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Provide a fresh mock state for each test
    mockState = reactive({
      mediaFilter: 'All',
      supportedExtensions: {
        videos: ['.mp4', '.webm'],
        images: ['.png', '.jpg', '.jpeg'],
      },
      globalMediaPoolForSelection: [],
      displayedMediaFiles: [],
      currentMediaIndex: -1,
      currentMediaItem: null,
      isSlideshowActive: false,
      slideshowTimerId: null,
      isTimerRunning: false,
      timerDuration: 30,
      albumsSelectedForSlideshow: {},
      allAlbums: [],
      totalMediaInPool: 0,
    });

    // Setup the mock implementation for useAppState
    (useAppState as Mock).mockReturnValue({
      state: mockState,
      stopSlideshow: vi.fn(),
      imageExtensionsSet: computed(
        () => new Set(mockState.supportedExtensions.images),
      ),
      videoExtensionsSet: computed(
        () => new Set(mockState.supportedExtensions.videos),
      ),
    });
  });

  describe('selectWeightedRandom', () => {
    it('should use uniform random selection if total weight is near zero', () => {
      const items = [
        { path: 'a', name: 'a', viewCount: 1e9 }, // Very high view count, near-zero weight
        { path: 'b', name: 'b', viewCount: 1e9 },
      ];
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
});
