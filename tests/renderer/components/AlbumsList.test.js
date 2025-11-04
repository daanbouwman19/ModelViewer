import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import AlbumsList from '@/components/AlbumsList.vue';
import { useAppState } from '@/composables/useAppState.js';
import { useSlideshow } from '@/composables/useSlideshow.js';

// Mock the composables
vi.mock('@/composables/useAppState.js');
vi.mock('@/composables/useSlideshow.js');

describe('AlbumsList.vue', () => {
  let mockRefs;
  let toggleAlbumSelection;
  let startSlideshow;
  let startIndividualAlbumSlideshow;
  let toggleSlideshowTimer;

  beforeEach(() => {
    toggleAlbumSelection = vi.fn();
    startSlideshow = vi.fn();
    startIndividualAlbumSlideshow = vi.fn();
    toggleSlideshowTimer = vi.fn();

    mockRefs = {
      allAlbums: ref([
        { name: 'Album1', textures: ['tex1.jpg', 'tex2.jpg'] },
        { name: 'Album2', textures: ['tex3.jpg'] },
      ]),
      albumsSelectedForSlideshow: ref({
        Album1: true,
        Album2: false,
      }),
      timerDuration: ref(30),
      isTimerRunning: ref(false),
      isSourcesModalVisible: ref(false),
      // Add other refs for compatibility
      mediaFilter: ref('All'),
      currentMediaItem: ref(null),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(-1),
      isSlideshowActive: ref(false),
      supportedExtensions: ref({
        images: ['.jpg', '.png'],
        videos: ['.mp4'],
      }),
      globalMediaPoolForSelection: ref([]),
      totalMediaInPool: ref(0),
      slideshowTimerId: ref(null),
      mediaDirectories: ref([]),
      state: {},
      initializeApp: vi.fn(),
      resetState: vi.fn(),
      stopSlideshow: vi.fn(),
    };

    useAppState.mockReturnValue(mockRefs);

    useSlideshow.mockReturnValue({
      toggleAlbumSelection,
      startSlideshow,
      startIndividualAlbumSlideshow,
      toggleSlideshowTimer,
      setFilter: vi.fn(),
      prevMedia: vi.fn(),
      nextMedia: vi.fn(),
      reapplyFilter: vi.fn(),
      navigateMedia: vi.fn(),
      pickAndDisplayNextMediaItem: vi.fn(),
      filterMedia: vi.fn(),
      selectWeightedRandom: vi.fn(),
    });
  });

  it('should render albums list', () => {
    const wrapper = mount(AlbumsList);
    expect(wrapper.text()).toContain('Album1');
    expect(wrapper.text()).toContain('Album2');
  });

  it('should display album texture counts', () => {
    const wrapper = mount(AlbumsList);
    expect(wrapper.text()).toContain('(2)');
    expect(wrapper.text()).toContain('(1)');
  });

  it('should show loading message when no albums', () => {
    mockRefs.allAlbums.value = [];
    const wrapper = mount(AlbumsList);
    expect(wrapper.text()).toContain('Loading albums');
  });

  it('should render start slideshow button', () => {
    const wrapper = mount(AlbumsList);
    const button = wrapper.find('button');
    expect(button.text()).toBe('Start Slideshow');
  });

  it('should call startSlideshow when button clicked', async () => {
    const wrapper = mount(AlbumsList);
    const button = wrapper.findAll('button')[0];
    await button.trigger('click');
    expect(startSlideshow).toHaveBeenCalled();
  });

  it('should display timer controls', () => {
    const wrapper = mount(AlbumsList);
    const input = wrapper.find('input[type="number"]');
    expect(input.exists()).toBe(true);
    expect(input.element.value).toBe('30');
  });

  it('should call toggleSlideshowTimer when timer button clicked', async () => {
    const wrapper = mount(AlbumsList);
    const timerButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Play' || b.text() === 'Pause');
    await timerButton.trigger('click');
    expect(toggleSlideshowTimer).toHaveBeenCalled();
  });

  it('should show Pause when timer is running', () => {
    mockRefs.isTimerRunning.value = true;
    const wrapper = mount(AlbumsList);
    const timerButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Play' || b.text() === 'Pause');
    expect(timerButton.text()).toBe('Pause');
  });

  it('should show Play when timer is not running', () => {
    mockRefs.isTimerRunning.value = false;
    const wrapper = mount(AlbumsList);
    const timerButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Play' || b.text() === 'Pause');
    expect(timerButton.text()).toBe('Play');
  });

  it('should call toggleAlbumSelection when checkbox changed', async () => {
    const wrapper = mount(AlbumsList);
    const checkbox = wrapper.find('input[type="checkbox"]');
    await checkbox.trigger('change');
    expect(toggleAlbumSelection).toHaveBeenCalledWith('Album1');
  });

  it('should call startIndividualAlbumSlideshow when album clicked', async () => {
    const wrapper = mount(AlbumsList);
    const albumItem = wrapper.findAll('.album-item')[0];
    await albumItem.trigger('click');
    expect(startIndividualAlbumSlideshow).toHaveBeenCalledWith({
      name: 'Album1',
      textures: ['tex1.jpg', 'tex2.jpg'],
    });
  });

  it('should open sources modal when manage sources button clicked', async () => {
    const wrapper = mount(AlbumsList);
    const manageButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Manage Sources');
    await manageButton.trigger('click');
    expect(mockRefs.isSourcesModalVisible.value).toBe(true);
  });

  it('should highlight selected albums', () => {
    const wrapper = mount(AlbumsList);
    const albumItems = wrapper.findAll('.album-item');
    expect(albumItems[0].classes()).toContain('selected-for-slideshow');
    expect(albumItems[1].classes()).not.toContain('selected-for-slideshow');
  });

  it('should check checkbox for selected albums', () => {
    const wrapper = mount(AlbumsList);
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    expect(checkboxes[0].element.checked).toBe(true);
    expect(checkboxes[1].element.checked).toBe(false);
  });

  it('should update timerDuration when input changes', async () => {
    const wrapper = mount(AlbumsList);
    const input = wrapper.find('input[type="number"]');
    await input.setValue(60);
    expect(mockRefs.timerDuration.value).toBe(60);
  });
});
