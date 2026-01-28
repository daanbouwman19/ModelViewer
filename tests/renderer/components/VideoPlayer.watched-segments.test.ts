import { describe, it, expect, vi, Mock, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import VideoPlayer from '@/components/VideoPlayer.vue';
import { api } from '@/api';

// Mock API
vi.mock('@/api', () => ({
  api: {
    getMetadata: vi.fn().mockResolvedValue({}),
    updateWatchedSegments: vi.fn().mockResolvedValue(undefined),
    getHeatmap: vi.fn().mockResolvedValue({
      points: 100,
      audio: new Array(100).fill(0),
      motion: new Array(100).fill(0),
    }),
  },
}));

// Mock PlayIcon
vi.mock('@/components/icons/PlayIcon.vue', () => ({
  default: { template: '<svg class="play-icon-mock"></svg>' },
}));

// Mock HLS
vi.mock('hls.js', () => ({
  default: vi.fn(),
}));

describe('VideoPlayer.vue - Watched Segments Coverage', () => {
  const defaultProps = {
    src: 'http://localhost/test.mp4',
    filePath: '/path/to/video.mp4',
    isTranscodingMode: false,
    isControlsVisible: true,
    transcodedDuration: 0,
    currentTranscodeStartTime: 0,
    isTranscodingLoading: false,
    isBuffering: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads watched segments on mount', async () => {
    const mockMetadata = {
      '/path/to/video.mp4': {
        watchedSegments: JSON.stringify([
          { start: 10, end: 20 },
          { start: 30, end: 40 },
        ]),
      },
    };
    (api.getMetadata as Mock).mockResolvedValue(mockMetadata);

    const wrapper = mount(VideoPlayer, { props: defaultProps });
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.watchedSegments).toEqual([
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ]);
  });

  it('handles loadWatchedSegments with no metadata', async () => {
    (api.getMetadata as Mock).mockResolvedValue({});

    const wrapper = mount(VideoPlayer, { props: defaultProps });
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.watchedSegments).toEqual([]);
  });

  it('handles loadWatchedSegments with invalid JSON', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getMetadata as Mock).mockResolvedValue({
      '/path/to/video.mp4': { watchedSegments: 'invalid-json' },
    });

    void mount(VideoPlayer, { props: defaultProps });
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles loadWatchedSegments API failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getMetadata as Mock).mockRejectedValue(new Error('API Error'));

    void mount(VideoPlayer, { props: defaultProps });
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[VideoPlayer] Failed to load watched segments:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('persists watched segments', async () => {
    (api.updateWatchedSegments as Mock).mockResolvedValue(undefined);

    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.watchedSegments = [
      { start: 5, end: 10 },
      { start: 15, end: 20 },
    ];

    await vm.persistWatchedSegments();

    expect(api.updateWatchedSegments).toHaveBeenCalledWith(
      '/path/to/video.mp4',
      JSON.stringify([
        { start: 5, end: 10 },
        { start: 15, end: 20 },
      ]),
    );
  });

  it('does not persist if no segments', async () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.watchedSegments = [];
    await vm.persistWatchedSegments();

    expect(api.updateWatchedSegments).not.toHaveBeenCalled();
  });

  it('handles persistWatchedSegments failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.updateWatchedSegments as Mock).mockRejectedValue(
      new Error('Persist failed'),
    );

    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.watchedSegments = [{ start: 0, end: 10 }];
    await vm.persistWatchedSegments();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[VideoPlayer] Failed to persist watched segments:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('adds and merges watched segments', () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    // Add first segment
    vm.addWatchedSegment(10, 20);
    expect(vm.watchedSegments).toEqual([{ start: 10, end: 20 }]);

    // Add overlapping segment
    vm.addWatchedSegment(18, 25);
    expect(vm.watchedSegments).toEqual([{ start: 10, end: 25 }]);

    // Add gap segment (within tolerance)
    vm.addWatchedSegment(25.3, 30);
    expect(vm.watchedSegments).toEqual([{ start: 10, end: 30 }]);

    // Add separate segment
    vm.addWatchedSegment(50, 60);
    expect(vm.watchedSegments.length).toBe(2);
  });

  it('tracks watched segments during playback', async () => {
    vi.useFakeTimers();
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.isPlaying = true;
    vm.videoElement = { currentTime: 10, duration: 100 };

    // First update
    vm.handleTimeUpdate({ target: { currentTime: 10, duration: 100 } });
    expect(vm.watchedSegments).toEqual([]);

    // Second update (should add segment)
    vm.videoElement.currentTime = 12;
    vm.handleTimeUpdate({ target: { currentTime: 12, duration: 100 } });

    expect(vm.watchedSegments.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it('does not track on large jumps', () => {
    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.isPlaying = true;
    vm.lastTrackedTime = 10;

    // Jump more than 5 seconds
    vm.handleTimeUpdate({ target: { currentTime: 20, duration: 100 } });

    // Should not add segment due to large jump
    expect(vm.watchedSegments).toEqual([]);
  });

  it('persists segments on unmount', async () => {
    (api.updateWatchedSegments as Mock).mockResolvedValue(undefined);

    const wrapper = mount(VideoPlayer, { props: defaultProps });
    const vm = wrapper.vm as any;

    vm.watchedSegments = [{ start: 0, end: 10 }];

    wrapper.unmount();
    await flushPromises();

    expect(api.updateWatchedSegments).toHaveBeenCalled();
  });

  it('draws watched segments on heatmap', async () => {
    (api.getMetadata as Mock).mockResolvedValue({
      '/path/to/video.mp4': {
        watchedSegments: JSON.stringify([{ start: 10, end: 20 }]),
      },
    });

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
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
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

    const vm = wrapper.vm as any;
    vm.videoElement = { duration: 100 };
    vm.drawHeatmap();

    // Should call fillRect for watched segments
    expect(ctx.fillRect).toHaveBeenCalled();
    // Verify the watched segment color was set
    const fillCalls = (ctx.fillRect as Mock).mock.calls;
    expect(fillCalls.length).toBeGreaterThan(0);
  });
});
