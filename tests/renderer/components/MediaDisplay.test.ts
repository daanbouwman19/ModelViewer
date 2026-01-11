import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, reactive, toRefs } from 'vue';
import MediaDisplay from '@/components/MediaDisplay.vue';
import VideoPlayer from '@/components/VideoPlayer.vue';
import MediaControls from '@/components/MediaControls.vue';
import { useSlideshow } from '@/composables/useSlideshow';
import { useLibraryStore } from '@/composables/useLibraryStore';
import { usePlayerStore } from '@/composables/usePlayerStore';
import { useUIStore } from '@/composables/useUIStore';
import { api } from '@/api';

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
vi.mock('@/composables/useSlideshow');
vi.mock('@/composables/useLibraryStore');
vi.mock('@/composables/usePlayerStore');
vi.mock('@/composables/useUIStore');

describe('MediaDisplay.vue', () => {
  let mockLibraryState: any;
  let mockPlayerState: any;
  let mockUIState: any;
  let slideshowMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLibraryState = reactive({
      mediaDirectories: [{ path: '/test' }], // Not empty to avoid Welcome screen
      totalMediaInPool: 0,
      imageExtensionsSet: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']),
    });

    mockPlayerState = reactive({
      currentMediaItem: null,
      displayedMediaFiles: [],
      currentMediaIndex: 0,
      isSlideshowActive: false,
      playFullVideo: false,
      pauseTimerOnPlay: false,
      isTimerRunning: false,
      mainVideoElement: null,
    });

    mockUIState = {
      mediaFilter: ref('All'),
      viewMode: ref('player'),
      isControlsVisible: ref(true),
      isSourcesModalVisible: ref(false),
      isSidebarVisible: ref(true),
    };

    (useLibraryStore as Mock).mockReturnValue({
      state: mockLibraryState,
      ...toRefs(mockLibraryState),
    });

    (usePlayerStore as Mock).mockReturnValue({
      state: mockPlayerState,
      ...toRefs(mockPlayerState),
    });

    (useUIStore as Mock).mockReturnValue({
      state: mockUIState,
      ...toRefs(mockUIState),
    });

    slideshowMock = {
      navigateMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      pauseSlideshowTimer: vi.fn(),
      resumeSlideshowTimer: vi.fn(),
      toggleSlideshowTimer: vi.fn(),
    };
    (useSlideshow as Mock).mockReturnValue(slideshowMock);

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
      mockPlayerState.currentMediaItem = {
        name: 'test.jpg',
        path: '/test.jpg',
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect(api.loadFileAsDataURL).toHaveBeenCalledWith('/test.jpg');
      expect((wrapper.vm as any).mediaUrl).toBe('test-url');
    });

    it('retains old mediaUrl when switching between media types to allow smooth transition', async () => {
      // Start with a video file
      mockPlayerState.currentMediaItem = {
        name: 'video.mp4',
        path: '/video.mp4',
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      // Verify video URL is loaded
      expect((wrapper.vm as any).mediaUrl).toBe('test-url');

      // Set up a spy that will check mediaUrl state when the API is called
      let mediaUrlDuringApiCall: string | null | undefined;
      (api.loadFileAsDataURL as Mock).mockImplementation(async () => {
        // Capture the mediaUrl value at the moment the API is called
        mediaUrlDuringApiCall = (wrapper.vm as any).mediaUrl;
        return { type: 'success', url: 'image-url' };
      });

      // Switch to an image file
      mockPlayerState.currentMediaItem = {
        name: 'image.jpg',
        path: '/image.jpg',
      };
      await flushPromises();

      // Verify that mediaUrl was NOT null when the API was called
      // It should retain the old value (test-url) to allow smooth transition
      expect(mediaUrlDuringApiCall).toBe('test-url');

      // Verify the image URL is now set after loading completes
      expect((wrapper.vm as any).mediaUrl).toBe('image-url');
    });

    it('handles load error', async () => {
      mockPlayerState.currentMediaItem = {
        name: 'test.jpg',
        path: '/test.jpg',
      };
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
      mockPlayerState.currentMediaItem = {
        name: 't.jpg',
        path: '/t.jpg',
        rating: 0,
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const controls = wrapper.findComponent(MediaControls);
      await controls.vm.$emit('set-rating', 4);

      expect(api.setRating).toHaveBeenCalledWith('/t.jpg', 4);
      expect(mockPlayerState.currentMediaItem.rating).toBe(4);
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
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
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
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();
      expect(wrapper.exists()).toBe(true);

      const event = new KeyboardEvent('keydown', { code: 'Space' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('covers setRating error branch', async () => {
      mockPlayerState.currentMediaItem = { name: 't.jpg', path: '/t.jpg' };
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
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
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
      mockPlayerState.currentMediaItem = { name: 't.mov', path: '/t.mov' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      expect((wrapper.vm as any).isTranscodingMode).toBe(true);
    });

    it('covers handleVideoPlay and handleVideoPause effects on timer', async () => {
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
      mockPlayerState.isTimerRunning = true;
      mockPlayerState.playFullVideo = true;

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const videoPlayer = wrapper.findComponent(VideoPlayer);
      expect(videoPlayer.exists()).toBe(true);
      await videoPlayer.vm.$emit('play');
      expect(slideshowMock.pauseSlideshowTimer).toHaveBeenCalled();

      mockPlayerState.isTimerRunning = false;
      mockPlayerState.pauseTimerOnPlay = true;
      mockPlayerState.playFullVideo = false;

      await videoPlayer.vm.$emit('pause');
      expect(slideshowMock.resumeSlideshowTimer).toHaveBeenCalled();
    });

    it('covers tryTranscoding URL with query params', async () => {
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
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
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
      const generator = (p: string) => `http://localhost/stream/${p}`;
      (api.getVideoStreamUrlGenerator as Mock).mockResolvedValue(generator);
      (api.getVideoMetadata as Mock).mockResolvedValue({ duration: 100 });

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      await (wrapper.vm as any).tryTranscoding(0);
      expect((wrapper.vm as any).mediaUrl).toContain('?transcode=true');
    });

    it('covers handleMediaError in transcoding mode', async () => {
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (wrapper.vm as any).isTranscodingMode = true;
      (wrapper.vm as any).handleMediaError();
      expect((wrapper.vm as any).error).toBe('Failed to display media file.');
    });

    it('covers tryTranscoding requestId mismatch', async () => {
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      await (wrapper.vm as any).tryTranscoding(0, -1);
      expect((wrapper.vm as any).isTranscodingMode).toBe(false);
    });

    it('covers setRating unrate branch', async () => {
      mockPlayerState.currentMediaItem = {
        name: 't.jpg',
        path: '/t.jpg',
        rating: 5,
      };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const controls = wrapper.findComponent(MediaControls);
      await controls.vm.$emit('set-rating', 5);
      expect(mockPlayerState.currentMediaItem.rating).toBe(0);
    });

    it('covers loadMediaUrl null currentMediaItem', async () => {
      mockPlayerState.currentMediaItem = null;
      const wrapper = mount(MediaDisplay);
      await flushPromises();
      expect((wrapper.vm as any).mediaUrl).toBeNull();
    });

    it('covers loadMediaUrl videoElement cleanup fallback', async () => {
      mockPlayerState.currentMediaItem = { name: 't.jpg', path: '/t.jpg' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const mockVideo = {
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
      };
      (wrapper.vm as any).videoElement = mockVideo;
      (wrapper.vm as any).videoPlayerRef = null;

      mockPlayerState.currentMediaItem = { name: 't2.jpg', path: '/t2.jpg' };
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
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
      const wrapper = mount(MediaDisplay);
      await flushPromises();

      (api.openInVlc as Mock).mockResolvedValue({
        success: false,
        message: 'VLC Error',
      });
      await (wrapper.vm as any).openInVlc();
      expect((wrapper.vm as any).error).toBe('VLC Error');
    });

    it('covers handleVideoElementUpdate', async () => {
      const wrapper = mount(MediaDisplay);
      const mockVideo = document.createElement('video');
      (wrapper.vm as any).handleVideoElementUpdate(mockVideo);
      expect((wrapper.vm as any).videoElement).toBe(mockVideo);
    });

    it('covers request cancellation guards', async () => {
      mockPlayerState.currentMediaItem = { name: '1.jpg', path: '/1.jpg' };

      let resolveLoad1: (value: any) => void;
      const loadPromise1 = new Promise((resolve) => {
        resolveLoad1 = resolve;
      });
      (api.loadFileAsDataURL as Mock).mockReturnValueOnce(loadPromise1);

      const wrapperLoad = mount(MediaDisplay);
      expect(wrapperLoad.exists()).toBe(true);

      mockPlayerState.currentMediaItem = { name: '2.jpg', path: '/2.jpg' };
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
      mockPlayerState.currentMediaItem = {
        name: 'fail.jpg',
        path: '/fail.jpg',
      };
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
      mockPlayerState.currentMediaItem = { name: 't.jpg', path: '/t.jpg' };
      mockPlayerState.playFullVideo = true;
      mockPlayerState.isTimerRunning = false;

      const wrapper = mount(MediaDisplay);
      expect(wrapper.exists()).toBe(true);
      await flushPromises();

      expect(slideshowMock.resumeSlideshowTimer).toHaveBeenCalled();
    });

    it('covers Try Transcoding button click', async () => {
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
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

    it('does NOT resume timer when video is paused due to navigation (loading)', async () => {
      mockPlayerState.currentMediaItem = { name: 't.mp4', path: '/t.mp4' };
      mockPlayerState.isTimerRunning = false;
      mockPlayerState.pauseTimerOnPlay = true;
      mockPlayerState.playFullVideo = false;

      const wrapper = mount(MediaDisplay);
      await flushPromises();

      const videoPlayer = wrapper.findComponent(VideoPlayer);
      expect(videoPlayer.exists()).toBe(true);

      // Simulate loading state (navigation start)
      (wrapper.vm as any).isLoading = true;

      // Simulate pause event from VideoPlayer
      await videoPlayer.vm.$emit('pause');

      // Should NOT have resumed
      expect(slideshowMock.resumeSlideshowTimer).not.toHaveBeenCalled();
    });
  });
});
