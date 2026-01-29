import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaControls from '@/components/MediaControls.vue';

// Mock ResizeObserver
const disconnectMock = vi.fn();
const observeMock = vi.fn();

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    constructor(callback: any) {
      callback([{ contentRect: { width: 1000 } }]); // Default to wide
    }
    observe = observeMock;
    disconnect = disconnectMock;
    unobserve = vi.fn();
  };
});

afterAll(() => {
  delete (global as any).ResizeObserver;
});

// Mock Icons
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<svg class="vlc-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/StarIcon.vue', () => ({
  default: { template: '<svg class="star-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/ChevronLeftIcon.vue', () => ({
  default: { template: '<svg class="chevron-left-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/ChevronRightIcon.vue', () => ({
  default: { template: '<svg class="chevron-right-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/VRIcon.vue', () => ({
  default: { template: '<svg class="vr-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/PlayIcon.vue', () => ({
  default: { template: '<svg class="play-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/PauseIcon.vue', () => ({
  default: { template: '<svg class="pause-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/ExpandIcon.vue', () => ({
  default: { template: '<svg class="expand-icon-mock"></svg>' },
}));

vi.mock('@/composables/useUIStore', () => ({
  useUIStore: () => ({
    isSidebarVisible: { value: false },
  }),
}));

describe('MediaControls.vue', () => {
  // Mock getBoundingClientRect
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 1000 }),
    });
  });

  const defaultProps = {
    currentMediaItem: { name: 'test.jpg', path: '/test.jpg', rating: 3 },
    isPlaying: false,
    canNavigate: true,
    isControlsVisible: true,
    isImage: true,
    countInfo: '1 / 10',
  };

  it('should emit previous when back button clicked', async () => {
    const wrapper = mount(MediaControls, { props: defaultProps });
    await wrapper
      .find('button[aria-label="Previous media (Z)"]')
      .trigger('click');
    expect(wrapper.emitted('previous')).toBeTruthy();
  });

  it('should emit next when forward button clicked', async () => {
    const wrapper = mount(MediaControls, { props: defaultProps });
    await wrapper.find('button[aria-label="Next media (X)"]').trigger('click');
    expect(wrapper.emitted('next')).toBeTruthy();
  });

  it('should emit toggle-play when play button clicked', async () => {
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, isImage: false },
    });
    await wrapper.find('.play-pause-button').trigger('click');
    expect(wrapper.emitted('toggle-play')).toBeTruthy();
  });

  it('should emit open-in-vlc when VLC button clicked', async () => {
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, isImage: false },
    });
    await wrapper.find('.vlc-button').trigger('click');
    expect(wrapper.emitted('open-in-vlc')).toBeTruthy();
  });

  it('should emit set-rating when star clicked', async () => {
    const wrapper = mount(MediaControls, { props: defaultProps });
    // Stars are buttons inside a div.
    const stars = wrapper
      .findAll('button')
      .filter((b) => b.attributes('aria-label')?.includes('Rate'));
    if (stars.length > 0) {
      // Ensure specific stars are clicked, but first verify we have stars
      // because ResizeObserver mock should have enabled them (width=1000)
      await stars[1].trigger('click'); // Rate 2 stars
      expect(wrapper.emitted('set-rating')).toBeTruthy();
      expect(wrapper.emitted('set-rating')?.[0]).toEqual([2]);
    } else {
      // With global mock, mount should trigger it.
      // We wait for tick to ensure ResizeObserver callback or initial set works
      await wrapper.vm.$nextTick();
      const retryStars = wrapper
        .findAll('button')
        .filter((b) => b.attributes('aria-label')?.includes('Rate'));
      if (retryStars.length > 0) {
        await retryStars[1].trigger('click');
        expect(wrapper.emitted('set-rating')).toBeTruthy();
      } else {
        throw new Error(
          'Stars not rendered - ResizeObserver mock failed to trigger?',
        );
      }
    }
  });

  it('should disable navigation if canNavigate is false', () => {
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, canNavigate: false },
    });
    const buttons = wrapper.findAll('button');
    const prev = buttons.find(
      (b) => b.attributes('aria-label') === 'No previous media',
    );
    const next = buttons.find(
      (b) => b.attributes('aria-label') === 'Next media (X)',
    );
    expect(prev?.attributes('disabled')).toBeDefined();
    expect(next?.attributes('disabled')).toBeDefined();
  });

  it('should emit toggle-fullscreen when fullscreen button clicked', async () => {
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, isImage: false },
    });
    await wrapper
      .find('button[aria-label="Toggle Fullscreen"]')
      .trigger('click');
    expect(wrapper.emitted('toggle-fullscreen')).toBeTruthy();
  });

  it('should have tooltips on navigation buttons', () => {
    const wrapper = mount(MediaControls, { props: defaultProps });
    const prevBtn = wrapper.find('button[aria-label="Previous media (Z)"]');
    const nextBtn = wrapper.find('button[aria-label="Next media (X)"]');
    expect(prevBtn.attributes('title')).toBe('Previous media (Z)');
    expect(nextBtn.attributes('title')).toBe('Next media (X)');
  });

  it('should have tooltips on play/pause button', async () => {
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, isImage: false },
    });

    // Initially paused
    const playBtn = wrapper.find('button[aria-label="Play video (Space)"]');
    expect(playBtn.attributes('title')).toBe('Play video (Space)');

    // Update to playing
    await wrapper.setProps({ isPlaying: true });
    // Use dynamic selector because aria-label changes
    const pauseBtn = wrapper.find('button[aria-label="Pause video (Space)"]');
    expect(pauseBtn.attributes('title')).toBe('Pause video (Space)');
  });

  it('should have tooltips on rating stars', async () => {
    const wrapper = mount(MediaControls, { props: defaultProps });

    // Wait for resize observer to trigger visibility
    await wrapper.vm.$nextTick();

    const stars = wrapper.findAll('button[aria-label^="Rate"]');
    if (stars.length > 0) {
      expect(stars[0].attributes('title')).toBe('Rate 1 star');
      expect(stars[1].attributes('title')).toBe('Rate 2 stars');
      expect(stars[4].attributes('title')).toBe('Rate 5 stars');
    }
  });
});
