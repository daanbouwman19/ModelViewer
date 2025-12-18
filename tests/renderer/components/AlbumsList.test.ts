import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import AlbumsList from '../../../src/renderer/components/AlbumsList.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { api } from '../../../src/renderer/api';
import { useSlideshow } from '../../../src/renderer/composables/useSlideshow';

// Mocks
vi.mock('../../../src/renderer/composables/useAppState');
vi.mock('../../../src/renderer/composables/useSlideshow', () => ({
  useSlideshow: vi.fn(() => ({
    toggleAlbumSelection: vi.fn(),
    startSlideshow: vi.fn(),
    startIndividualAlbumSlideshow: vi.fn(),
    toggleSlideshowTimer: vi.fn(),
    openAlbumInGrid: vi.fn(),
  })),
}));
vi.mock('../../../src/renderer/api', () => ({
  api: {
    getAllMetadataAndStats: vi.fn(),
    deleteSmartPlaylist: vi.fn(),
    getSmartPlaylists: vi.fn(),
  },
}));

// Mock window.confirm
window.confirm = vi.fn().mockReturnValue(true);

describe('AlbumsList', () => {
  let mockAppState: any;
  let mockSlideshow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAppState = {
      allAlbums: ref([
        {
          id: '1',
          name: 'Album 1',
          children: [],
          textures: [{ name: 'img1.jpg', path: '/path/img1.jpg' }],
        },
      ]),
      albumsSelectedForSlideshow: ref({}),
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
    mockSlideshow = (useSlideshow as Mock)();
    (api.getSmartPlaylists as Mock).mockResolvedValue([]);
  });

  const mountList = () => mount(AlbumsList);

  it('renders albums correctly', () => {
    const wrapper = mountList();
    expect(wrapper.text()).toContain('Album 1');
  });

  it('opens sources modal on button click', async () => {
    const wrapper = mountList();
    const buttons = wrapper.findAll('button');
    const button = buttons.find((b) => b.text().includes('Manage Sources'));
    expect(button).toBeDefined();
    await button!.trigger('click');
    expect(mockAppState.isSourcesModalVisible.value).toBe(true);
  });

  it('opens smart playlist modal on button click', async () => {
    const wrapper = mountList();
    const buttons = wrapper.findAll('button');
    const button = buttons.find((b) => b.text().includes('+ Playlist'));
    expect(button).toBeDefined();
    await button!.trigger('click');
    expect(mockAppState.isSmartPlaylistModalVisible.value).toBe(true);
    expect(mockAppState.playlistToEdit.value).toBe(null);
  });

  it('toggles timer running state', async () => {
    const wrapper = mountList();
    const buttons = wrapper.findAll('button');
    // The button displays current interval (e.g. 5s) if timer is not running
    // or 'Pause' if running.
    // In initial mock state, isTimerRunning is false and timerDuration is 5.
    // So text should be '5s'.
    // Or we can find by class 'glass-button-sm' + click handler logic.
    // The timer button toggles 'Play'/'Pause'.
    // Let's look for the button with 'timer-button' class
    const button = buttons.find((b) =>
      b.attributes('class')?.includes('timer-button'),
    );
    expect(button).toBeDefined();
    await button!.trigger('click');
    expect(mockSlideshow.toggleSlideshowTimer).toHaveBeenCalled();
  });

  describe('Smart Playlist Filtering', () => {
    it('filters by minDuration', async () => {
      mockAppState.smartPlaylists.value = [
        { id: 1, name: 'Long', criteria: JSON.stringify({ minDuration: 60 }) },
      ];
      mockAppState.allAlbums.value = [
        {
          name: 'Root',
          children: [],
          textures: [
            { path: '/short.mp4', name: 'short.mp4' },
            { path: '/long.mp4', name: 'long.mp4' },
          ],
        },
      ];

      const items = [
        { file_path: '/short.mp4', duration: 10 },
        { file_path: '/long.mp4', duration: 100 },
      ];
      (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

      const wrapper = mountList();
      await nextTick(); // Wait for watcher/render

      const playlistItem = wrapper
        .findAll('li')
        .find((li) => li.text().includes('Long'));
      expect(playlistItem).toBeDefined();
      const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
      expect(gridBtn.exists()).toBe(true);
      await gridBtn.trigger('click');

      await new Promise(process.nextTick);

      expect(mockAppState.gridMediaFiles.value).toHaveLength(1);
      expect(mockAppState.gridMediaFiles.value[0].path).toBe('/long.mp4');
    });

    it('filters by minViews', async () => {
      mockAppState.smartPlaylists.value = [
        { id: 1, name: 'Popular', criteria: JSON.stringify({ minViews: 5 }) },
      ];
      mockAppState.allAlbums.value = [
        {
          name: 'Root',
          children: [],
          textures: [
            { path: '/rare.mp4', name: 'rare.mp4' },
            { path: '/popular.mp4', name: 'popular.mp4' },
          ],
        },
      ];
      const items = [
        { file_path: '/rare.mp4', view_count: 1 },
        { file_path: '/popular.mp4', view_count: 10 },
      ];
      (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

      const wrapper = mountList();
      await nextTick();
      const playlistItem = wrapper
        .findAll('li')
        .find((li) => li.text().includes('Popular'));
      const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
      await gridBtn.trigger('click');

      await new Promise(process.nextTick);

      expect(mockAppState.gridMediaFiles.value).toHaveLength(1);
      expect(mockAppState.gridMediaFiles.value[0].path).toBe('/popular.mp4');
    });

    it('filters by maxViews', async () => {
      mockAppState.smartPlaylists.value = [
        { id: 1, name: 'Unseen', criteria: JSON.stringify({ maxViews: 0 }) },
      ];
      mockAppState.allAlbums.value = [
        {
          name: 'Root',
          children: [],
          textures: [
            { path: '/seen.mp4', name: 'seen.mp4' },
            { path: '/unseen.mp4', name: 'unseen.mp4' },
          ],
        },
      ];
      const items = [
        { file_path: '/seen.mp4', view_count: 5 },
        { file_path: '/unseen.mp4', view_count: 0 },
      ];
      (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

      const wrapper = mountList();
      await nextTick();
      const playlistItem = wrapper
        .findAll('li')
        .find((li) => li.text().includes('Unseen'));
      const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
      await gridBtn.trigger('click');

      await new Promise(process.nextTick);

      expect(mockAppState.gridMediaFiles.value).toHaveLength(1);
      expect(mockAppState.gridMediaFiles.value[0].path).toBe('/unseen.mp4');
    });

    it('filters by minDaysSinceView', async () => {
      mockAppState.smartPlaylists.value = [
        {
          id: 1,
          name: 'Forgotten',
          criteria: JSON.stringify({ minDaysSinceView: 30 }),
        },
      ];
      mockAppState.allAlbums.value = [
        {
          name: 'Root',
          children: [],
          textures: [
            { path: '/recent.mp4', name: 'recent.mp4' },
            { path: '/old.mp4', name: 'old.mp4' },
            { path: '/never.mp4', name: 'never.mp4' },
          ],
        },
      ];
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const items = [
        {
          file_path: '/recent.mp4',
          last_viewed: new Date(now - oneDay).toISOString(),
        },
        {
          file_path: '/old.mp4',
          last_viewed: new Date(now - 100 * oneDay).toISOString(),
        },
        { file_path: '/never.mp4', last_viewed: null },
      ];
      (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

      const wrapper = mountList();
      await nextTick();
      const playlistItem = wrapper
        .findAll('li')
        .find((li) => li.text().includes('Forgotten'));
      const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
      await gridBtn.trigger('click');

      await new Promise(process.nextTick);

      expect(mockAppState.gridMediaFiles.value.map((f: any) => f.path)).toEqual(
        ['/old.mp4', '/never.mp4'],
      );
    });

    it('handles error in filtering', async () => {
      mockAppState.smartPlaylists.value = [
        { id: 1, name: 'Broken', criteria: '{}' },
      ];
      (api.getAllMetadataAndStats as Mock).mockRejectedValue(
        new Error('API Fail'),
      );
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const wrapper = mountList();
      await nextTick();
      const playlistItem = wrapper
        .findAll('li')
        .find((li) => li.text().includes('Broken'));
      const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
      await gridBtn.trigger('click');

      await new Promise(process.nextTick);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error opening playlist grid',
        expect.any(Error),
      );
    });
  });

  it('edits smart playlist', async () => {
    const playlist = { id: 1, name: 'Edit Me', criteria: '{}' };
    mockAppState.smartPlaylists.value = [playlist];
    const wrapper = mountList();
    await nextTick();

    const playlistItem = wrapper
      .findAll('li')
      .find((li) => li.text().includes('Edit Me'));
    const editBtn = playlistItem!.find('button[title="Edit"]');
    await editBtn.trigger('click');

    expect(mockAppState.playlistToEdit.value).toEqual(playlist);
    expect(mockAppState.isSmartPlaylistModalVisible.value).toBe(true);
  });

  it('deletes smart playlist', async () => {
    const playlist = { id: 1, name: 'Delete Me', criteria: '{}' };
    mockAppState.smartPlaylists.value = [playlist];
    const wrapper = mountList();
    await nextTick();

    // Mock window.confirm
    window.confirm = vi.fn().mockReturnValue(true);

    const playlistItem = wrapper
      .findAll('li')
      .find((li) => li.text().includes('Delete Me'));
    const deleteBtn = playlistItem!.find('button[title="Delete"]');
    await deleteBtn.trigger('click');

    expect(api.deleteSmartPlaylist).toHaveBeenCalledWith(1);
    expect(api.getSmartPlaylists).toHaveBeenCalled();
  });
});
