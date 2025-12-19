import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock the composables
vi.mock('@/composables/useAppState');
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
  let mockRefs: any;

  beforeEach(() => {
    mockRefs = {
      mediaFilter: ref('All'),
      currentMediaItem: ref({ name: 'test.mp4', path: '/test.mp4' }),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(0),
      isSlideshowActive: ref(false),
      isTimerRunning: ref(false),
      supportedExtensions: ref({ images: [], videos: ['.mp4'] }),
      imageExtensionsSet: ref(new Set([])),
      videoExtensionsSet: ref(new Set(['.mp4'])),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      mainVideoElement: ref(null),
      // Add other refs if needed to prevent errors
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      globalMediaPoolForSelection: ref([]),
      totalMediaInPool: ref(0),
      slideshowTimerId: ref(null),
      isSourcesModalVisible: ref(false),
      mediaDirectories: ref([]),
    };

    (useAppState as Mock).mockReturnValue(mockRefs);
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
