import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import ModelsList from '@/components/ModelsList.vue';
import { useAppState } from '@/composables/useAppState.js';
import { useSlideshow } from '@/composables/useSlideshow.js';

// Mock the composables
vi.mock('@/composables/useAppState.js');
vi.mock('@/composables/useSlideshow.js');

describe('ModelsList.vue', () => {
  let mockRefs;
  let toggleModelSelection;
  let startSlideshow;
  let startIndividualModelSlideshow;
  let toggleSlideshowTimer;

  beforeEach(() => {
    toggleModelSelection = vi.fn();
    startSlideshow = vi.fn();
    startIndividualModelSlideshow = vi.fn();
    toggleSlideshowTimer = vi.fn();

    mockRefs = {
      allModels: ref([
        { name: 'Model1', textures: ['tex1.jpg', 'tex2.jpg'] },
        { name: 'Model2', textures: ['tex3.jpg'] },
      ]),
      modelsSelectedForSlideshow: ref({
        Model1: true,
        Model2: false,
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
      toggleModelSelection,
      startSlideshow,
      startIndividualModelSlideshow,
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

  it('should render models list', () => {
    const wrapper = mount(ModelsList);
    expect(wrapper.text()).toContain('Model1');
    expect(wrapper.text()).toContain('Model2');
  });

  it('should display model texture counts', () => {
    const wrapper = mount(ModelsList);
    expect(wrapper.text()).toContain('(2)');
    expect(wrapper.text()).toContain('(1)');
  });

  it('should show loading message when no models', () => {
    mockRefs.allModels.value = [];
    const wrapper = mount(ModelsList);
    expect(wrapper.text()).toContain('Loading models');
  });

  it('should render start slideshow button', () => {
    const wrapper = mount(ModelsList);
    const button = wrapper.find('button');
    expect(button.text()).toBe('Start Slideshow');
  });

  it('should call startSlideshow when button clicked', async () => {
    const wrapper = mount(ModelsList);
    const button = wrapper.findAll('button')[0];
    await button.trigger('click');
    expect(startSlideshow).toHaveBeenCalled();
  });

  it('should display timer controls', () => {
    const wrapper = mount(ModelsList);
    const input = wrapper.find('input[type="number"]');
    expect(input.exists()).toBe(true);
    expect(input.element.value).toBe('30');
  });

  it('should call toggleSlideshowTimer when timer button clicked', async () => {
    const wrapper = mount(ModelsList);
    const timerButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Play' || b.text() === 'Pause');
    await timerButton.trigger('click');
    expect(toggleSlideshowTimer).toHaveBeenCalled();
  });

  it('should show Pause when timer is running', () => {
    mockRefs.isTimerRunning.value = true;
    const wrapper = mount(ModelsList);
    const timerButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Play' || b.text() === 'Pause');
    expect(timerButton.text()).toBe('Pause');
  });

  it('should show Play when timer is not running', () => {
    mockRefs.isTimerRunning.value = false;
    const wrapper = mount(ModelsList);
    const timerButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Play' || b.text() === 'Pause');
    expect(timerButton.text()).toBe('Play');
  });

  it('should call toggleModelSelection when checkbox changed', async () => {
    const wrapper = mount(ModelsList);
    const checkbox = wrapper.find('input[type="checkbox"]');
    await checkbox.trigger('change');
    expect(toggleModelSelection).toHaveBeenCalledWith('Model1');
  });

  it('should call startIndividualModelSlideshow when model clicked', async () => {
    const wrapper = mount(ModelsList);
    const modelItem = wrapper.findAll('.model-item')[0];
    await modelItem.trigger('click');
    expect(startIndividualModelSlideshow).toHaveBeenCalledWith({
      name: 'Model1',
      textures: ['tex1.jpg', 'tex2.jpg'],
    });
  });

  it('should open sources modal when manage sources button clicked', async () => {
    const wrapper = mount(ModelsList);
    const manageButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Manage Sources');
    await manageButton.trigger('click');
    expect(mockRefs.isSourcesModalVisible.value).toBe(true);
  });

  it('should highlight selected models', () => {
    const wrapper = mount(ModelsList);
    const modelItems = wrapper.findAll('.model-item');
    expect(modelItems[0].classes()).toContain('selected-for-slideshow');
    expect(modelItems[1].classes()).not.toContain('selected-for-slideshow');
  });

  it('should check checkbox for selected models', () => {
    const wrapper = mount(ModelsList);
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    expect(checkboxes[0].element.checked).toBe(true);
    expect(checkboxes[1].element.checked).toBe(false);
  });
});
