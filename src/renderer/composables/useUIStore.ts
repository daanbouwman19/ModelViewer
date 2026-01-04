import { reactive, toRefs } from 'vue';
import type { SmartPlaylist, MediaFile } from '../../core/types';
import type { MediaFilter } from '../../core/constants';

interface UIState {
  mediaFilter: MediaFilter;
  viewMode: 'player' | 'grid';
  gridMediaFiles: MediaFile[];
  isSourcesModalVisible: boolean;
  isSmartPlaylistModalVisible: boolean;
  playlistToEdit: SmartPlaylist | null;
  isControlsVisible: boolean;
  isSidebarVisible: boolean;
}

const state = reactive<UIState>({
  mediaFilter: 'All',
  viewMode: 'player',
  gridMediaFiles: [],
  isSourcesModalVisible: false,
  isSmartPlaylistModalVisible: false,
  playlistToEdit: null,
  isControlsVisible: true,
  isSidebarVisible: true,
});

export function useUIStore() {
  return {
    ...toRefs(state),
    state,
  };
}
