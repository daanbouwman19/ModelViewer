import { describe, it, expect, vi, Mock, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import VideoPlayer from '@/components/VideoPlayer.vue';

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

  it('handles HLS errors and attempts recovery', async () => {
    // Enable HLS support for this test
    ((MockHls as any).isSupported as Mock).mockReturnValue(true);
    mount(VideoPlayer, {
      props: {
        ...defaultProps,
        src: 'http://localhost/test.m3u8',
      },
    });
    // Simulate mount to trigger HLS init
    await nextTick();
    await nextTick(); // Wait for videoElement watcher to fire initHls

    // Simulate HLS error
    const errorData = {
      fatal: true,
      type: (MockHls as any).ErrorTypes.NETWORK_ERROR,
    };
    // We need to trigger the error handler callback registered via hls.on
    // Find the callback from the mock calls
    const onCalls = mockHlsInstance.on.mock.calls;
    // The first argument to .on is the event name.
    const errorCall = onCalls.find(
      (c: any[]) => c[0] === (MockHls as any).Events.ERROR,
    );

    if (errorCall) {
      // Execute error handler
      errorCall[1]((MockHls as any).Events.ERROR, errorData);
      expect(mockHlsInstance.startLoad).toHaveBeenCalled();

      // Test media error recovery
      const mediaError = {
        fatal: true,
        type: (MockHls as any).ErrorTypes.MEDIA_ERROR,
      };
      errorCall[1]((MockHls as any).Events.ERROR, mediaError);
      expect(mockHlsInstance.recoverMediaError).toHaveBeenCalled();
    } else {
      throw new Error('HLS Error handler not registered');
    }
  });

  it('falls back to native HLS if Hls.js not supported', async () => {
    ((MockHls as any).isSupported as Mock).mockReturnValue(false);

    // Mount with native HLS support mocked
    const wrapper = mount(VideoPlayer, {
      props: {
        ...defaultProps,
        src: 'http://test.m3u8',
      },
      global: {
        stubs: {
          video: {
            template: '<video></video>',
            methods: {
              canPlayType: vi.fn().mockReturnValue('probably'),
              load: vi.fn(),
              pause: vi.fn(),
              removeAttribute: vi.fn(),
            },
          },
        },
      },
    });

    // Wait for watchers
    await nextTick();

    const video = wrapper.find('video').element as HTMLVideoElement;
    expect(video.src).toContain('http://test.m3u8');
  });

  it('logs error if play fails', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video').element as HTMLVideoElement;

    video.play = vi.fn().mockRejectedValue(new Error('Play failed'));
    video.pause = vi.fn();
    Object.defineProperty(video, 'paused', { value: true, writable: true });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Trigger click to play
    await wrapper.find('video').trigger('click');
    await nextTick();

    // Wait a tick for catch block
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error attempting to play video:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('toggles play state on click', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video').element as HTMLVideoElement;

    // Mock play/pause methods
    video.play = vi.fn().mockResolvedValue(undefined);
    video.pause = vi.fn();

    // Initial state: paused
    Object.defineProperty(video, 'paused', { value: true, writable: true });

    // Click to play
    await wrapper.find('video').trigger('click');
    expect(video.play).toHaveBeenCalled();

    // State: playing
    Object.defineProperty(video, 'paused', { value: false, writable: true });

    // Click to pause
    await wrapper.find('video').trigger('click');
    expect(video.pause).toHaveBeenCalled();
  });

  it('cleans up previous HLS instance when source changes', async () => {
    // Enable HLS support for this test
    ((MockHls as any).isSupported as Mock).mockReturnValue(true);
    const wrapper = mount(VideoPlayer, {
      props: { ...defaultProps, src: 'test.m3u8' },
    });
    await nextTick();

    // Access the HLS instance from the component instance
    const hlsInstance = (wrapper.vm as any).hls;
    expect(hlsInstance).toBeTruthy();
    const destroySpy = hlsInstance.destroy;

    // Change src to trigger cleanup
    await wrapper.setProps({ src: 'test2.m3u8' });
    await nextTick();

    expect(destroySpy).toHaveBeenCalled();
  });

  it('adjusts time updates in transcoding mode', async () => {
    const wrapper = mount(VideoPlayer, {
      props: {
        ...defaultProps,
        isTranscodingMode: true,
        transcodedDuration: 100,
        currentTranscodeStartTime: 50,
      },
    });
    const video = wrapper.find('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      value: 10,
      configurable: true,
    });

    await wrapper.find('video').trigger('timeupdate');

    expect(wrapper.emitted('timeupdate')).toBeTruthy();
    expect(wrapper.emitted('timeupdate')?.[0]).toEqual([60]);
  });

  it('triggers transcode if dimensions are missing', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');
    const event = new Event('loadedmetadata');
    Object.defineProperty(event, 'target', {
      value: { videoWidth: 0, videoHeight: 0 },
    });

    await video.element.dispatchEvent(event);
    expect(wrapper.emitted('trigger-transcode')).toBeTruthy();
  });

  it('exposes reset method which pauses and reloads video', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video').element as HTMLVideoElement;
    video.pause = vi.fn();
    video.load = vi.fn();
    video.removeAttribute = vi.fn();

    // Call exposed reset
    (wrapper.vm as any).reset();

    expect(video.pause).toHaveBeenCalled();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalled();
  });

  it('sets initialTime when provided', async () => {
    const wrapper = mount(VideoPlayer, {
      props: { ...defaultProps, initialTime: 42 },
    });
    // Triggers watch -> initHls -> (el && initialTime)
    // Need to wait for watcher? onMounted?
    // The watcher is on `videoElement`.
    await nextTick();

    // We can also test updating the video element ref manually if needed,
    // but mount should set it.
    const video = wrapper.find('video').element as HTMLVideoElement;
    expect(video.currentTime).toBe(42);
  });

  it('emits error event on native video error', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');

    await video.trigger('error');
    expect(wrapper.emitted('error')).toBeTruthy();
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
});
