import { describe, it, expect, vi, type Mock, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
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

// Mock child components
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

describe('MediaDisplay.vue Layout', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;

  beforeEach(() => {
    mockLibraryState = reactive({
      totalMediaInPool: 1,
      imageExtensionsSet: new Set(['.jpg']),
      mediaUrlGenerator: (path: string) => `http://localhost/media/${path}`,
    });

    mockPlayerState = reactive({
      currentMediaItem: { name: 'test.jpg', path: '/test.jpg' },
      displayedMediaFiles: [{ name: 'test.jpg', path: '/test.jpg' }],
      currentMediaIndex: 0,
      isSlideshowActive: false,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      isTimerRunning: false,
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

    // Default Slideshow State
    (useSlideshow as Mock).mockReturnValue({
      navigateMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      filterMedia: vi.fn(),
    });

    // Default API Success
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(() => 'url');
    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'http-url',
      url: 'test.jpg',
    });
  });

  it('should have correct layout classes on desktop', () => {
    const wrapper = mount(MediaDisplay);

    const controls = wrapper.find('.controls-bar');
    const classes = controls.classes();

    expect(classes).toContain('w-full');
    expect(classes).toContain('bg-linear-to-t');
    expect(classes).toContain('from-black/90');
  });
});
