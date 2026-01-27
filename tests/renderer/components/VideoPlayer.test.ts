import { describe, it, expect, vi, Mock, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
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

  // We use a regular function as the constructor to satisfy Vitest's "function or class" requirement
  const MockClass = function (this: any) {
    return instance;
  };

  // Attach static methods and properties
  (MockClass as any).isSupported = vi.fn().mockReturnValue(false);
  (MockClass as any).Events = { ERROR: 'hlsError' };
  (MockClass as any).ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    OTHER_ERROR: 'otherError',
  };

  return { mockHlsInstance: instance, MockHls: MockClass };
});

vi.mock('hls.js', () => ({
  default: MockHls,
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
    });
  });
});
