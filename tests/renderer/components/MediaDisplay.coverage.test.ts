import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, toRefs } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock the composables
vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');
vi.mock('@/composables/useSlideshow');

// Mock Icons
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<svg class="vlc-icon-mock"></svg>' },
}));

vi.mock('@/components/icons/StarIcon.vue', () => ({
  default: { template: '<svg class="star-icon-mock"></svg>' },
}));

// Mock API
vi.mock('@/api', () => ({
  api: {
    loadFileAsDataURL: vi.fn(),
    openInVlc: vi.fn(),
    getVideoStreamUrlGenerator: vi.fn(),
    getVideoMetadata: vi.fn(),
    setRating: vi.fn(),
  },
}));

describe('MediaDisplay.vue Additional Coverage', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    mockLibraryState = reactive({
      totalMediaInPool: 0,
      supportedExtensions: { images: [], videos: ['.mp4'] },
      imageExtensionsSet: new Set([]),
      videoExtensionsSet: new Set(['.mp4']),
    });

    mockPlayerState = reactive({
      currentMediaItem: { name: 'test.mp4', path: '/test.mp4' },
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      isSlideshowActive: false,
      isTimerRunning: false,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      mainVideoElement: null,
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
    });

    (useUIStore as Mock).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
    });

    (useSlideshow as Mock).mockReturnValue({
      // Essential mocks
      navigateMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
    });

    vi.clearAllMocks();

    // Default success values
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'http://localhost/test.mp4',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      (path: string) => `stream/${path}`,
    );
    (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });
  });

  it('should handle metadata loading failure during transcoding (swallow error)', async () => {
    // Mock metadata failure
    (api.getVideoMetadata as Mock).mockRejectedValue(new Error('Meta fail'));

    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Trigger transcoding
    await (wrapper.vm as any).tryTranscoding(0);

    // It should proceed without crashing, leaving duration as 0 if it was 0
    expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    // Error is swallowed, so no error message in UI
    expect(wrapper.text()).not.toContain('Transcoding failed');
  });

  it('should handle missing video stream generator', async () => {
    // Mock generator failure during mount
    (api.getVideoStreamUrlGenerator as Mock).mockRejectedValue(
      new Error('Init fail'),
    );

    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Trigger transcoding
    await (wrapper.vm as any).tryTranscoding(0);

    // Should set error message
    expect((wrapper.vm as any).error).toBe('Local server not available');
    expect((wrapper.vm as any).isTranscodingLoading).toBe(false);
  });

  it('should handle general transcoding error', async () => {
    // Mock generator to throw when called
    const generator = vi.fn().mockImplementation(() => {
      throw new Error('Gen fail');
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(generator);

    const wrapper = mount(MediaDisplay);
    await flushPromises();

    // Trigger transcoding
    // We mock console.error to avoid noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await (wrapper.vm as any).tryTranscoding(0);

    expect((wrapper.vm as any).isTranscodingMode).toBe(false); // Should revert or stay false?
    // Code says: isTranscodingMode = true; try { ... } catch { isTranscodingMode = false; }
    expect((wrapper.vm as any).isTranscodingMode).toBe(false);
    expect(spy).toHaveBeenCalledWith('Transcoding failed', expect.any(Error));
    spy.mockRestore();
  });
});
