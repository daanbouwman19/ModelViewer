import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaControls from '@/components/MediaControls.vue';

// Minimal mocks needed for this test
vi.mock('@/api', () => ({
  api: {
    getHeatmapProgress: vi.fn(),
    getHeatmap: vi.fn(),
    getMetadata: vi.fn(),
  },
}));

vi.mock('@/composables/useUIStore', () => ({
  useUIStore: () => ({
    isSidebarVisible: { value: false },
  }),
}));

// Mock ResizeObserver
const disconnectMock = vi.fn();
const observeMock = vi.fn();

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    constructor(callback: any) {
      // Simulate sufficient width to show time
      callback([{ contentRect: { width: 1000 } }]);
    }
    observe = observeMock;
    disconnect = disconnectMock;
    unobserve = vi.fn();
  };
});

afterAll(() => {
  delete (global as any).ResizeObserver;
});

// Mock Icons to avoid warnings
const mockIcon = vi.hoisted(() => ({ default: { template: '<svg></svg>' } }));
vi.mock('@/components/icons/VlcIcon.vue', () => mockIcon);
vi.mock('@/components/icons/StarIcon.vue', () => mockIcon);
vi.mock('@/components/icons/ChevronLeftIcon.vue', () => mockIcon);
vi.mock('@/components/icons/ChevronRightIcon.vue', () => mockIcon);
vi.mock('@/components/icons/VRIcon.vue', () => mockIcon);
vi.mock('@/components/icons/PlayIcon.vue', () => mockIcon);
vi.mock('@/components/icons/PauseIcon.vue', () => mockIcon);
vi.mock('@/components/icons/ExpandIcon.vue', () => mockIcon);
vi.mock('@/components/icons/VolumeUpIcon.vue', () => mockIcon);
vi.mock('@/components/icons/VolumeOffIcon.vue', () => mockIcon);
vi.mock('@/components/icons/SpinnerIcon.vue', () => mockIcon);
vi.mock('@/components/ProgressBar.vue', () => ({
  default: { template: '<div></div>' },
}));

describe('MediaControls Time Display', () => {
  // Mock getBoundingClientRect
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 1000 }),
    });
  });

  const defaultProps = {
    currentMediaItem: { name: 'test.mp4', path: '/test.mp4', rating: 0 },
    isPlaying: false,
    canNavigate: true,
    isControlsVisible: true,
    isImage: false,
    currentTime: 10,
    duration: 70, // 1:10
  };

  it('should toggle between total and remaining time', async () => {
    const wrapper = mount(MediaControls, { props: defaultProps });

    // Allow component to mount and update width
    await wrapper.vm.$nextTick();

    // Find the time display
    const timeDisplay = wrapper.find('[data-testid="time-display"]');

    expect(timeDisplay.exists()).toBe(true);
    expect(timeDisplay.text()).toBe('00:10 / 01:10');
    expect(timeDisplay.attributes('title')).toBe('Show remaining time');

    // Click to toggle
    await timeDisplay.trigger('click');
    expect(timeDisplay.text()).toBe('00:10 / -01:00'); // 70 - 10 = 60s = 1:00
    expect(timeDisplay.attributes('title')).toBe('Show total duration');

    // Click again to toggle back
    await timeDisplay.trigger('click');
    expect(timeDisplay.text()).toBe('00:10 / 01:10');
  });
});
