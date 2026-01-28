import { describe, it, expect, vi, Mock, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import VideoPlayer from '@/components/VideoPlayer.vue';

import { api } from '@/api';

// Mock PlayIcon
vi.mock('@/components/icons/PlayIcon.vue', () => ({
  default: { template: '<svg class="play-icon-mock"></svg>' },
}));

// Robust HLS Mock
const { mockHlsInstance, MockHls } = vi.hoisted(() => {
  const instance = {
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    startLoad: vi.fn(),
    recoverMediaError: vi.fn(),
  };

  // Wrap in vi.fn to make it a spy
  const MockSpy = vi.fn(function (this: any) {
    return instance;
  });

  // Attach static methods and properties
  (MockSpy as any).isSupported = vi.fn().mockReturnValue(false);
  (MockSpy as any).Events = { ERROR: 'hlsError' };
  (MockSpy as any).ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    OTHER_ERROR: 'otherError',
  };

  return { mockHlsInstance: instance, MockHls: MockSpy };
});

vi.mock('hls.js', () => ({
  default: MockHls,
}));

vi.mock('@/api', () => ({
  api: {
    getHeatmap: vi.fn().mockResolvedValue({
      points: 100,
      audio: new Array(100).fill(0),
      motion: new Array(100).fill(0),
    }),
    getHeatmapProgress: vi.fn().mockResolvedValue(50),
  },
}));

