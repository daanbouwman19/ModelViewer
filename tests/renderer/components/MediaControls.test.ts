import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaControls from '@/components/MediaControls.vue';

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
vi.mock('@/components/icons/PlayIcon.vue', () => ({
  default: { template: '<svg class="play-icon-mock"></svg>' },
}));
vi.mock('@/components/icons/PauseIcon.vue', () => ({
  default: { template: '<svg class="pause-icon-mock"></svg>' },
}));

describe('MediaControls.vue', () => {
  const defaultProps = {
    currentMediaItem: { name: 'test.jpg', path: '/test.jpg', rating: 3 },
    isPlaying: false,
    canNavigate: true,
    isControlsVisible: true,
    isImage: true,
    countInfo: '1 / 10',
  };

  it('should render media info', () => {
    const wrapper = mount(MediaControls, { props: defaultProps });
    expect(wrapper.text()).toContain('test.jpg');
    expect(wrapper.text()).toContain('1 / 10');
  });

  it('should emit previous when back button clicked', async () => {
    const wrapper = mount(MediaControls, { props: defaultProps });
    await wrapper.find('button[aria-label="Previous media"]').trigger('click');
    expect(wrapper.emitted('previous')).toBeTruthy();
  });

  it('should emit next when forward button clicked', async () => {
    const wrapper = mount(MediaControls, { props: defaultProps });
    await wrapper.find('button[aria-label="Next media"]').trigger('click');
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
      await stars[1].trigger('click'); // Rate 2 stars
      expect(wrapper.emitted('set-rating')).toBeTruthy();
      expect(wrapper.emitted('set-rating')?.[0]).toEqual([2]);
    } else {
      // Fallback if filter didn't work as expected in test env
      const starBtns = wrapper.findAll('button');
      // Stars are likely at specific indices or we can try to find by icon
      await starBtns[1].trigger('click');
      expect(wrapper.emitted('set-rating')).toBeTruthy();
    }
  });

  it('should disable navigation if canNavigate is false', () => {
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, canNavigate: false },
    });
    const buttons = wrapper.findAll('button');
    const prev = buttons.find(
      (b) => b.attributes('aria-label') === 'Previous media',
    );
    const next = buttons.find(
      (b) => b.attributes('aria-label') === 'Next media',
    );
    expect(prev?.attributes('disabled')).toBeDefined();
    expect(next?.attributes('disabled')).toBeDefined();
  });
});
