import { describe, it, expect, vi, type Mock, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';
import { api } from '@/api';

// Mock the composables
vi.mock('@/composables/useAppState');
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
  beforeEach(() => {
    // Default App State
    (useAppState as Mock).mockReturnValue({
      currentMediaItem: ref({ name: 'test.jpg', path: '/test.jpg' }),
      displayedMediaFiles: ref([{ name: 'test.jpg', path: '/test.jpg' }]),
      currentMediaIndex: ref(0),
      isSlideshowActive: ref(false),
      mediaFilter: ref('All'),
      totalMediaInPool: ref(1),
      imageExtensionsSet: ref(new Set(['.jpg'])),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      isTimerRunning: ref(false),
      mainVideoElement: ref(null),
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

  it('should have flex layout for title centering and truncation', () => {
    // Override currentMediaItem for this specific test case to simulate a long title
    (useAppState as Mock).mockReturnValue({
      currentMediaItem: ref({
        name: 'Very Long Title That Should Truncate In The Middle Of The Screen Because It Is Too Long.jpg',
        path: '/test.jpg',
      }),
      displayedMediaFiles: ref([{ name: 'test.jpg', path: '/test.jpg' }]),
      currentMediaIndex: ref(0),
      isSlideshowActive: ref(false),
      mediaFilter: ref('All'),
      totalMediaInPool: ref(1),
      imageExtensionsSet: ref(new Set(['.jpg'])),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      isTimerRunning: ref(false),
      mainVideoElement: ref(null),
    });

    // Re-mount with overridden state
    const wrapper = mount(MediaDisplay);

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
