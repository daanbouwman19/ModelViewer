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
  }),
}));
vi.mock('../../../src/renderer/api');

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
  });

  const mountList = () => mount(AlbumsList);

  it('filters by minDuration', async () => {
    mockAppState.smartPlaylists.value = [
      { id: 1, name: 'Long', criteria: JSON.stringify({ minDuration: 60 }) },
    ];
    const items = [
      { file_path: '/short.mp4', duration: 10 },
      { file_path: '/long.mp4', duration: 100 },
    ];
    (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

    const wrapper = mountList();
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Long'))
      ?.trigger('click');

    expect(mockAppState.gridMediaFiles.value).toHaveLength(1);
    expect(mockAppState.gridMediaFiles.value[0].path).toBe('/long.mp4');
  });

  it('filters by minViews', async () => {
    mockAppState.smartPlaylists.value = [
      { id: 1, name: 'Popular', criteria: JSON.stringify({ minViews: 5 }) },
    ];
    const items = [
      { file_path: '/rare.mp4', view_count: 1 },
      { file_path: '/popular.mp4', view_count: 10 },
    ];
    (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

    const wrapper = mountList();
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Popular'))
      ?.trigger('click');

    expect(mockAppState.gridMediaFiles.value).toHaveLength(1);
    expect(mockAppState.gridMediaFiles.value[0].path).toBe('/popular.mp4');
  });

  it('filters by maxViews', async () => {
    mockAppState.smartPlaylists.value = [
      { id: 1, name: 'Unseen', criteria: JSON.stringify({ maxViews: 0 }) },
    ];
    const items = [
      { file_path: '/seen.mp4', view_count: 5 },
      { file_path: '/unseen.mp4', view_count: 0 },
    ];
    (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

    const wrapper = mountList();
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Unseen'))
      ?.trigger('click');

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
      { file_path: '/never.mp4', last_viewed: null }, // Never viewed (should verify logic. Code says if criteria exists, check diff. If never viewed, what?)
      // Current logic: if (!item.last_viewed) { /* keep match = true */ }
    ];
    (api.getAllMetadataAndStats as Mock).mockResolvedValue(items);

    const wrapper = mountList();
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Forgotten'))
      ?.trigger('click');

    // Recent should fail. Old should pass. Never should pass (based on code logic "keep match=true")
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
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Broken'))
      ?.trigger('click');

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error loading smart playlist',
      expect.any(Error),
    );
  });
});
