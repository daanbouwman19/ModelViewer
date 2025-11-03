import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSlideshow } from '@/composables/useSlideshow.js';
import { useAppState } from '@/composables/useAppState.js';

// Mock the entire useAppState module
vi.mock('@/composables/useAppState.js', () => ({
  useAppState: vi.fn(),
}));

// Mock the global window.electronAPI
global.window = {
  electronAPI: {
    recordMediaView: vi.fn().mockResolvedValue(),
  },
};

describe('useSlideshow additional coverage', () => {
  let mockState;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Provide a fresh mock state for each test
    mockState = {
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
      modelsSelectedForSlideshow: {},
      allModels: [],
      totalMediaInPool: 0,
    };

    // Setup the mock implementation for useAppState
    useAppState.mockReturnValue({
      state: mockState,
      stopSlideshow: vi.fn(),
    });
  });

  describe('selectWeightedRandom', () => {
    it('should use uniform random selection if total weight is near zero', () => {
      const items = [
        { path: 'a', viewCount: 1e9 }, // Very high view count, near-zero weight
        { path: 'b', viewCount: 1e9 },
      ];
      const { selectWeightedRandom } = useSlideshow();

      const mathRandomSpy = vi
        .spyOn(global.Math, 'random')
        .mockReturnValue(0.6);

      const selected = selectWeightedRandom(items);
      expect(selected.path).toBe('b');

      mathRandomSpy.mockRestore();
    });

    it('should not return null if no eligible items and total weight is near zero', () => {
      const items = [{ path: 'a', viewCount: 1e9 }];
      const { selectWeightedRandom } = useSlideshow();
      const selected = selectWeightedRandom(items, ['a']);
      expect(selected).not.toBeNull();
    });
  });

  describe('pickAndDisplayNextMediaItem', () => {
    it('should use fallback if weighted selection fails', async () => {
      mockState.globalMediaPoolForSelection = [{ path: 'a' }];
      const { pickAndDisplayNextMediaItem } = useSlideshow();

      // This will cause selectWeightedRandom to return null
      const mathRandomSpy = vi.spyOn(global.Math, 'random').mockReturnValue(1);

      await pickAndDisplayNextMediaItem();

      expect(mockState.currentMediaItem.path).toBe('a');

      mathRandomSpy.mockRestore();
    });
  });
});
