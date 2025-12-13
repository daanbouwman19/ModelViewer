import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { useSlideshow } from '@/composables/useSlideshow';
import { useAppState } from '@/composables/useAppState';
import { createMockElectronAPI } from '../mocks/electronAPI';

// Mock the entire useAppState module
vi.mock('@/composables/useAppState.js', () => ({
  useAppState: vi.fn(),
}));

// Mock the api module
vi.mock('@/api', () => ({
  api: {
    recordMediaView: vi.fn(),
  },
}));

// Mock the global window.electronAPI
global.window.electronAPI = createMockElectronAPI();

describe('useSlideshow', () => {
  let mockState: any;
  let mockStopSlideshow: Mock;

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
      albumsSelectedForSlideshow: {},
      allAlbums: [],
      totalMediaInPool: 0,
    };

    mockStopSlideshow = vi.fn();

    // Setup the mock implementation for useAppState
    (useAppState as Mock).mockReturnValue({
      state: mockState,
      stopSlideshow: mockStopSlideshow,
    });
  });

  describe('shuffleArray', () => {
    it('should contain the same elements after shuffling', () => {
      const { shuffleArray } = useSlideshow();
      const originalArray = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(originalArray);

      expect(shuffled).toHaveLength(originalArray.length);
      expect(shuffled.sort()).toEqual(originalArray.sort());
    });

    it('should produce a different order (most of the time)', () => {
      const { shuffleArray } = useSlideshow();
      const originalArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = shuffleArray(originalArray);

      // This is not a guaranteed test, but it's very likely to pass
      expect(shuffled).not.toEqual(originalArray);
    });

    it('should handle empty and single-element arrays', () => {
      const { shuffleArray } = useSlideshow();
      expect(shuffleArray([])).toEqual([]);
      expect(shuffleArray([1])).toEqual([1]);
    });
  });

  describe('filterMedia', () => {
    const mediaFiles = [
      {
        path: 'video.mp4',
        name: 'video.mp4',
      },
      {
        path: 'image.png',
        name: 'image.png',
      },
      {
        path: 'document.txt',
        name: 'document.txt',
      },
      {
        path: 'archive.zip',
        name: 'archive.zip',
      },
      {
        path: 'photo.JPG',
        name: 'photo.JPG',
      },
      {
        path: 'clip.WEBM',
        name: 'clip.WEBM',
      },
      { name: 'invalid', path: '' }, // Invalid item
      {
        path: '',
        name: 'invalid',
      }, // Invalid item
    ];

    it('should return all media when filter is "All"', () => {
      mockState.mediaFilter = 'All';
      const { filterMedia } = useSlideshow(); // Need to get a fresh instance

      const filtered = filterMedia(mediaFiles);
      expect(filtered.length).toBe(6); // 6 valid items
    });

    it('should return only videos when filter is "Videos"', () => {
      mockState.mediaFilter = 'Videos';
      const { filterMedia } = useSlideshow();

      const filtered = filterMedia(mediaFiles);
      expect(filtered.length).toBe(2);
      expect(
        filtered.every(
          (f) =>
            f.path.toLowerCase().endsWith('.mp4') ||
            f.path.toLowerCase().endsWith('.webm'),
        ),
      ).toBe(true);
    });

    it('should return only images when filter is "Images"', () => {
      mockState.mediaFilter = 'Images';
      const { filterMedia } = useSlideshow();

      const filtered = filterMedia(mediaFiles);
      expect(filtered.length).toBe(2);
      expect(
        filtered.every(
          (f) =>
            f.path.toLowerCase().endsWith('.png') ||
            f.path.toLowerCase().endsWith('.jpg'),
        ),
      ).toBe(true);
    });

    it('should handle empty or invalid input', () => {
      const { filterMedia } = useSlideshow();
      expect(filterMedia([])).toEqual([]);

      expect(filterMedia(null as any)).toEqual([]);

      expect(filterMedia(undefined as any)).toEqual([]);
    });

    it('should be case-insensitive to file extensions', () => {
      mockState.mediaFilter = 'Images';
      const { filterMedia } = useSlideshow();
      const filesWithCaps = [
        {
          path: 'image.PNG',
          name: 'image.PNG',
        },
        {
          path: 'photo.JPEG',
          name: 'photo.JPEG',
        },
      ];
      const filtered = filterMedia(filesWithCaps);
      expect(filtered.length).toBe(2);
    });

    it('should return all media if filter is not "Videos" or "Images"', () => {
      mockState.mediaFilter = 'SomethingElse';
      const { filterMedia } = useSlideshow();
      const filtered = filterMedia(mediaFiles);
      expect(filtered.length).toBe(6);
    });
  });

  describe('selectWeightedRandom', () => {
    it('should prioritize items with lower view counts', () => {
      const items = [
        {
          path: 'a',
          name: 'a',
          viewCount: 100,
        }, // Low weight
        {
          path: 'b',
          name: 'b',
          viewCount: 0,
        }, // High weight
        {
          path: 'c',
          name: 'c',
          viewCount: 1,
        }, // Medium-high weight
      ];

      const { selectWeightedRandom } = useSlideshow();
      const selections: Record<string, number> = {
        a: 0,
        b: 0,
        c: 0,
      };

      for (let i = 0; i < 100; i++) {
        const selected = selectWeightedRandom(items);
        selections[selected!.path] = (selections[selected!.path] || 0) + 1;
      }

      expect(selections['b']).toBeGreaterThan(selections['c']);
      expect(selections['c']).toBeGreaterThan(selections['a']);
    });

    it('should exclude items from the excludePaths', () => {
      const items = [
        {
          path: 'a',
          name: 'a',
        },
        {
          path: 'b',
          name: 'b',
        },
        {
          path: 'c',
          name: 'c',
        },
      ];
      const excludePaths = ['a', 'c'];
      const { selectWeightedRandom } = useSlideshow();
      const selected = selectWeightedRandom(items, excludePaths);
      expect(selected!.path).toBe('b');
    });

    it('should return an item from the original pool if all are excluded', () => {
      const items = [
        {
          path: 'a',
          name: 'a',
        },
        {
          path: 'b',
          name: 'b',
        },
      ];
      const excludePaths = ['a', 'b'];
      const { selectWeightedRandom } = useSlideshow();
      const selected = selectWeightedRandom(items, excludePaths);
      expect(items.map((i) => i.path)).toContain(selected!.path);
    });

    it('should return null for empty or invalid input', () => {
      const { selectWeightedRandom } = useSlideshow();
      expect(selectWeightedRandom([])).toBeNull();

      expect(selectWeightedRandom(null as any)).toBeNull();
    });

    it('should perform uniform random selection when items have no view counts', () => {
      const items = [
        {
          path: 'a',
          name: 'a',
        },
        {
          path: 'b',
          name: 'b',
        },
      ];
      const { selectWeightedRandom } = useSlideshow();
      const randomSpy = vi.spyOn(global.Math, 'random').mockReturnValue(0.6);
      const selected = selectWeightedRandom(items);
      expect(selected!.path).toBe('b');
      randomSpy.mockRestore();
    });
  });

  describe('navigateMedia', () => {
    beforeEach(() => {
      mockState.isSlideshowActive = true;
      mockState.displayedMediaFiles = [
        {
          path: 'item1',
          name: 'item1',
        },
        {
          path: 'item2',
          name: 'item2',
        },
        {
          path: 'item3',
          name: 'item3',
        },
      ];
      mockState.currentMediaIndex = 1; // Start in the middle
    });

    it('should navigate backward in history', async () => {
      const { navigateMedia } = useSlideshow();
      await navigateMedia(-1);
      expect(mockState.currentMediaIndex).toBe(0);
      expect(mockState.currentMediaItem.path).toBe('item1');
    });

    it('should not navigate backward past the beginning', async () => {
      mockState.currentMediaIndex = 0;
      const { navigateMedia } = useSlideshow();
      await navigateMedia(-1);
      expect(mockState.currentMediaIndex).toBe(0); // Stays at 0
    });

    it('should navigate forward in history', async () => {
      const { navigateMedia } = useSlideshow();
      await navigateMedia(1);
      expect(mockState.currentMediaIndex).toBe(2);
      expect(mockState.currentMediaItem.path).toBe('item3');
    });

    it('should pick a new item when navigating forward at the end of history', async () => {
      mockState.currentMediaIndex = 2; // At the end
      mockState.globalMediaPoolForSelection = [
        {
          path: 'newItem',
          name: 'newItem',
        },
      ];
      const { navigateMedia } = useSlideshow();
      await navigateMedia(1);
      expect(mockState.displayedMediaFiles.length).toBe(4);
      expect(mockState.currentMediaIndex).toBe(3);
      expect(mockState.currentMediaItem.path).toBe('newItem');
    });
  });

  describe('pickAndDisplayNextMediaItem', () => {
    it('should pick a new item and add it to the history', async () => {
      mockState.globalMediaPoolForSelection = [
        {
          path: 'a',
          name: 'a',
        },
        {
          path: 'b',
          name: 'b',
        },
      ];
      const { pickAndDisplayNextMediaItem } = useSlideshow();
      await pickAndDisplayNextMediaItem();
      expect(mockState.displayedMediaFiles.length).toBe(1);
      expect(mockState.currentMediaIndex).toBe(0);
      expect(mockState.currentMediaItem).toBeDefined();
    });

    it('should warn and do nothing if the pool is empty', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const { pickAndDisplayNextMediaItem } = useSlideshow();
      await pickAndDisplayNextMediaItem();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No media files available in the pool.',
      );
      expect(mockState.displayedMediaFiles.length).toBe(0);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('startSlideshow', () => {
    beforeEach(() => {
      mockState.allAlbums = [
        {
          name: 'albumA',
          textures: [
            {
              path: 'a1.png',
              name: 'a1.png',
            },
            {
              path: 'a2.png',
              name: 'a2.png',
            },
          ],
          children: [
            {
              name: 'albumA_child',
              textures: [
                {
                  path: 'a_child1.png',
                  name: 'a_child1.png',
                },
              ],
            },
          ],
        },
        {
          name: 'albumB',
          textures: [
            {
              path: 'b1.png',
              name: 'b1.png',
            },
          ],
          children: [],
        },
        {
          name: 'albumC',
          textures: [],
        }, // Empty album
      ];
    });

    it('should build a media pool from selected albums including children', async () => {
      mockState.albumsSelectedForSlideshow = {
        albumA: true,
        albumC: true,
        albumA_child: true,
      };
      const { startSlideshow } = useSlideshow();
      await startSlideshow();
      expect(mockState.globalMediaPoolForSelection.length).toBe(3);
      expect(
        mockState.globalMediaPoolForSelection.map(
          (f: { path: string }) => f.path,
        ),
      ).toEqual(['a1.png', 'a2.png', 'a_child1.png']);
    });

    it('should activate slideshow mode and display the first item', async () => {
      mockState.albumsSelectedForSlideshow = {
        albumB: true,
      };
      const { startSlideshow } = useSlideshow();
      await startSlideshow();
      expect(mockState.isSlideshowActive).toBe(true);
      expect(mockState.displayedMediaFiles.length).toBe(1);
      expect(mockState.currentMediaItem.path).toBe('b1.png');
    });

    it('should handle null allAlbums gracefully', async () => {
      mockState.allAlbums = null;
      mockState.albumsSelectedForSlideshow = {
        albumA: true,
      };
      const { startSlideshow } = useSlideshow();
      await startSlideshow();
      expect(mockState.isSlideshowActive).toBe(false);
      expect(mockState.globalMediaPoolForSelection.length).toBe(0);
    });

    it('should handle when no albums are selected', async () => {
      mockState.albumsSelectedForSlideshow = {}; // No albums selected
      const { startSlideshow } = useSlideshow();
      await startSlideshow();
      expect(mockState.isSlideshowActive).toBe(false);
      expect(mockState.globalMediaPoolForSelection.length).toBe(0);
    });

    it('should collect textures from selected children even if parent is unselected', async () => {
      mockState.allAlbums = [
        {
          name: 'Parent',
          textures: [{ path: 'parent.png', name: 'parent.png' }],
          children: [
            {
              name: 'Child',
              textures: [{ path: 'child.png', name: 'child.png' }],
              children: [],
            },
          ],
        },
      ];

      // Select ONLY the child
      mockState.albumsSelectedForSlideshow = {
        Parent: false,
        Child: true,
      };

      const { startSlideshow } = useSlideshow();
      await startSlideshow();

      const paths = mockState.globalMediaPoolForSelection.map(
        (f: any) => f.path,
      );
      expect(paths).toContain('child.png');
      expect(paths).not.toContain('parent.png');
    });
  });

  describe('reapplyFilter', () => {
    beforeEach(() => {
      mockState.isSlideshowActive = true;
      mockState.allAlbums = [
        {
          name: 'albumA',
          textures: [
            {
              path: 'a.mp4',
              name: 'a.mp4',
            },
            {
              path: 'a.png',
              name: 'a.png',
            },
          ],
        },
      ];
      mockState.albumsSelectedForSlideshow = {
        albumA: true,
      };
    });

    it('should rebuild the pool and pick a new item based on the new filter', async () => {
      const { reapplyFilter } = useSlideshow();

      // First, start with "All"
      mockState.mediaFilter = 'All';
      await reapplyFilter();
      expect(mockState.totalMediaInPool).toBe(2);

      // Now, change to "Images"
      mockState.mediaFilter = 'Images';
      await reapplyFilter();

      expect(mockState.totalMediaInPool).toBe(1);
      expect(mockState.currentMediaItem.path).toBe('a.png');
    });
  });

  describe('toggleSlideshowTimer', () => {
    it('should start the timer if not running', () => {
      const { toggleSlideshowTimer } = useSlideshow();
      toggleSlideshowTimer();
      expect(mockState.slideshowTimerId).not.toBeNull();
      expect(mockState.isTimerRunning).toBe(true);
    });

    it('should pause the timer if running', () => {
      mockState.isTimerRunning = true;
      const { toggleSlideshowTimer } = useSlideshow();
      toggleSlideshowTimer();
      expect(mockState.isTimerRunning).toBe(false);
    });
  });

  describe('pauseSlideshowTimer', () => {
    it('should clear the timer and set isTimerRunning to false', () => {
      mockState.slideshowTimerId = 123;
      mockState.isTimerRunning = true;
      const { pauseSlideshowTimer } = useSlideshow();
      pauseSlideshowTimer();
      expect(mockState.slideshowTimerId).toBeNull();
      expect(mockState.isTimerRunning).toBe(false);
    });
  });

  describe('resumeSlideshowTimer with progress', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set timerProgress to 100 and start the timer', () => {
      const { resumeSlideshowTimer } = useSlideshow();
      resumeSlideshowTimer();
      expect(mockState.isTimerRunning).toBe(true);
      expect(mockState.timerProgress).toBe(100);
      expect(mockState.slideshowTimerId).not.toBeNull();
    });

    it('should decrease timerProgress over time', () => {
      mockState.timerDuration = 1; // 1 second for easier testing
      const { resumeSlideshowTimer } = useSlideshow();
      resumeSlideshowTimer();

      // Advance time by half the duration
      vi.advanceTimersByTime(500);
      expect(mockState.timerProgress).toBeLessThan(51);
      expect(mockState.timerProgress).toBeGreaterThan(49);

      // Advance time to the end
      vi.advanceTimersByTime(500);
      expect(mockState.timerProgress).toBe(0);
    });

    it('should call navigateMedia when the timer completes', () => {
      mockState.timerDuration = 1;
      mockState.isSlideshowActive = true;
      mockState.globalMediaPoolForSelection = [
        { path: 'next.jpg', name: 'next.jpg' },
      ];
      const { resumeSlideshowTimer } = useSlideshow();

      resumeSlideshowTimer();
      expect(mockState.currentMediaItem).toBeNull();

      // Advance time just past the end
      vi.advanceTimersByTime(1050);

      expect(mockState.currentMediaItem.path).toBe('next.jpg');
    });
  });

  describe('resumeSlideshowTimer', () => {
    it('should start the timer and set isTimerRunning to true', () => {
      const { resumeSlideshowTimer } = useSlideshow();
      resumeSlideshowTimer();
      expect(mockState.slideshowTimerId).not.toBeNull();
      expect(mockState.isTimerRunning).toBe(true);
    });
  });

  describe('toggleAlbumSelection', () => {
    it('should toggle the selection state of an album', () => {
      const { toggleAlbumSelection } = useSlideshow();

      // Initially undefined, should become true
      toggleAlbumSelection('albumA');
      expect(mockState.albumsSelectedForSlideshow['albumA']).toBe(true);

      // Toggle to false
      toggleAlbumSelection('albumA');
      expect(mockState.albumsSelectedForSlideshow['albumA']).toBe(false);

      // Toggle back to true
      toggleAlbumSelection('albumA');
      expect(mockState.albumsSelectedForSlideshow['albumA']).toBe(true);
    });
  });

  describe('startIndividualAlbumSlideshow', () => {
    it('should start a slideshow with the media from a single album', async () => {
      const album = {
        name: 'singleAlbum',
        textures: [
          {
            path: 's1.png',
            name: 's1.png',
          },
          {
            path: 's2.png',
            name: 's2.png',
          },
        ],
      };
      const { startIndividualAlbumSlideshow } = useSlideshow();

      await startIndividualAlbumSlideshow(album as any);

      expect(mockState.isSlideshowActive).toBe(true);
      expect(mockState.globalMediaPoolForSelection.length).toBe(2);
      expect(mockState.displayedMediaFiles.length).toBe(1);
      expect(['s1.png', 's2.png']).toContain(mockState.currentMediaItem.path);
    });

    it('should do nothing if the album has no textures', async () => {
      const album = {
        name: 'emptyAlbum',
        textures: [],
      };
      const { startIndividualAlbumSlideshow } = useSlideshow();
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      await startIndividualAlbumSlideshow(album as any);

      expect(mockState.isSlideshowActive).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No media files in this album.',
      );
      consoleWarnSpy.mockRestore();
    });

    it('should handle invalid album input gracefully', async () => {
      const { startIndividualAlbumSlideshow } = useSlideshow();
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      await startIndividualAlbumSlideshow({
        name: 'badAlbum',

        textures: null as any,
      } as any);

      expect(mockState.isSlideshowActive).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Album has no valid textures array.',
      );
      consoleWarnSpy.mockRestore();
    });
  });
});
