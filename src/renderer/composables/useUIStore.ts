import { reactive, toRefs } from 'vue';
import type { SmartPlaylist, MediaFile } from '../../core/types';

interface UIState {
  mediaFilter: 'All' | 'Images' | 'Videos';
  viewMode: 'player' | 'grid';
  gridMediaFiles: MediaFile[];
  isSourcesModalVisible: boolean;
  isSmartPlaylistModalVisible: boolean;
  playlistToEdit: SmartPlaylist | null;
}

const state = reactive<UIState>({
  mediaFilter: 'All',
  viewMode: 'player',
  gridMediaFiles: [],
  isSourcesModalVisible: false,
  isSmartPlaylistModalVisible: false,
  playlistToEdit: null,
});

export function useUIStore() {
  return {
    ...toRefs(state),
    state,
  };
}
