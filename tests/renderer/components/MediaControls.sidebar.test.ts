import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaControls from '@/components/MediaControls.vue';

// Mock Icons
vi.mock('@/components/icons/VlcIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/StarIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/ChevronLeftIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/ChevronRightIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/PlayIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/PauseIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/ExpandIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/VRIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));

// Mock UI Store with sidebar visible
vi.mock('@/composables/useUIStore', () => ({
  useUIStore: () => ({
    isSidebarVisible: { value: true },
  }),
}));

describe('MediaControls.vue Responsiveness', () => {
  const defaultProps = {
    currentMediaItem: { name: 'test.jpg', path: '/test.jpg', rating: 3 },
    isPlaying: false,
    canNavigate: true,
    isControlsVisible: true,
    isImage: true,
    currentTime: 10,
    duration: 100,
  };

  let disconnectMock: any;
  let observeMock: any;
  let resizeCallback: any;

  beforeAll(() => {
    // Mock ResizeObserver
    disconnectMock = vi.fn();
    observeMock = vi.fn();

    global.ResizeObserver = class ResizeObserver {
      constructor(callback: any) {
        resizeCallback = callback;
      }
      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
    };
  });

  afterAll(() => {
    delete (global as any).ResizeObserver;
  });

  const triggerResize = (width: number) => {
    if (resizeCallback) {
      resizeCallback([{ contentRect: { width } }]);
    }
  };

  it('should show stars and time when width is large (Desktop)', async () => {
    // Mock window width to be desktop size
    window.innerWidth = 1024;

    const wrapper = mount(MediaControls, {
      props: defaultProps,
      attachTo: document.body,
    });

    // Simulate wide container
    triggerResize(800);
    await wrapper.vm.$nextTick();

    const stars = wrapper.findAll('button[aria-label*="Rate"]');
    expect(stars.length).toBe(5);
    // NOTE: isImage is true in defaultProps, and time is hidden for images usually.
    // Let's check with image=false
    await wrapper.setProps({ isImage: false });

    const timeDisplayVideo = wrapper.find('.font-mono');
    expect(timeDisplayVideo.exists()).toBe(true);
    expect(timeDisplayVideo.text()).toContain('00:10 / 01:40');
  });

  it('should hide stars but keep time when width is medium', async () => {
    window.innerWidth = 1024;
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, isImage: false },
      attachTo: document.body,
    });

    // Simulate medium container (e.g. 500px - between 450 and 650)
    triggerResize(500);
    await wrapper.vm.$nextTick();

    const stars = wrapper.findAll('button[aria-label*="Rate"]');
    expect(stars.length).toBe(0); // Hidden

    // Time shows if width > threshold (450).
    expect(wrapper.find('.font-mono').exists()).toBe(true); // Visible
  });

  it('should hide stars and time when width is very small', async () => {
    window.innerWidth = 1024;
    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, isImage: false },
      attachTo: document.body,
    });

    // Simulate small container
    triggerResize(200);
    await wrapper.vm.$nextTick();

    const stars = wrapper.findAll('button[aria-label*="Rate"]');
    expect(stars.length).toBe(0);

    const timeDisplay = wrapper.find('.font-mono');
    expect(timeDisplay.exists()).toBe(false);
  });

  it('should hide everything relevant on Mobile even if width is large (e.g. rotated)', async () => {
    // Mock window width to be mobile size
    window.innerWidth = 500;
    window.dispatchEvent(new Event('resize')); // Trigger component resize listener

    const wrapper = mount(MediaControls, {
      props: { ...defaultProps, isImage: false },
      attachTo: document.body,
    });

    // Even if container reports wide width
    triggerResize(800);
    await wrapper.vm.$nextTick();

    const stars = wrapper.findAll('button[aria-label*="Rate"]');
    expect(stars.length).toBe(0); // Should remain hidden on mobile

    // Time might be hidden by CSS classes or logic, let's check.
    // In our implementation, we only forced stars to be hidden on mobile via `!isDesktop`.
    // Time shows if width > threshold (300).
    // Let's verify existing logic: "Time Display In-Pill (Desktop/Tablet)" comment suggests it might be hidden on mobile by CSS
    // The previous implementation had hidden class, our new implementation might strictly rely on width?
    // Current code: `v-if="!isImage && currentMediaItem && showTime"`
    // Wait, we removed `hidden md:block` classes?
    // Checking previous implementation: `class="... hidden sm:block"` was on separators/buttons.
    // Time display: class="text-[10px] md:text-xs ..." - it was always visible?
    // Actually, looking at previous code, time display was:
    // `v-if="!isImage && currentMediaItem"`
    // So it was visible on mobile.

    // Our new logic shows time if width > 300.
    const timeDisplay = wrapper.find('.font-mono');
    expect(timeDisplay.exists()).toBe(true);
  });
});
