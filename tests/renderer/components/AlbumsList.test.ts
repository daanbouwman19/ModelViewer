import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, type Ref } from 'vue';
import AlbumsList from '../../../src/renderer/components/AlbumsList.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { collectTexturesRecursive } from '../../../src/renderer/utils/albumUtils';

// --- New Mocking Strategy ---
import { api } from '../../../src/renderer/api';

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
    openAlbumInGrid: vi.fn(),
  }),
}));

vi.mock('../../../src/renderer/api', () => ({
  api: {
    getAllMetadataAndStats: vi.fn(),
    deleteSmartPlaylist: vi.fn(),
    getSmartPlaylists: vi.fn(),
  },
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
  let mockAppState: {
    allAlbums: Ref<typeof mockAlbums>;
    albumsSelectedForSlideshow: Ref<Record<string, boolean>>;
    timerDuration: Ref<number>;
    isTimerRunning: Ref<boolean>;
    isSourcesModalVisible: Ref<boolean>;
    playFullVideo: Ref<boolean>;
    pauseTimerOnPlay: Ref<boolean>;
    smartPlaylists: Ref<any[]>;
    gridMediaFiles: Ref<any[]>;
    viewMode: Ref<string>;
    isSmartPlaylistModalVisible: Ref<boolean>;
    timerProgress: Ref<number>;
    playlistToEdit: Ref<any>;
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockAppState = {
      allAlbums: ref(mockAlbums),
      albumsSelectedForSlideshow: ref({ Album1: true }),
      timerDuration: ref(5),
      isTimerRunning: ref(false),
      isSourcesModalVisible: ref(false),
      isSmartPlaylistModalVisible: ref(false),
      playFullVideo: ref(false),
      pauseTimerOnPlay: ref(false),
      smartPlaylists: ref([]),
      gridMediaFiles: ref([]),
      viewMode: ref('player'),
      timerProgress: ref(0),
      playlistToEdit: ref(null),
    };

    (useAppState as Mock).mockReturnValue(mockAppState);
    (api.getSmartPlaylists as Mock).mockResolvedValue([]);
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
    await manageButton!.trigger('click');
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

    albumTree.vm.$emit('toggleSelection', {
      album: mockAlbums[0],
      recursive: true,
    });
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

    albumTree.vm.$emit('toggleSelection', {
      album: mockAlbums[0],
      recursive: true,
    });
    await wrapper.vm.$nextTick();

    expect(mockToggleAlbumSelection).toHaveBeenCalledWith('Album1', false);
    expect(mockToggleAlbumSelection).toHaveBeenCalledWith('SubAlbum1', false);
  });

  it('toggles slideshow timer when timer button is clicked', async () => {
    const wrapper = mount(AlbumsList);
    const timerButton = wrapper.find('.timer-button');
    await timerButton.trigger('click');
    expect(mockToggleSlideshowTimer).toHaveBeenCalled();
  });

  describe('Smart Playlists', () => {
    it('opens smart playlist modal', async () => {
      const wrapper = mount(AlbumsList);
      const btn = wrapper
        .findAll('button')
        .find((b) => b.text().includes('+ Playlist'));
      await btn?.trigger('click');
      expect(mockAppState.isSmartPlaylistModalVisible.value).toBe(true);
    });

    it('renders smart playlists', async () => {
      mockAppState.smartPlaylists.value = [
        { id: 1, name: 'My List', criteria: '{}' },
      ];
      const wrapper = mount(AlbumsList);
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain('My List');
    });

    it('handles playlist click and filtering', async () => {
      mockAppState.smartPlaylists.value = [
        {
          id: 1,
          name: 'Rated 5',
          criteria: JSON.stringify({ minRating: 5 }),
        },
      ];
      // Mock allAlbums to contain valid files
      mockAppState.allAlbums.value = [
        {
          name: 'Root',
          children: [],
          textures: [
            { path: '/file1.jpg', name: 'file1.jpg' },
            { path: '/file2.jpg', name: 'file2.jpg' },
          ],
        },
      ];

      const mockItems = [
        { file_path: '/file1.jpg', rating: 5, view_count: 0 },
        { file_path: '/file2.jpg', rating: 3, view_count: 10 },
      ];
      (api.getAllMetadataAndStats as Mock).mockResolvedValue(mockItems);

      const wrapper = mount(AlbumsList);
      await wrapper.vm.$nextTick();

      // Find the smart playlist item first to ensure we click the correct Grid button
      const playlistItem = wrapper
        .findAll('li')
        .find((li) => li.text().includes('Rated 5'));
      const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
      await gridBtn.trigger('click');

      await new Promise(process.nextTick);

      expect(api.getAllMetadataAndStats).toHaveBeenCalled();
      // Should filter to only file1
      expect(mockAppState.gridMediaFiles.value).toHaveLength(1);
      expect(mockAppState.gridMediaFiles.value[0].path).toBe('/file1.jpg');
      expect(mockAppState.viewMode.value).toBe('grid');
    });

    it('deletes playlist upon confirmation', async () => {
      mockAppState.smartPlaylists.value = [
        { id: 1, name: 'Delete Me', criteria: '{}' },
      ];
      // Mock confirm
      global.confirm = vi.fn(() => true);
      (api.deleteSmartPlaylist as Mock).mockResolvedValue(undefined);
      (api.getSmartPlaylists as Mock).mockResolvedValue([]);

      const wrapper = mount(AlbumsList);
      await wrapper.vm.$nextTick();

      const trashBtn = wrapper.findAll('button[title="Delete"]')[0];
      await trashBtn?.trigger('click');

      expect(global.confirm).toHaveBeenCalled();
      expect(api.deleteSmartPlaylist).toHaveBeenCalledWith(1);
      expect(api.getSmartPlaylists).toHaveBeenCalled();
      expect(api.deleteSmartPlaylist).toHaveBeenCalledWith(1);
      expect(api.getSmartPlaylists).toHaveBeenCalled();
    });

    it('opens edit modal on edit click', async () => {
      const playlist = { id: 1, name: 'Edit Me', criteria: '{}' };
      mockAppState.smartPlaylists.value = [playlist];
      const wrapper = mount(AlbumsList);
      await wrapper.vm.$nextTick();

      const editBtn = wrapper.findAll('button[title="Edit"]')[0];
      // Edit button is hidden by default (opacity 0), but click should still work in test env
      // or we trigger the handler directly if visibility is blocked by CSS (but vue-test-utils usually ignores CSS visibility for interaction unless using strict visibility checks)
      await editBtn.trigger('click');

      expect(mockAppState.playlistToEdit.value).toEqual(playlist);
      expect(mockAppState.isSmartPlaylistModalVisible.value).toBe(true);
    });
  });
});
