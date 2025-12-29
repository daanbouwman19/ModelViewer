import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import VideoPlayer from '@/components/VideoPlayer.vue';

// Mock PlayIcon
vi.mock('@/components/icons/PlayIcon.vue', () => ({
  default: { template: '<svg class="play-icon-mock"></svg>' },
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

  it('renders video element with src', () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toBe(defaultProps.src);
  });

  it('emits play event when video plays', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');
    await video.trigger('play');
    expect(wrapper.emitted('play')).toBeTruthy();
  });

  it('emits pause event when video pauses', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');
    await video.trigger('pause');
    expect(wrapper.emitted('pause')).toBeTruthy();
  });

  it('emits ended event when video ends', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');
    await video.trigger('ended');
    expect(wrapper.emitted('ended')).toBeTruthy();
  });

  it('formats time correctly', () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;
    // formatTime is not exposed, but used in template.
    // We can check rendered text if we set state.
    // But testing private function via 'as any' is what we had.
    // VideoPlayer does not expose formatTime.
    // Let's rely on template output for integration or just SKIP this unit test if considered private.
    // However, I can test it by setting currentVideoTime and checking DOM.
    // State is private (ref). I can't easily set it without triggering handleTimeUpdate.

    // Simulate time update
    // wrapper and vm are already defined at start of test

    // Trigger timeupdate
    const event = {
      target: {
        currentTime: 65,
        duration: 120,
      },
    };
    vm.handleTimeUpdate(event);
    // Wait for render
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.text()).toContain('01:05');
    });
  });

  it('handles progress bar click', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    await flushPromises();

    // Mock video element ref interactions
    const videoElement = {
      duration: 100,
      currentTime: 0,
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn(),
    };
    (wrapper.vm as any).videoElement = videoElement;

    // Simulate click event
    const event = {
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, width: 100 }),
      },
      clientX: 50,
    };

    (wrapper.vm as any).handleProgressBarClick(event);
    expect(videoElement.currentTime).toBe(50);
  });

  it('should emit trigger-transcode when progress bar clicked in transcode mode', async () => {
    const wrapper = mount(VideoPlayer, {
      props: {
        ...defaultProps,
        isTranscodingMode: true,
        transcodedDuration: 100,
      },
    });

    // Simulate click event via handler call for reliability
    const event = {
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, width: 100 }),
      },
      clientX: 50,
    };

    (wrapper.vm as any).handleProgressBarClick(event);
    expect(wrapper.emitted('trigger-transcode')).toBeTruthy();
    expect(wrapper.emitted('trigger-transcode')?.[0]).toEqual([50]);
  });

  it('should emit trigger-transcode on arrow keys in transcode mode', async () => {
    const wrapper = mount(VideoPlayer, {
      props: {
        ...defaultProps,
        isTranscodingMode: true,
        transcodedDuration: 100,
      },
    });
    // Set internal state currentVideoTime to 50
    (wrapper.vm as any).currentVideoTime = 50;

    const progressBar = wrapper.find('[data-testid="video-progress-bar"]');
    await progressBar.trigger('keydown', { key: 'ArrowRight' });

    expect(wrapper.emitted('trigger-transcode')).toBeTruthy();
    expect(wrapper.emitted('trigger-transcode')?.[0]).toEqual([55]);
  });

  it('emits trigger-transcode if video dimensions are 0 (HEVC check)', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });

    // Simulate loadedmetadata via handler call
    const event = {
      target: {
        videoWidth: 0,
        videoHeight: 0,
      },
    };

    (wrapper.vm as any).handleLoadedMetadata(event);

    expect(wrapper.emitted('trigger-transcode')).toBeTruthy();
    expect(wrapper.emitted('trigger-transcode')?.[0]).toEqual([0]);
  });

  it('updates buffer ranges', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const video = wrapper.find('video');

    // Mock buffered
    const bufferedMock = {
      length: 1,
      start: () => 0,
      end: () => 50,
    };
    // We need to inject this into the event target or mock the element property
    const videoEl = video.element as HTMLVideoElement;
    Object.defineProperty(videoEl, 'duration', {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(videoEl, 'buffered', {
      value: bufferedMock,
      configurable: true,
    });

    await video.trigger('progress');

    // Check internal state or rendered DOM
    // "bufferedRanges" is rendered as style.
    const ranges = wrapper.findAll('.absolute.h-full.bg-white\\/30');
    expect(ranges.length).toBeGreaterThan(0);
    // There should be one range div
    // We need to wait for render?
    await wrapper.vm.$nextTick();
    const rangeDivs = wrapper.findAll('.absolute.h-full.bg-white\\/30');
    expect(rangeDivs.length).toBe(1);
    expect(rangeDivs[0].attributes('style')).toContain('width: 50%');
  });

  it('covers togglePlay pause branch', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const videoElement = {
      paused: false,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
    };
    (wrapper.vm as any).videoElement = videoElement;

    (wrapper.vm as any).togglePlay();
    expect(videoElement.pause).toHaveBeenCalled();
  });

  it('covers reset method', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const videoElement = {
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn(),
    };
    (wrapper.vm as any).videoElement = videoElement;

    (wrapper.vm as any).reset();
    expect(videoElement.pause).toHaveBeenCalled();
    expect(videoElement.removeAttribute).toHaveBeenCalledWith('src');
    expect(videoElement.load).toHaveBeenCalled();
  });

  it('covers handleWaiting and handleCanPlay', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    (wrapper.vm as any).handleWaiting();
    expect(wrapper.emitted('buffering')?.[0]).toEqual([true]);

    (wrapper.vm as any).handleCanPlay();
    expect(wrapper.emitted('buffering')?.[1]).toEqual([false]);
  });

  it('covers handlePlaying', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    (wrapper.vm as any).handlePlaying();
    expect(wrapper.emitted('playing')).toBeTruthy();
  });

  it('covers handleError', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const event = new Event('error');
    (wrapper.vm as any).handleError(event);
    expect(wrapper.emitted('error')?.[0]).toEqual([event]);
  });

  it('covers handleTimeUpdate branch with duration 0 or Infinity', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.handleTimeUpdate({ target: { currentTime: 10, duration: 0 } });
    expect(vm.videoProgress).toBe(0);

    vm.handleTimeUpdate({ target: { currentTime: 10, duration: Infinity } });
    expect(vm.videoProgress).toBe(0);
  });

  it('covers formatTime with h > 0', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    // Simulate 1h 1m 5s
    vm.handleTimeUpdate({ target: { currentTime: 3665, duration: 4000 } });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('1:01:05');
  });

  it('covers handleTimeUpdate branch in transcoding mode', async () => {
    const wrapper = mount(VideoPlayer, {
      props: {
        ...defaultProps,
        isTranscodingMode: true,
        transcodedDuration: 200,
        currentTranscodeStartTime: 50,
      },
    });
    const vm = wrapper.vm as any;
    vm.handleTimeUpdate({ target: { currentTime: 10, duration: 100 } });

    expect(vm.currentVideoTime).toBe(60); // 50 + 10
    expect(vm.videoProgress).toBe(30); // (60 / 200) * 100
  });

  it('covers handleProgress branch with no duration', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;
    vm.handleProgress({ target: { duration: 0 } });
    expect(vm.bufferedRanges).toEqual([]);
  });

  it('covers togglePlay play error branch', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const videoElement = {
      paused: true,
      play: vi.fn().mockRejectedValue(new Error('play fail')),
    };
    (wrapper.vm as any).videoElement = videoElement;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await (wrapper.vm as any).togglePlay();
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('covers handleProgressBarKeydown ArrowLeft', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    (wrapper.vm as any).currentVideoTime = 50;
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    (wrapper.vm as any).handleProgressBarKeydown(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('covers handleProgressBarKeydown in transcode mode ArrowLeft', async () => {
    const wrapper = mount(VideoPlayer, {
      props: {
        ...defaultProps,
        isTranscodingMode: true,
        transcodedDuration: 100,
      },
    });
    (wrapper.vm as any).currentVideoTime = 50;
    (wrapper.vm as any).handleProgressBarKeydown({
      key: 'ArrowLeft',
      preventDefault: vi.fn(),
    });
    expect(wrapper.emitted('trigger-transcode')?.[0]).toEqual([45]);
  });

  it('covers handleProgressBarClick in native mode', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const videoElement = { duration: 100, currentTime: 0 };
    (wrapper.vm as any).videoElement = videoElement;

    const event = {
      currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
      clientX: 75,
    };
    (wrapper.vm as any).handleProgressBarClick(event);
    expect(videoElement.currentTime).toBe(75);
  });

  it('covers handleLoadedMetadata with valid dimensions', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    (wrapper.vm as any).handleLoadedMetadata({
      target: { videoWidth: 100, videoHeight: 100 },
    });
    expect(wrapper.emitted('trigger-transcode')).toBeFalsy();
  });

  it('covers formatTime edge cases', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;
    expect(vm.formatTime(0)).toBe('00:00');
    expect(vm.formatTime(NaN)).toBe('00:00');
  });
});
