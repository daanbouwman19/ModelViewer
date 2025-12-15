import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import AlbumsList from '../../../src/renderer/components/AlbumsList.vue';
import { useAppState } from '../../../src/renderer/composables/useAppState';
import { api } from '../../../src/renderer/api';

vi.mock('../../../src/renderer/composables/useAppState');
vi.mock('../../../src/renderer/composables/useSlideshow', () => ({
  useSlideshow: () => ({
    toggleAlbumSelection: vi.fn(),
    startSlideshow: vi.fn(),
    startIndividualAlbumSlideshow: vi.fn(),
    toggleSlideshowTimer: vi.fn(),
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

describe('AlbumsList Coverage (Filtering)', () => {
  let mockAppState: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAppState = {
      allAlbums: ref([]),
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
    (api.getSmartPlaylists as Mock).mockResolvedValue([]);
  });

  const mountList = () => mount(AlbumsList);

  it('filters by minDuration', async () => {
    mockAppState.smartPlaylists.value = [
      { id: 1, name: 'Long', criteria: JSON.stringify({ minDuration: 60 }) },
    ];
    // Mock allAlbums to contain the files we are testing
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
    await wrapper.vm.$nextTick();

    // We expect the button to start the slideshow now
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Long'))
      ?.trigger('click');

    // The new logic calls startIndividualAlbumSlideshow instead of setting gridMediaFiles directly
    // Wait, the test expects gridMediaFiles to be set.
    // BUT I changed the click handler to handleSmartPlaylistSlideshow.
    // The "Grid" button calls handleSmartPlaylistGrid.
    // The test was clicking the main button (playlist name).
    // So now it should call startIndividualAlbumSlideshow.

    // I should check if the mock startIndividualAlbumSlideshow was called with the correct filtered items.
    // However, to keep the test asserting gridMediaFiles, I should click the GRID button.

    const playlistItem = wrapper
      .findAll('li')
      .find((li) => li.text().includes('Long'));
    const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
    await gridBtn.trigger('click');

    // Wait for async operations
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
    await wrapper.vm.$nextTick();
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
    await wrapper.vm.$nextTick();
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
      }, // 1 day ago
      {
        file_path: '/old.mp4',
        last_viewed: new Date(now - 100 * oneDay).toISOString(),
      }, // 100 days ago
      { file_path: '/never.mp4', last_viewed: null },
    ];
    (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

    const wrapper = mountList();
    await wrapper.vm.$nextTick();
    const playlistItem = wrapper
      .findAll('li')
      .find((li) => li.text().includes('Forgotten'));
    const gridBtn = playlistItem!.find('button[title="Open in Grid"]');
    await gridBtn.trigger('click');

    await new Promise(process.nextTick);

    expect(mockAppState.gridMediaFiles.value.map((f: any) => f.path)).toEqual([
      '/old.mp4',
      '/never.mp4',
    ]);
  });

  it('handles error in filtering', async () => {
    mockAppState.smartPlaylists.value = [
      { id: 1, name: 'Broken', criteria: '{}' },
    ];
    (api.getAllMetadataAndStats as Mock).mockRejectedValue(
      new Error('API Fail'),
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mountList();
    await wrapper.vm.$nextTick();
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
