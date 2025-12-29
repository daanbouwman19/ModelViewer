import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MediaDisplay from '@/components/MediaDisplay.vue';
import VideoPlayer from '@/components/VideoPlayer.vue';
import MediaControls from '@/components/MediaControls.vue';
import { api } from '@/api';
import { ref } from 'vue';

const mockRefs = {
  currentMediaItem: ref<any>(null),
  displayedMediaFiles: ref<any[]>([]),
  currentMediaIndex: ref(0),
  isSlideshowActive: ref(false),
  mediaFilter: ref('All'),
  totalMediaInPool: ref(0),
  imageExtensionsSet: ref(new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])),
  playFullVideo: ref(false),
  pauseTimerOnPlay: ref(false),
  isTimerRunning: ref(false),
  mainVideoElement: ref<any>(null),
};

const slideshowMock = {
  navigateMedia: vi.fn(),
  reapplyFilter: vi.fn(),
  pauseSlideshowTimer: vi.fn(),
  resumeSlideshowTimer: vi.fn(),
};

// Mock child components
vi.mock('@/components/VideoPlayer.vue', () => ({
  default: {
    name: 'VideoPlayer',
    template: '<div class="video-player-mock"></div>',
    props: [
      'src',
      'isTranscodingMode',
      'isControlsVisible',
      'transcodedDuration',
      'currentTranscodeStartTime',
      'isTranscodingLoading',
      'isBuffering',
    ],
    expose: ['reset', 'togglePlay', 'currentVideoTime'],
    setup() {
      return {
        reset: vi.fn(),
        togglePlay: vi.fn(),
        currentVideoTime: ref(0),
      };
    },
  },
}));

vi.mock('@/components/MediaControls.vue', () => ({
  default: {
    name: 'MediaControls',
    template: '<div class="media-controls-mock"><slot></slot></div>',
    props: ['currentMediaItem', 'isControlsVisible'],
  },
}));

vi.mock('@/components/TranscodingStatus.vue', () => ({
  default: {
    name: 'TranscodingStatus',
    template: '<div class="transcoding-status-mock"></div>',
    props: [
      'isLoading',
      'isTranscodingLoading',
      'isBuffering',
      'transcodedDuration',
      'currentTranscodeStartTime',
    ],
  },
}));

// Mock api
vi.mock('@/api', () => ({
  api: {
    loadFileAsDataURL: vi.fn(),
    getVideoStreamUrlGenerator: vi.fn(),
    getVideoMetadata: vi.fn(),
    setRating: vi.fn(),
    openInVlc: vi.fn(),
  },
}));

// Mock composables
vi.mock('@/composables/useSlideshow', () => ({
  useSlideshow: () => slideshowMock,
}));

vi.mock('@/composables/useAppState', () => ({
  useAppState: vi.fn(() => mockRefs),
}));

