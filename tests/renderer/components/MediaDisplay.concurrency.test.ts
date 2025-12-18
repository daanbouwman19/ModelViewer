import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '../../../src/renderer/components/MediaDisplay.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { api } from '../../../src/renderer/api';
import { useSlideshow } from '../../../src/renderer/composables/useSlideshow';

// Mock dependencies
vi.mock('../../../src/renderer/api');
vi.mock('../../../src/renderer/composables/useAppState');
vi.mock('../../../src/renderer/composables/useSlideshow');

// Mock components
vi.mock('../../../src/renderer/components/icons/VlcIcon.vue', () => ({
  default: { template: '<div data-testid="vlc-icon"></div>' },
}));
vi.mock('../../../src/renderer/components/icons/StarIcon.vue', () => ({
  default: { template: '<div data-testid="star-icon"></div>' },
}));

describe('MediaDisplay Race Condition', () => {
  const mockCurrentMediaItem = ref<any>(null);

  // Helper to control promise resolution
  let loadMediaReject: ((err: any) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMediaItem.value = null;

    // Reset promise controllers
    loadMediaReject = null;

    // Mock useAppState
    vi.mocked(useAppState).mockReturnValue({
      currentMediaItem: mockCurrentMediaItem,
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(0),
      isSlideshowActive: ref(true),
      mediaFilter: ref('All'),
      totalMediaInPool: ref(10),
      supportedExtensions: ref({
        images: ['.jpg', '.png'],
        videos: ['.mp4', '.mkv', '.avi'],
        all: ['.jpg', '.png', '.mp4', '.mkv', '.avi'],
      }),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      isTimerRunning: ref(true),
      mainVideoElement: ref(null),
    } as any);

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

  it('correctly handles race condition: loading persists for new item despite old item error', async () => {
    const wrapper = mount(MediaDisplay, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    });

    // Explicitly cast vm to any to access internal state for testing
    const vm = wrapper.vm as any;

    // 1. Start loading Item A
    mockCurrentMediaItem.value = {
      name: 'videoA.mp4',
      path: '/path/to/videoA.mp4',
      type: 'video',
    };
    await wrapper.vm.$nextTick();
    expect(vm.isLoading).toBe(true);

    // Capture resolve/reject for Item A
    const rejectItemA = loadMediaReject;

    // 2. Simulate rapid navigation to Item B
    mockCurrentMediaItem.value = {
      name: 'videoB.mp4',
      path: '/path/to/videoB.mp4',
      type: 'video',
    };
    await wrapper.vm.$nextTick();
    expect(vm.isLoading).toBe(true);

    // 3. Fail Item A
    if (rejectItemA) {
      rejectItemA(new Error('Network Error'));
    }

    await flushPromises();

    // ASSERTION:
    // With the fix:
    // - isLoading should remain TRUE (because Item B is still loading)
    // - error should be NULL (because Item A's error is ignored)

    expect(vm.isLoading).toBe(true);
    expect(vm.error).toBeNull();
    expect(wrapper.text()).toContain('Loading media...');
    expect(wrapper.text()).not.toContain('Failed to load media file.');
  });

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
    mockCurrentMediaItem.value = {
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
