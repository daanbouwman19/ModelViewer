import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, toRefs } from 'vue';
import MediaDisplay from '../../../src/renderer/components/MediaDisplay.vue';
import { useLibraryStore } from '../../../src/renderer/composables/useLibraryStore';
import { usePlayerStore } from '../../../src/renderer/composables/usePlayerStore';
import { useUIStore } from '../../../src/renderer/composables/useUIStore';
import { api } from '../../../src/renderer/api';
import { useSlideshow } from '../../../src/renderer/composables/useSlideshow';

// Mock dependencies
vi.mock('../../../src/renderer/api');
vi.mock('../../../src/renderer/composables/useLibraryStore');
vi.mock('../../../src/renderer/composables/usePlayerStore');
vi.mock('../../../src/renderer/composables/useUIStore');
vi.mock('../../../src/renderer/composables/useSlideshow');

// Mock components
vi.mock('../../../src/renderer/components/icons/VlcIcon.vue', () => ({
  default: { template: '<div data-testid="vlc-icon"></div>' },
}));
vi.mock('../../../src/renderer/components/icons/StarIcon.vue', () => ({
  default: { template: '<div data-testid="star-icon"></div>' },
}));

describe('MediaDisplay Race Condition', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  // Helper to control promise resolution
  let loadMediaReject: ((err: any) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset promise controllers
    loadMediaReject = null;

    mockLibraryState = reactive({
      mediaDirectories: [{ path: '/test' }], // Not empty to avoid Welcome screen
      totalMediaInPool: 10,
      supportedExtensions: {
        images: ['.jpg', '.png'],
        videos: ['.mp4', '.mkv', '.avi'],
        all: ['.jpg', '.png', '.mp4', '.mkv', '.avi'],
      },
      imageExtensionsSet: new Set(['.jpg', '.png']),
      videoExtensionsSet: new Set(['.mp4', '.mkv', '.avi']),
    });

    mockPlayerState = reactive({
      currentMediaItem: null,
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      isSlideshowActive: true,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      isTimerRunning: true,
      mainVideoElement: null,
    });

    mockUIState = reactive({
      mediaFilter: 'All',
      isSidebarVisible: true,
      isControlsVisible: true,
      isSourcesModalVisible: false,
    });

    (useLibraryStore as Mock).mockReturnValue({
      state: mockLibraryState,
      ...toRefs(mockLibraryState),
    });

    (usePlayerStore as Mock).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
    });

    (useUIStore as Mock).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
    });

    // Mock useSlideshow
    vi.mocked(useSlideshow).mockReturnValue({
      navigateMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
    } as any);

    // Mock API
    vi.mocked(api.getVideoStreamUrlGenerator).mockResolvedValue(
      (path: string) => `http://localhost/stream/${encodeURIComponent(path)}`,
    );

    // Mock loadFileAsDataURL to be controllable
    vi.mocked(api.loadFileAsDataURL).mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        // We only care about controlling rejection in this test suite
        loadMediaReject = reject;
      });
    });

    // Ensure mediaUrlGenerator is available
    mockLibraryState.mediaUrlGenerator = (path: string) =>
      `http://localhost/media/${path}`;

    // Mock getVideoMetadata to be controllable
    vi.mocked(api.getVideoMetadata).mockImplementation(() => {
      return new Promise((resolve) => {
        resolve({ duration: 100 });
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test removed: With synchronous mediaUrlGenerator, race conditions in URL resolution are impossible.
  // The original test simulated a slow/failing loadFileAsDataURL which is no longer used.

  it('correctly handles overlapping states: Transcoding text replaces Loading text', async () => {
    const wrapper = mount(MediaDisplay, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });

    // Explicitly cast vm to any to access internal state for testing
    const vm = wrapper.vm as any;

    // 1. Start loading a Legacy Video (forces transcoding)
    mockPlayerState.currentMediaItem = {
      name: 'legacy.mkv',
      path: '/path/to/legacy.mkv',
      type: 'video',
    };
    await wrapper.vm.$nextTick();

    // Wait for transcoding logic to kick in
    await flushPromises();

    // Check flags
    // isLoading becomes false after handoff to transcoding
    // isTranscodingLoading is true (from tryTranscoding)
    expect(vm.isLoading).toBe(false);
    expect(vm.isTranscodingLoading).toBe(true);

    // UI ASSERTION:
    // - Should show "Transcoding..."
    // - Should NOT show "Loading media..." separately/overlapping
    // - Should NOT show error
    const text = wrapper.text();
    expect(text).toContain('Transcoding...');
    expect(text).not.toContain('Loading media...');
  });
});