describe('VideoPlayer.vue', () => {
  const defaultProps = {
    src: 'http://localhost/test.mp4',
    isTranscodingMode: false,
    isControlsVisible: true,
    transcodedDuration: 0,
    currentTranscodeStartTime: 0,
    isTranscodingLoading: false,
    isBuffering: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHlsInstance.loadSource.mockReset();
    mockHlsInstance.attachMedia.mockReset();
    mockHlsInstance.on.mockReset();
    mockHlsInstance.destroy.mockReset();
    mockHlsInstance.startLoad.mockReset();
    mockHlsInstance.recoverMediaError.mockReset();
    ((MockHls as any).isSupported as Mock).mockReturnValue(false);
  });

  it('renders video element with src', () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toBe(defaultProps.src);
  });

  it('renders accessible play button overlay when paused', async () => {
    const wrapper = mount(VideoPlayer, {
      props: defaultProps,
      attachTo: document.body,
    });

    (wrapper.vm as any).isPlaying = false;
    await wrapper.vm.$nextTick();

    const playButton = wrapper.find('button[aria-label="Play video"]');
    expect(playButton.exists()).toBe(true);
    wrapper.unmount();
  });

  it('emits events: play, pause, ended, playing, buffering', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');

    await video.trigger('play');
    expect(wrapper.emitted('play')).toBeTruthy();

    await video.trigger('pause');
    expect(wrapper.emitted('pause')).toBeTruthy();

    await video.trigger('ended');
    expect(wrapper.emitted('ended')).toBeTruthy();

    (wrapper.vm as any).handlePlaying();
    expect(wrapper.emitted('playing')).toBeTruthy();

    (wrapper.vm as any).handleWaiting();
    expect(wrapper.emitted('buffering')?.[0]).toEqual([true]);

    (wrapper.vm as any).handleCanPlay();
    expect(wrapper.emitted('buffering')?.[1]).toEqual([false]);
  });

  it('handles progress bar interactions', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const videoElement = {
      duration: 100,
      currentTime: 0,
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn(),
    };
    (wrapper.vm as any).videoElement = videoElement;

    const event = {
      currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
      clientX: 50,
    };

    (wrapper.vm as any).handleProgressBarClick(event);
    expect(videoElement.currentTime).toBe(50);
  });

  it('handles transcoding mode seeking', async () => {
    const wrapper = mount(VideoPlayer, {
      props: {
        ...defaultProps,
        isTranscodingMode: true,
        transcodedDuration: 100,
      },
    });

    const clickEvent = {
      currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
      clientX: 50,
    };
    (wrapper.vm as any).handleProgressBarClick(clickEvent);
    expect(wrapper.emitted('trigger-transcode')?.[0]).toEqual([50]);

    (wrapper.vm as any).currentVideoTime = 50;
    const progressBar = wrapper.find('[data-testid="video-progress-bar"]');
    await progressBar.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('trigger-transcode')?.[1]).toEqual([55]);
  });

  it('emits trigger-transcode if video dimensions are 0', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    (wrapper.vm as any).handleLoadedMetadata({
      target: { videoWidth: 0, videoHeight: 0 },
    });
    expect(wrapper.emitted('trigger-transcode')).toBeTruthy();
  });

  it('updates time and progress correctly', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.handleTimeUpdate({ target: { currentTime: 65, duration: 120 } });
    await wrapper.vm.$nextTick();

    expect(vm.currentVideoTime).toBe(65);
    expect(vm.videoProgress).toBeCloseTo(54.17, 2);

    const progressBar = wrapper.find('[data-testid="video-progress-bar"]');
    expect(progressBar.attributes('aria-valuetext')).toContain('01:05');
  });

  it('handles formatTime edge cases', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;
    expect(vm.formatTime(0)).toBe('00:00');
    expect(vm.formatTime(NaN)).toBe('00:00');
    expect(vm.formatTime(3665)).toBe('1:01:05');
  });

  it('covers effectiveSrc and initHls reset branches', async () => {
    ((MockHls as any).isSupported as Mock).mockReturnValue(true);
    const wrapper = mount(VideoPlayer, {
      props: { ...defaultProps, src: 'http://localhost/video.m3u8' },
    });
    await flushPromises();

    // Line 112: effectiveSrc should be undefined for HLS m3u8
    expect((wrapper.vm as any).effectiveSrc).toBeUndefined();

    // Line 118: reset existing HLS instance on src change
    await wrapper.setProps({ src: 'http://localhost/other.m3u8' });
    expect(mockHlsInstance.destroy).toHaveBeenCalled();
  });

  it('covers null src branch in initHls', async () => {
    mount(VideoPlayer, {
      props: { ...defaultProps, src: null },
    });
    await flushPromises();
    expect(MockHls).not.toHaveBeenCalled();
  });

  it('sets initialTime on video element correctly', async () => {
    const wrapper = mount(VideoPlayer, {
      props: { ...defaultProps, initialTime: 123 },
    });
    await flushPromises();
    const video = wrapper.find('video').element as HTMLVideoElement;
    expect(video.currentTime).toBe(123);
  });

  it('initHls returns early when videoElement is missing', async () => {
    const wrapper = mount(VideoPlayer, {
      props: { ...defaultProps, src: 'test.m3u8' },
    });
    // Manually nullify videoElement to test the early return branch
    (wrapper.vm as any).videoElement = null;
    const result = (wrapper.vm as any).initHls();
    expect(result).toBeUndefined();
    expect(MockHls).not.toHaveBeenCalled();
  });

  it('covers handleProgress with buffered ranges', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = {
      duration: 100,
      buffered: {
        length: 1,
        start: () => 10,
        end: () => 20,
      },
    };
    (wrapper.vm as any).handleProgress({ target: video });
    expect((wrapper.vm as any).bufferedRanges).toEqual([
      { start: 10, end: 20 },
    ]);
  });

  it('covers handleProgressBarKeydown ArrowLeft native', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = { duration: 100, currentTime: 50 };
    (wrapper.vm as any).videoElement = video;

    const event = {
      key: 'ArrowLeft',
      preventDefault: vi.fn(),
    };
    (wrapper.vm as any).handleProgressBarKeydown(event);
    expect(video.currentTime).toBe(45);
  });

  describe('HLS Implementation Coverage', () => {
    it('initializes HLS when supported', async () => {
      ((MockHls as any).isSupported as Mock).mockReturnValue(true);

      const wrapper = mount(VideoPlayer, {
        props: { ...defaultProps, src: 'http://localhost/video.m3u8' },
      });

      await flushPromises();
      await wrapper.vm.$nextTick();

      expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(
        'http://localhost/video.m3u8',
      );
      expect(mockHlsInstance.attachMedia).toHaveBeenCalled();
    });

    it('falls back to native m3u8 when HLS not supported but native is', async () => {
      ((MockHls as any).isSupported as Mock).mockReturnValue(false);

      const wrapper = mount(VideoPlayer, {
        props: { ...defaultProps, src: 'http://localhost/video.m3u8' },
      });
      const video = wrapper.find('video').element as HTMLVideoElement;

      // Mock canPlayType to return something truthy for m3u8
      video.canPlayType = vi.fn().mockReturnValue('maybe');

      // Trigger watcher manually or re-mount
      (wrapper.vm as any).initHls();

      expect(video.src).toBe('http://localhost/video.m3u8');
    });

    it('handles HLS fatal errors', async () => {
      ((MockHls as any).isSupported as Mock).mockReturnValue(true);
      mount(VideoPlayer, {
        props: { ...defaultProps, src: 'http://localhost/video.m3u8' },
      });
      await flushPromises();

      const onCalls = mockHlsInstance.on.mock.calls;
      const errorCall = onCalls.find((c) => c[0] === 'hlsError');
      expect(errorCall).toBeDefined();
      const errorHandler = errorCall![1];

      // NETWORK_ERROR
      errorHandler({}, { fatal: true, type: 'networkError' });
      expect(mockHlsInstance.startLoad).toHaveBeenCalled();

      // MEDIA_ERROR
      errorHandler({}, { fatal: true, type: 'mediaError' });
      expect(mockHlsInstance.recoverMediaError).toHaveBeenCalled();

      // OTHER_ERROR
      errorHandler({}, { fatal: true, type: 'otherError' });
      expect(mockHlsInstance.destroy).toHaveBeenCalled();

      // Non-fatal error (should hit nothing)
      errorHandler({}, { fatal: false });
    });
  });

  describe('Edge Case Coverage', () => {
    it('destroys HLS on unmount', async () => {
      ((MockHls as any).isSupported as Mock).mockReturnValue(true);
      const wrapper = mount(VideoPlayer, {
        props: { ...defaultProps, src: 'test.m3u8' },
      });
      await flushPromises();
      wrapper.unmount();
      expect(mockHlsInstance.destroy).toHaveBeenCalled();
    });

    it('togglePlay handles null videoElement', () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      (wrapper.vm as any).videoElement = null;
      expect(() => (wrapper.vm as any).togglePlay()).not.toThrow();
    });

    it('togglePlay pauses when playing', () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      const video = { paused: false, pause: vi.fn() };
      (wrapper.vm as any).videoElement = video;
      (wrapper.vm as any).togglePlay();
      expect(video.pause).toHaveBeenCalled();
    });

    it('togglePlay handles play() rejection', async () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const video = {
        paused: true,
        play: vi.fn().mockReturnValue(Promise.reject('error')),
      };
      (wrapper.vm as any).videoElement = video;
      (wrapper.vm as any).togglePlay();
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error attempting to play video:'),
        'error',
      );
      consoleSpy.mockRestore();
    });

    it('reset handles null videoElement', () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      (wrapper.vm as any).videoElement = null;
      expect(() => (wrapper.vm as any).reset()).not.toThrow();
    });

    it('handleLoadedMetadata does not emit trigger-transcode if transcoding mode is true', () => {
      const wrapper = mount(VideoPlayer, {
        props: { ...defaultProps, isTranscodingMode: true },
      });
      (wrapper.vm as any).handleLoadedMetadata({
        target: { videoWidth: 0, videoHeight: 0 },
      });
      expect(wrapper.emitted('trigger-transcode')).toBeFalsy();
    });

    it('handleTimeUpdate handles zero/infinite duration', () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      const vm = wrapper.vm as any;

      vm.handleTimeUpdate({ target: { currentTime: 10, duration: 0 } });
      expect(vm.videoProgress).toBe(0);

      vm.handleTimeUpdate({ target: { currentTime: 10, duration: Infinity } });
      expect(vm.videoProgress).toBe(0);
    });

    it('handleProgress returns early if no duration', () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      const vm = wrapper.vm as any;
      vm.handleProgress({ target: { duration: 0 } });
      expect(vm.bufferedRanges).toEqual([]);
    });

    it('handleProgressBarClick handles zero duration or missing element', () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      const vm = wrapper.vm as any;

      // Native mode, zero duration
      vm.videoElement = { duration: 0 };
      vm.handleProgressBarClick({
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 100 }),
        },
        clientX: 50,
      });
      // No change to currentTime

      // Transcode mode, zero duration
      wrapper.setProps({ isTranscodingMode: true, transcodedDuration: 0 });
      vm.handleProgressBarClick({
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 100 }),
        },
        clientX: 50,
      });
      expect(wrapper.emitted('trigger-transcode')).toBeFalsy();
    });

    it('handleProgressBarKeydown handles zero duration', () => {
      const wrapper = mount(VideoPlayer, { props: defaultProps });
      const vm = wrapper.vm as any;

      // Native mode, zero duration
      const video = { currentTime: 10, duration: 0 };
      vm.videoElement = video;
      vm.handleProgressBarKeydown({
        key: 'ArrowRight',
        preventDefault: vi.fn(),
      });
      expect(video.currentTime).toBe(10);

      // Transcode mode, zero duration
      wrapper.setProps({ isTranscodingMode: true, transcodedDuration: 0 });
      vm.handleProgressBarKeydown({
        key: 'ArrowRight',
        preventDefault: vi.fn(),
      });
      expect(wrapper.emitted('trigger-transcode')).toBeFalsy();
    });
  });

  describe('Heatmap Coverage', () => {
    it('fetchHeatmap returns early for blob or local src', async () => {
      const wrapper = mount(VideoPlayer, {
        props: { ...defaultProps, src: 'blob:test' },
      });
      await flushPromises();
      expect(api.getHeatmap).not.toHaveBeenCalled();

      await wrapper.setProps({ src: 'http://localhost/video.mp4' }); // no ?file=
      await flushPromises();
      expect(api.getHeatmap).not.toHaveBeenCalled();
    });

    it('fetchHeatmap handles API failure gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (api.getHeatmap as Mock).mockRejectedValueOnce(new Error('API Error'));

      mount(VideoPlayer, {
        props: {
          ...defaultProps,
          src: 'http://localhost/api/stream?file=/path/to/video.mp4',
        },
      });
      await flushPromises();
      expect(api.getHeatmap).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[VideoPlayer] API call failed:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('drawHeatmap renders to canvas', async () => {
      const wrapper = mount(VideoPlayer, {
        props: {
          ...defaultProps,
          src: 'http://localhost/api/stream?file=/path/to/video.mp4',
        },
      });
      await flushPromises();

      const canvas = wrapper.find('canvas').element as HTMLCanvasElement;
      const ctx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        createLinearGradient: vi
          .fn()
          .mockReturnValue({ addColorStop: vi.fn() }),
        fillStyle: '',
      };

      vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as any);
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 50,
        top: 0,
        left: 0,
        right: 100,
        bottom: 50,
      } as DOMRect);

      // Trigger draw
      await (wrapper.vm as any).$nextTick();
      expect(api.getHeatmap).toHaveBeenCalled();

      // Ensure points are > 0 in mock or manually set heatmapData if needed
      // Our mock returns points: 100, so it should be fine.

      (wrapper.vm as any).drawHeatmap();

      expect(canvas.getContext).toHaveBeenCalledWith('2d');
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 50);
      expect(ctx.fillRect).toHaveBeenCalled(); // Should be called for 100 points
    });

    it('redraws heatmap when controls become visible', async () => {
      // Start with controls hidden
      const wrapper = mount(VideoPlayer, {
        props: {
          ...defaultProps,
          src: 'http://localhost/api/stream?file=/path/to/video.mp4',
          isControlsVisible: false,
        },
      });
      await flushPromises();

      // Data should be fetched but canvas not ready
      expect(api.getHeatmap).toHaveBeenCalled();
      expect(wrapper.find('canvas').exists()).toBe(false);

      // We need to spy on the draw method or canvas context
      // But drawHeatmap is internal. We can check if getContext is called on the NEW canvas.

      // Update props to show controls
      await wrapper.setProps({ isControlsVisible: true });
      await wrapper.vm.$nextTick();

      const canvas = wrapper.find('canvas');
      expect(canvas.exists()).toBe(true);

      const ctx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        createLinearGradient: vi
          .fn()
          .mockReturnValue({ addColorStop: vi.fn() }),
        fillStyle: '',
      };

      // Mock the canvas methods on the DOM element
      const el = canvas.element as HTMLCanvasElement;
      vi.spyOn(el, 'getContext').mockReturnValue(ctx as any);
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 50,
        top: 0,
        left: 0,
        right: 100,
        bottom: 50,
      } as DOMRect);

      // Wait for watch -> requestAnimationFrame -> drawHeatmap
      // rAF needs to be handled. In test environment, rAF might be sync or require wait.
      // But we used requestAnimationFrame in the fix.
      // Let's trigger it manually or wait.
      // Since jsdom doesn't auto-run rAF, we might need to mock it or stub it?
      // vitest/jsdom usually polyfills rAF.

      // Let's mock requestAnimationFrame to run immediately
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
      });

      // We need to re-trigger the watch or simulate the flow?
      // The watch happens when 'heatmapCanvas' el updates.
      // In the test, setting prop -> update DOM -> ref updates -> watch runs.

      // However, we added the spy AFTER the element appeared.
      // The watch callback might have run already?
      // Actually, wrapper.setProps awaits nextTick. DOM is updated. Watch runs.
      // If we spy NOW, it's too late if it ran sync.
      // BUT, rAF is async-ish.

      // Strategy: we can't easily spy on the element before it exists.
      // But we can verify side effects.
      // Or we can mock the internal drawHeatmap if we exposed it or imply it via coverage.
      // Let's rely on creating the element with a Mock prototype if possible? No.

      // Alternative: Just call drawHeatmap manually to verify logic, and trust Vue's watch in integration.
      // Or:
      // We can use the fact that we mocked getContext.
      // If we want to capture the call, we usually need to spy on prototype or similar.
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        ctx as any,
      );
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 50,
        top: 0,
        left: 0,
        right: 100,
        bottom: 50,
      } as DOMRect);

      // Trigger visibility AGAIN to force watch (or relies on previous step having set it up?)
      // Let's retry the toggle
      await wrapper.setProps({ isControlsVisible: false });
      await wrapper.vm.$nextTick();
      await wrapper.setProps({ isControlsVisible: true });
      await wrapper.vm.$nextTick();

      // wait for rAF
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ctx.clearRect).toHaveBeenCalled();
      expect(ctx.fillRect).toHaveBeenCalled();
    });
  });
});
