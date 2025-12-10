
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AmbientBackground from '@/components/AmbientBackground.vue';
import { ref } from 'vue';
import { api } from '@/api';

// Mock dependencies
const mockAppState = {
  currentMediaItem: ref(null),
  supportedExtensions: ref({ images: ['.jpg', '.png'], videos: ['.mp4'] }),
  mainVideoElement: ref(null),
};

vi.mock('@/composables/useAppState', () => ({
  useAppState: () => mockAppState,
}));

vi.mock('@/api', () => ({
  api: {
    loadFileAsDataURL: vi.fn(),
  },
}));

describe('AmbientBackground.vue', () => {
  let wrapper: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAppState.currentMediaItem.value = null;
    mockAppState.mainVideoElement.value = null;
    // Reset browser mocks if needed (canvas, raf)
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(cb, 1)));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('should render canvas and overlays', () => {
    wrapper = mount(AmbientBackground);
    expect(wrapper.find('canvas.ambient-canvas').exists()).toBe(true);
    expect(wrapper.find('.vignette-overlay').exists()).toBe(true);
    expect(wrapper.find('.noise-overlay').exists()).toBe(true);
  });

  it('should load image media when currentMediaItem changes', async () => {
    // Mock canvas context
    const mockContext = {
      drawImage: vi.fn(),
    };

    // We should mock HTMLCanvasElement.prototype.getContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext as any);

    // Mock Image loading
    // @ts-ignore
    global.Image = class {
      onload: () => void;
      src: string;
      constructor() {
        this.onload = () => {};
        this.src = '';
        setTimeout(() => this.onload(), 10); // Simulate load
      }
    };

    (api.loadFileAsDataURL as any).mockResolvedValue({
      type: 'data-url',
      url: 'data:image/jpeg;base64,abc',
    });

    wrapper = mount(AmbientBackground);

    mockAppState.currentMediaItem.value = { path: '/test/image.jpg' } as any;

    // Wait for watch and async load
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(api.loadFileAsDataURL).toHaveBeenCalledWith('/test/image.jpg');
    expect(mockContext.drawImage).toHaveBeenCalled();
  });

  it('should start video loop when currentMediaItem is video', async () => {
    const mockContext = {
        drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext as any);

    (api.loadFileAsDataURL as any).mockResolvedValue({
        type: 'http-url',
        url: 'http://localhost/video.mp4',
    });

    const mockVideo = {
        paused: false,
        ended: false,
    } as unknown as HTMLVideoElement;

    wrapper = mount(AmbientBackground);

    mockAppState.mainVideoElement.value = mockVideo;
    mockAppState.currentMediaItem.value = { path: '/test/video.mp4' } as any;

    // Wait for watch and async load
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(api.loadFileAsDataURL).toHaveBeenCalledWith('/test/video.mp4');
    expect(requestAnimationFrame).toHaveBeenCalled();

    // Wait for raf loop
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockContext.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0, expect.any(Number), expect.any(Number));
  });

  it('should cleanup on unmount', () => {
      wrapper = mount(AmbientBackground);
      wrapper.unmount();
  });

  it('should handle errors during media load', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.loadFileAsDataURL as any).mockRejectedValue(new Error('Load failed'));

    wrapper = mount(AmbientBackground);
    mockAppState.currentMediaItem.value = { path: '/test/broken.jpg' } as any;

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load background media:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should clear mediaUrl if currentMediaItem is null', async () => {
      wrapper = mount(AmbientBackground);
      mockAppState.currentMediaItem.value = { path: '/test.jpg' } as any;
      await new Promise(resolve => setTimeout(resolve, 10));

      mockAppState.currentMediaItem.value = null;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(api.loadFileAsDataURL).toHaveBeenCalledTimes(1);
  });
});