describe('MediaDisplay.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefs.currentMediaItem.value = null;
    mockRefs.displayedMediaFiles.value = [];
    mockRefs.currentMediaIndex.value = 0;
    mockRefs.isSlideshowActive.value = false;
    mockRefs.mediaFilter.value = 'All';
    mockRefs.totalMediaInPool.value = 0;
    mockRefs.playFullVideo.value = false;
    mockRefs.pauseTimerOnPlay.value = false;
    mockRefs.isTimerRunning.value = false;

    (api.loadFileAsDataURL as Mock).mockResolvedValue({
      type: 'success',
      url: 'test-url',
    });
    (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(
      (p: string) => `http://localhost/stream?path=${p}`,
    );
    (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });
  });

  it('renders correctly', async () => {
    const wrapper = mount(MediaDisplay);
    expect(wrapper.exists()).toBeTruthy();
    expect(wrapper.findComponent(MediaControls).exists()).toBeTruthy();
  });

  describe('Media Loading', () => {
    it('loads image when currentMediaItem changes', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('/test.jpg');
      expect((wrapper.vm as any).mediaUrl).toBe('test-url');
    });

    it('handles load error', async () => {
      mockRefs.currentMediaItem.value = { name: 'test.jpg', path: '/test.jpg' };
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'error',
        message: 'Load failed',
      });
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect((wrapper.vm as any).error).toBe('Load failed');
      expect((wrapper.vm as any).mediaUrl).toBeNull();
    });
  });

  describe('Sub-component Interactions', () => {
    it('handles set-rating event from MediaControls', async () => {
      mockRefs.currentMediaItem.value = {
        name: 't.jpg',
        path: '/t.jpg',
        rating: 0,
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const controls = wrapper.findComponent(MediaControls);
      await controls.vm.$emit('set-rating', 4);

      expect(api.setRating).toHaveBeenCalledWith('/t.jpg', 4);
      expect(mockRefs.currentMediaItem.value.rating).toBe(4);
    });

    it('handles navigation events from MediaControls', async () => {
      const wrapper = mount(MediaDisplay);
      const controls = wrapper.findComponent(MediaControls);

      await controls.vm.$emit('previous');
      expect(slideshowMock.navigateMedia).toHaveBeenCalledWith(-1);

      await controls.vm.$emit('next');
      expect(slideshowMock.navigateMedia).toHaveBeenCalledWith(1);
    });

    it('handles buffering event from VideoPlayer', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const videoPlayer = wrapper.findComponent(VideoPlayer);
      expect(videoPlayer.exists()).toBe(true);
      await videoPlayer.vm.$emit('buffering', true);
      expect((wrapper.vm as any).isBuffering).toBe(true);

      await videoPlayer.vm.$emit('buffering', false);
      expect((wrapper.vm as any).isBuffering).toBe(false);
    });
  });

  describe('Additional Coverage', () => {
    it('covers Space key to toggle play', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();
      expect(wrapper.exists()).toBe(true);

      const event = new KeyboardEvent('keydown', { code: 'Space' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('covers setRating error branch', async () => {
      mockRefs.currentMediaItem.value = { name: 't.jpg', path: '/t.jpg' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (api.setRating as Mock).mockRejectedValue(new Error('fail'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const controls = wrapper.findComponent(MediaControls);
      await controls.vm.$emit('set-rating', 5);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to set rating',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('covers handleMediaError transcoding branch', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect((wrapper.vm as any).isTranscodingMode).toBe(false);

      const videoPlayer = wrapper.findComponent(VideoPlayer);
      expect(videoPlayer.exists()).toBe(true);
      await videoPlayer.vm.$emit('error', new Event('error'));

      await flushPromises();
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('covers proactive transcoding for legacy formats', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mov', path: '/t.mov' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('covers handleVideoPlay and handleVideoPause effects on timer', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      mockRefs.isTimerRunning.value = true;
      mockRefs.playFullVideo.value = true;

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const videoPlayer = wrapper.findComponent(VideoPlayer);
      expect(videoPlayer.exists()).toBe(true);
      await videoPlayer.vm.$emit('play');
      expect(slideshowMock.pauseSlideshowTimer).toHaveBeenCalled();

      mockRefs.isTimerRunning.value = false;
      mockRefs.pauseTimerOnPlay.value = true;
      mockRefs.playFullVideo.value = false;

      await videoPlayer.vm.$emit('pause');
      expect(slideshowMock.resumeSlideshowTimer).toHaveBeenCalled();
    });

    it('covers handleMouseMove and handleMouseLeave', async () => {
      vi.useFakeTimers();
      const wrapper = mount(MediaDisplay);

      await wrapper.trigger('mousemove');
      expect((wrapper.vm as any).isControlsVisible).toBe(true);

      vi.advanceTimersByTime(3500);
      expect((wrapper.vm as any).isControlsVisible).toBe(false);

      await wrapper.trigger('mouseleave');
      expect((wrapper.vm as any).isControlsVisible).toBe(false);

      vi.useRealTimers();
    });

    it('covers tryTranscoding URL with query params', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const generator = (p: string) =>
        `http://localhost/stream?foo=bar&path=${p}`;
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(generator);
      (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      await (wrapper.vm as any).tryTranscoding(0);
      expect((wrapper.vm as any).mediaUrl).toContain('&transcode=true');
    });

    it('covers tryTranscoding URL without query params', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const generator = (p: string) => `http://localhost/stream/${p}`;
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(generator);
      (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      await (wrapper.vm as any).tryTranscoding(0);
      expect((wrapper.vm as any).mediaUrl).toContain('?transcode=true');
    });

    it('covers handleMediaError in transcoding mode', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (wrapper.vm as any).isTranscodingMode = true;
      (wrapper.vm as any).handleMediaError();
      expect((wrapper.vm as any).error).toBe('Failed to display media file.');
    });

    it('covers countInfo branches', async () => {
      mockRefs.isSlideshowActive.value = false;
      const wrapper = mount(MediaDisplay);
      expect((wrapper.vm as any).countInfo).toBe('\u00A0');

      mockRefs.isSlideshowActive.value = true;
      mockRefs.displayedMediaFiles.value = [
        { name: '1.jpg', path: '1.jpg' },
        { name: '2.jpg', path: '2.jpg' },
      ];
      mockRefs.currentMediaIndex.value = 0;
      mockRefs.totalMediaInPool.value = 10;
      await wrapper.vm.$nextTick();
      expect((wrapper.vm as any).countInfo).toBe('1 / 10');
    });

    it('covers tryTranscoding requestId mismatch', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      await (wrapper.vm as any).tryTranscoding(0, -1);
      expect((wrapper.vm as any).isTranscodingMode).toBe(false);
    });

    it('covers setRating unrate branch', async () => {
      mockRefs.currentMediaItem.value = {
        name: 't.jpg',
        path: '/t.jpg',
        rating: 5,
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const controls = wrapper.findComponent(MediaControls);
      await controls.vm.$emit('set-rating', 5);
      expect(mockRefs.currentMediaItem.value.rating).toBe(0);
    });

    it('covers loadMediaUrl null currentMediaItem', async () => {
      mockRefs.currentMediaItem.value = null;
      const wrapper = mount(MediaDisplay);
      await flushPromises();
      expect((wrapper.vm as any).mediaUrl).toBeNull();
    });

    it('covers loadMediaUrl videoElement cleanup fallback', async () => {
      mockRefs.currentMediaItem.value = { name: 't.jpg', path: '/t.jpg' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const mockVideo = {
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
      };
      (wrapper.vm as any).videoElement = mockVideo;
      (wrapper.vm as any).videoPlayerRef = null;

      mockRefs.currentMediaItem.value = { name: 't2.jpg', path: '/t2.jpg' };
      await flushPromises();
      expect(mockVideo.pause).toHaveBeenCalled();
    });

    it('covers handleBuffering while transcoding loading', async () => {
      const wrapper = mount(MediaDisplay);
      (wrapper.vm as any).isTranscodingLoading = true;
      (wrapper.vm as any).handleBuffering(true);
      expect((wrapper.vm as any).isBuffering).toBe(false);
    });

    it('covers openInVlc failure branch', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (api.openInVlc as Mock).mockResolvedValue({
        success: false,
        message: 'VLC Error',
      });
      await (wrapper.vm as any).openInVlc();
      expect((wrapper.vm as any).error).toBe('VLC Error');
    });

    it('covers handleMouseMove when video is paused', async () => {
      vi.useFakeTimers();
      const wrapper = mount(MediaDisplay);
      const mockVideo = {
        paused: true,
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
      };
      (wrapper.vm as any).videoElement = mockVideo;

      await wrapper.trigger('mousemove');
      vi.advanceTimersByTime(3500);
      expect((wrapper.vm as any).isControlsVisible).toBe(true);
      vi.useRealTimers();
    });

    it('covers handleVideoElementUpdate', async () => {
      const wrapper = mount(MediaDisplay);
      const mockVideo = document.createElement('video');
      (wrapper.vm as any).handleVideoElementUpdate(mockVideo);
      expect((wrapper.vm as any).videoElement).toBe(mockVideo);
    });

    it('covers request cancellation guards', async () => {
      mockRefs.currentMediaItem.value = { name: '1.jpg', path: '/1.jpg' };

      let resolveLoad1: (value: any) => void;
      const loadPromise1 = new Promise((resolve) => {
        resolveLoad1 = resolve;
      });
      (api.loadFileAsDataURL as Mock).mockReturnValueOnce(loadPromise1);

      const wrapperLoad = mount(MediaDisplay);
      expect(wrapperLoad.exists()).toBe(true);

      mockRefs.currentMediaItem.value = { name: '2.jpg', path: '/2.jpg' };
      (api.loadFileAsDataURL as Mock).mockResolvedValue({
        type: 'success',
        url: 'url2',
      });

      await flushPromises();

      resolveLoad1!({ type: 'success', url: 'url1' });
      await flushPromises();

      expect((wrapperLoad.vm as any).mediaUrl).toBe('url2');
    });

    it('covers loadMediaUrl error catch branch', async () => {
      mockRefs.currentMediaItem.value = { name: 'fail.jpg', path: '/fail.jpg' };
      (api.loadFileAsDataURL as Mock).mockRejectedValue(
        new Error('Load Error'),
      );

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect((wrapper.vm as any).error).toBe('Failed to load media file.');
      expect((wrapper.vm as any).mediaUrl).toBeNull();
    });

    it('covers currentVideoTime getter fallback', async () => {
      const wrapper = mount(MediaDisplay);
      (wrapper.vm as any).videoPlayerRef = null;
      expect((wrapper.vm as any).currentVideoTime).toBe(0);
    });

    it('covers currentMediaItem watch resumeSlideshowTimer branch', async () => {
      mockRefs.currentMediaItem.value = { name: 't.jpg', path: '/t.jpg' };
      mockRefs.playFullVideo.value = true;
      mockRefs.isTimerRunning.value = false;

      const wrapper = mount(MediaDisplay);
      expect(wrapper.exists()).toBe(true);
      await flushPromises();

      expect(slideshowMock.resumeSlideshowTimer).toHaveBeenCalled();
    });

    it('covers Try Transcoding button click', async () => {
      mockRefs.currentMediaItem.value = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      (wrapper.vm as any).isVideoSupported = false;
      (wrapper.vm as any).isTranscodingMode = false;
      await wrapper.vm.$nextTick();

      const btn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('Try Transcoding'));
      await btn?.trigger('click');
      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('covers smart timer checkboxes', async () => {
      const wrapper = mount(MediaDisplay);
      const inputs = wrapper.findAll('input[type="checkbox"]');

      await inputs[0].setValue(true);
      expect(mockRefs.playFullVideo.value).toBe(true);

      await inputs[1].setValue(true);
      expect(mockRefs.pauseTimerOnPlay.value).toBe(true);
    });
  });
});
