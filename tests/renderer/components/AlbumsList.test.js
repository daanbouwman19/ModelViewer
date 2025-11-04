import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import AlbumsList from '../../../src/renderer/components/AlbumsList.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { collectTexturesRecursive } from '../../../src/renderer/utils/albumUtils';

// --- New Mocking Strategy ---
const mockToggleAlbumSelection = vi.fn();
const mockStartSlideshow = vi.fn();
const mockStartIndividualAlbumSlideshow = vi.fn();
const mockToggleSlideshowTimer = vi.fn();

vi.mock('../../../src/renderer/composables/useSlideshow', () => ({
  useSlideshow: () => ({
    toggleAlbumSelection: mockToggleAlbumSelection,
    startSlideshow: mockStartSlideshow,
    startIndividualAlbumSlideshow: mockStartIndividualAlbumSlideshow,
    toggleSlideshowTimer: mockToggleSlideshowTimer,
  }),
}));

vi.mock('../../../src/renderer/composables/useAppState');
// --- End New Mocking Strategy ---

const mockAlbums = [
  {
    name: 'Album1',
    textures: [{ name: 't1.jpg', path: '/t1.jpg' }],
    children: [
      {
        name: 'SubAlbum1',
        textures: [{ name: 'st1.jpg', path: '/st1.jpg' }],
        children: [],
      },
    ],
  },
  {
    name: 'Album2',
    textures: [{ name: 't2.jpg', path: '/t2.jpg' }],
    children: [],
  },
];

describe('AlbumsList.vue', () => {
  let mockAppState;

  beforeEach(() => {
    vi.resetAllMocks();

    mockAppState = {
      allAlbums: ref(mockAlbums),
      albumsSelectedForSlideshow: ref({ Album1: true }),
      timerDuration: ref(5),
      isTimerRunning: ref(false),
      isSourcesModalVisible: ref(false),
    };

    useAppState.mockReturnValue(mockAppState);
  });

  it('renders AlbumTree components for each root album', () => {
    const wrapper = mount(AlbumsList);
    const albumTrees = wrapper.findAllComponents({ name: 'AlbumTree' });
    expect(albumTrees.length).toBe(2);
    expect(albumTrees[0].props('album')).toEqual(mockAlbums[0]);
    expect(albumTrees[1].props('album')).toEqual(mockAlbums[1]);
  });

  it('calls startSlideshow when the global start button is clicked', async () => {
    const wrapper = mount(AlbumsList);
    await wrapper.vm.$nextTick();
    const startButton = wrapper.find('[data-testid="start-slideshow-button"]');
    await startButton.trigger('click');
    expect(mockStartSlideshow).toHaveBeenCalled();
  });

  it('opens the sources modal when "Manage Sources" is clicked', async () => {
    const wrapper = mount(AlbumsList);
    const manageButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Manage Sources'));
    await manageButton.trigger('click');
    expect(mockAppState.isSourcesModalVisible.value).toBe(true);
  });

  it('handles the albumClick event from AlbumTree', async () => {
    const wrapper = mount(AlbumsList);
    const albumTree = wrapper.findComponent({ name: 'AlbumTree' });

    albumTree.vm.$emit('albumClick', mockAlbums[0]);
    await wrapper.vm.$nextTick();

    expect(mockStartIndividualAlbumSlideshow).toHaveBeenCalled();
    const expectedTextures = collectTexturesRecursive(mockAlbums[0]);
    expect(mockStartIndividualAlbumSlideshow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Album1',
        textures: expectedTextures,
      }),
    );
  });

  it('selects all children when a partially selected parent is toggled', async () => {
    // Set initial state to partially selected
    mockAppState.albumsSelectedForSlideshow.value = { Album1: true };
    const wrapper = mount(AlbumsList);
    const albumTree = wrapper.findComponent({ name: 'AlbumTree' });

    albumTree.vm.$emit('toggleSelection', mockAlbums[0]);
    await wrapper.vm.$nextTick();

    expect(mockToggleAlbumSelection).toHaveBeenCalledWith('Album1', true);
    expect(mockToggleAlbumSelection).toHaveBeenCalledWith('SubAlbum1', true);
  });

  it('deselects all children when a fully selected parent is toggled', async () => {
    // Set initial state to fully selected
    mockAppState.albumsSelectedForSlideshow.value = {
      Album1: true,
      SubAlbum1: true,
    };
    const wrapper = mount(AlbumsList);
    const albumTree = wrapper.findComponent({ name: 'AlbumTree' });

    albumTree.vm.$emit('toggleSelection', mockAlbums[0]);
    await wrapper.vm.$nextTick();

    expect(mockToggleAlbumSelection).toHaveBeenCalledWith('Album1', false);
    expect(mockToggleAlbumSelection).toHaveBeenCalledWith('SubAlbum1', false);
  });
});
