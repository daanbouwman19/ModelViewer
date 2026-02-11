import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';
import { useSlideshow } from '@/composables/useSlideshow';

vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');
vi.mock('@/composables/useSlideshow');
vi.mock('@/api', () => ({
  api: {
    getVideoStreamUrlGenerator: vi
      .fn()
      .mockResolvedValue(() => 'http://localhost/stream'),
    loadFileAsDataURL: vi
      .fn()
      .mockResolvedValue({ type: 'http-url', url: 'test.mp4' }),
  },
}));

const mockLibraryStore = {
  imageExtensionsSet: { value: new Set(['.jpg']) },
  mediaDirectories: { value: [] },
  mediaUrlGenerator: { value: (p: string) => `http://localhost/media/${p}` },
};

const mockPlayerStore = {
  currentMediaItem: { value: { path: 'video.mp4', name: 'video.mp4' } },
  displayedMediaFiles: { value: [{ path: 'video.mp4', name: 'video.mp4' }] },
  currentMediaIndex: { value: 0 },
  playFullVideo: { value: false },
  pauseTimerOnPlay: { value: false },
  isTimerRunning: { value: false },
  mainVideoElement: { value: null },
};

const mockUIStore = {
  isControlsVisible: { value: true },
  isSourcesModalVisible: { value: false },
  isSidebarVisible: { value: true },
};

const mockSlideshow = {
  navigateMedia: vi.fn(),
  pauseSlideshowTimer: vi.fn(),
  resumeSlideshowTimer: vi.fn(),
  toggleSlideshowTimer: vi.fn(),
};

describe('MediaDisplay Extra Coverage', () => {
  // ... existing setup

  it('tracks watched segments', async () => {
    // Setup component with mocked refs
    const wrapper = mount(MediaDisplay, {
      global: {
        stubs: {
          TranscodingStatus: true,
          MediaControls: true,
          VideoPlayer: true,
        },
      },
    });

    // Mock MediaControls ref
    const mockControls = { watchedSegments: [] as any[] };
    (wrapper.vm as any).mediaControlsRef = mockControls;
    (wrapper.vm as any).currentMediaItem = { path: 'test.mp4' };
    (wrapper.vm as any).isPlaying = true;

    // 1. Initial time update
    (wrapper.vm as any).handleTimeUpdate(10);
    expect((wrapper.vm as any).lastTrackedTime).toBe(10);
    expect(mockControls.watchedSegments).toHaveLength(0);

    // 2. Small increment (playback)
    (wrapper.vm as any).handleTimeUpdate(14); // delta 4 < 5
    expect(mockControls.watchedSegments).toHaveLength(1);
    expect(mockControls.watchedSegments[0]).toEqual({ start: 10, end: 14 });

    // 3. Large increment (seek)
    (wrapper.vm as any).handleTimeUpdate(20); // delta 6 > 5
    // Should NOT add segment from 14 to 20
    expect(mockControls.watchedSegments).toHaveLength(1);
    expect((wrapper.vm as any).lastTrackedTime).toBe(20);

    // 4. Persistence
    await wrapper.unmount();
    // persistWatchedSegments called on unmount
    // Expect API call (need to mock api again or verify it calls api)
    // api is mocked in setup. Let's import api to verify.
  });

  beforeEach(() => {
    (useLibraryStore as Mock).mockReturnValue(mockLibraryStore);
    (usePlayerStore as Mock).mockReturnValue(mockPlayerStore);
    (useUIStore as Mock).mockReturnValue(mockUIStore);
    (useSlideshow as Mock).mockReturnValue(mockSlideshow);
  });

  it('handles keyboard shortcuts for navigation and seek', async () => {
    const wrapper = mount(MediaDisplay, {
      global: {
        stubs: {
          TranscodingStatus: true,
          MediaControls: true,
          VideoPlayer: {
            template: '<video></video>',
            expose: ['reset', 'togglePlay'],
            methods: { togglePlay: vi.fn() },
          },
          VRVideoPlayer: true,
        },
      },
    });

    // Mock video element props
    const videoEl = document.createElement('video');
    Object.defineProperty(videoEl, 'duration', { value: 100 });
    Object.defineProperty(videoEl, 'currentTime', {
      value: 50,
      writable: true,
    });
    (wrapper.vm as any).videoElement = videoEl;

    // ArrowRight (Seek Forward)
    await window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowRight' }),
    );
    expect(videoEl.currentTime).toBe(55); // 50 + 5

    // ArrowLeft (Seek Backward)
    await window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowLeft' }),
    );
    expect(videoEl.currentTime).toBe(50); // 55 - 5
  });

  it('handles error states in template', async () => {
    // Override store for this test
    (usePlayerStore as Mock).mockReturnValue({
      ...mockPlayerStore,
      currentMediaItem: { value: { path: 'bad.mp4' } },
    });

    const wrapper = mount(MediaDisplay, {
      global: {
        stubs: { TranscodingStatus: true, MediaControls: true },
      },
    });

    // Simulate error
    (wrapper.vm as any).error = 'Failed to load';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Failed to load');
  });
});
