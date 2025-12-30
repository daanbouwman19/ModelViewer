import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import AlbumsList from '@/components/AlbumsList.vue';
import { useAppState } from '@/composables/useAppState';
import { useSlideshow } from '@/composables/useSlideshow';

// Mock the composables
vi.mock('@/composables/useAppState');
vi.mock('@/composables/useSlideshow');

// Mock child components
vi.mock('@/components/AlbumTree.vue', () => ({
  default: { template: '<li>AlbumTree Item</li>' },
}));

// Mock Icons - Inline the template to avoid hoisting issues
vi.mock('@/components/icons/CloseIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/PlayIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/PauseIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/SettingsIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/PlaylistAddIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/PlaylistIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/GridIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/EditIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));
vi.mock('@/components/icons/DeleteIcon.vue', () => ({
  default: { template: '<svg></svg>' },
}));

describe('AlbumsList Accessibility', () => {
  let mockRefs: any;

  beforeEach(() => {
    mockRefs = {
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      timerDuration: ref(5),
      isTimerRunning: ref(false),
      isSourcesModalVisible: ref(false),
      isSmartPlaylistModalVisible: ref(false),
      timerProgress: ref(0),
      smartPlaylists: ref([]),
      gridMediaFiles: ref([]),
      viewMode: ref('player'),
      playlistToEdit: ref(null),
      isSlideshowActive: ref(false),
    };

    (useAppState as Mock).mockReturnValue(mockRefs);

    (useSlideshow as Mock).mockReturnValue({
      toggleSlideshowTimer: vi.fn(),
      startSlideshow: vi.fn(),
      toggleAlbumSelection: vi.fn(),
      startIndividualAlbumSlideshow: vi.fn(),
    });
  });

  it('smart playlist items should be semantic buttons with accessible labels', async () => {
    mockRefs.smartPlaylists.value = [
      { id: 1, name: 'My Top Rated', criteria: '{}' },
    ];

    const wrapper = mount(AlbumsList);
    await wrapper.vm.$nextTick();

    // Now we have "Recently Played" as the first item in the list
    // so we need to find the specific playlist item we injected
    const items = wrapper.findAll('li div.group');
    // Assuming Recently Played is first, "My Top Rated" is second
    const playlistItem = items[1];
    expect(playlistItem.exists()).toBe(true);

    // This checks for the NEW structure
    // Before refactor, there are buttons for grid/edit/delete, but the MAIN item text is NOT a button.
    // The main button we add will have class 'grow'.
    const growButton = playlistItem.find('button.grow');

    expect(
      growButton.exists(),
      'Main playlist item should be a semantic button',
    ).toBe(true);
    expect(growButton.attributes('aria-label')).toBe('Play My Top Rated');
  });

  it('controls should be visible on focus within', async () => {
    mockRefs.smartPlaylists.value = [
      { id: 1, name: 'Test List', criteria: '{}' },
    ];

    const wrapper = mount(AlbumsList);
    await wrapper.vm.$nextTick();

    // Find the controls container (it has opacity-0 initially)
    // In current code: class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
    const controls = wrapper.find('.opacity-0');
    expect(controls.exists()).toBe(true);

    // Expect the new accessibility class
    expect(controls.classes()).toContain('group-focus-within:opacity-100');
  });
});
