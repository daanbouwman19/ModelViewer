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

  it('should have consistent width class on desktop', () => {
    const wrapper = mount(MediaDisplay);

    const controls = wrapper.find('.floating-controls');
    const classes = controls.classes();

    // Check for the new width class
    expect(classes).toContain('md:w-[600px]');
    // Should NOT contain the old auto class
    expect(classes).not.toContain('md:w-auto');
  });

  it('should have flex layout for title centering and truncation', async () => {
    // Override currentMediaItem for this specific test case to simulate a long title
    mockPlayerState.currentMediaItem = {
      name: 'Very Long Title That Should Truncate In The Middle Of The Screen Because It Is Too Long.jpg',
      path: '/test.jpg',
    };

    // Re-mount with overridden state
    const wrapper = mount(MediaDisplay);
    await wrapper.vm.$nextTick();

    const mediaInfo = wrapper.find('.media-info');
    expect(mediaInfo.classes()).toContain('flex-1');
    expect(mediaInfo.classes()).toContain('min-w-0'); // Crucial for flex child truncation
    expect(mediaInfo.classes()).toContain('px-4');

    const title = mediaInfo.find('p');
    expect(title.classes()).toContain('truncate');
    // Should NOT have the old max-w-75
    expect(title.classes()).not.toContain('max-w-75');
  });
});
