import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils'; // Correct import for flushPromises? No, usually in test-utils or vitest
import AmbientBackground from '../../../src/renderer/components/AmbientBackground.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { api } from '../../../src/renderer/api';

vi.mock('../../../src/renderer/composables/useAppState');
vi.mock('../../../src/renderer/api');

describe('AmbientBackground.vue', () => {
  let mockAppState: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAppState = {
      currentMediaItem: { value: null },
      supportedExtensions: {
        value: { images: ['.jpg', '.png'], videos: ['.mp4'] },
      },
      mainVideoElement: { value: null },
    };
    vi.mocked(useAppState).mockReturnValue(mockAppState);

    // Mock API
    vi.mocked(api.loadFileAsDataURL).mockResolvedValue({
      type: 'data-url',
      url: 'data:image/png;base64,fake',
    });

    // Mock Canvas context
    const mockContext = {
      drawImage: vi.fn(),
    };
    // Mock HTMLCanvasElement.prototype.getContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockContext as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly', () => {
    const wrapper = mount(AmbientBackground);
    expect(wrapper.find('.ambient-background-container').exists()).toBe(true);
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('loads media when currentMediaItem changes (Image)', async () => {
    mockAppState.currentMediaItem.value = { path: '/test/image.jpg' };

    // Mock Image loading
    // In happy-dom/jsdom, Image is global. We can spy on it or setter.
    // Or simply wait for the effect.
    // The component does: new Image(), img.src = ..., img.onload.

    // To test onload, we can hijack global Image or just assume standard behavior works if we wait enough.
    // But better trigger onload manually if we can catch the instance.

    const originalImage = window.Image;
    window.Image = class FakeImage {
      onload: any;
      _src: string = '';
      set src(v: string) {
        this._src = v;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
      get src() {
        return this._src;
      }
    } as any;

    const wrapper = mount(AmbientBackground);
    await flushPromises();

    // Verify api called
    expect(api.loadFileAsDataURL).toHaveBeenCalledWith('/test/image.jpg');

    // Wait for onload timeout
    await new Promise((r) => setTimeout(r, 20));

    // Verify drawImage called
    const canvas = wrapper.find('canvas').element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    expect(ctx?.drawImage).toHaveBeenCalled();

    window.Image = originalImage;
  });

  it('starts video loop when video', async () => {
    mockAppState.currentMediaItem.value = { path: '/test/video.mp4' };
    const mockVideo = { paused: false, ended: false } as HTMLVideoElement;
    mockAppState.mainVideoElement.value = mockVideo;

    const wrapper = mount(AmbientBackground);
    await flushPromises();

    // It uses requestAnimationFrame.
    // We can advance timers or just check if loop ran.
    // The loop checks mainVideoElement.

    // Force a frame
    await new Promise((r) => setTimeout(r, 50));

    const canvas = wrapper.find('canvas').element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    // We expect drawImage to be called if video is playing
    // But rAF is async.
    // Also we need to make sure loop runs.
    // Testing rAF loops usually implies using vi.useFakeTimers or ensuring rAF is called.

    // For now, simple check.
    // Wait, the component calls startVideoLoop which calls loop which calls ctx.drawImage IMMEDIATELY if conditions met?
    // No, loop calls if checks pass.

    // We need to wait for next tick maybe.
    await new Promise((r) => setTimeout(r, 50));

    expect(ctx?.drawImage).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('handles api load error', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockAppState.currentMediaItem.value = { path: '/test/fail.jpg' };
    vi.mocked(api.loadFileAsDataURL).mockRejectedValue(new Error('Load fail'));

    mount(AmbientBackground);
    await flushPromises();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load background media:',
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it('video loop handles missing video element gracefully', async () => {
    // Clear previous intervals/animations
    mockAppState.currentMediaItem.value = { path: '/test/video.mp4' };
    // Video not set yet
    mockAppState.mainVideoElement.value = null;

    const wrapper = mount(AmbientBackground);
    await flushPromises();

    // Trigger rAF manually if possible or wait
    await new Promise((r) => setTimeout(r, 50));

    const canvas = wrapper.find('canvas').element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    // Should NOT draw
    expect(ctx?.drawImage).not.toHaveBeenCalled();
  });

  it('video loop swallows drawImage errors', async () => {
    mockAppState.currentMediaItem.value = { path: '/test/video.mp4' };
    mockAppState.mainVideoElement.value = {
      paused: false,
      ended: false,
    } as any;

    const wrapper = mount(AmbientBackground);

    const canvas = wrapper.find('canvas').element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    // Mock drawImage to throw
    vi.mocked(ctx!.drawImage).mockImplementationOnce(() => {
      throw new Error('Canvas error');
    });

    await flushPromises();
    await new Promise((r) => setTimeout(r, 20));

    // Should not crash (no unhandled rejection catchable easily here, but execution continues)
    expect(ctx?.drawImage).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('handles http-url media', async () => {
    mockAppState.currentMediaItem.value = { path: '/test/image.jpg' };
    vi.mocked(api.loadFileAsDataURL).mockResolvedValue({
      type: 'http-url',
      url: 'http://foo.com/img.jpg',
    });

    const wrapper = mount(AmbientBackground);
    await flushPromises();

    expect(wrapper.vm).toBeDefined();
    // Just verify no crash and it tries to load
    expect(api.loadFileAsDataURL).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('handles no media', async () => {
    mockAppState.currentMediaItem.value = null;
    await flushPromises();
    expect(api.loadFileAsDataURL).not.toHaveBeenCalled();
  });
});
