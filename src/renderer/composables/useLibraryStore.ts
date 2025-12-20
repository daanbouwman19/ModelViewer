import { reactive, computed, watch, toRefs } from 'vue';
import type {
  Album,
  MediaDirectory,
  SmartPlaylist,
  MediaFile,
} from '../../core/types';
import { api } from '../api';

interface LibraryState {
  isScanning: boolean;
  allAlbums: Album[];
  mediaDirectories: MediaDirectory[];
  supportedExtensions: { images: string[]; videos: string[]; all: string[] };
  smartPlaylists: SmartPlaylist[];
  albumsSelectedForSlideshow: { [albumName: string]: boolean };
  globalMediaPoolForSelection: MediaFile[];
  totalMediaInPool: number;
}

const state = reactive<LibraryState>({
  isScanning: false,
  allAlbums: [],
  mediaDirectories: [],
  supportedExtensions: { images: [], videos: [], all: [] },
  smartPlaylists: [],
  albumsSelectedForSlideshow: {},
  globalMediaPoolForSelection: [],
  totalMediaInPool: 0,
});

// Computed sets for O(1) extension lookups
const imageExtensionsSet = computed(
  () => new Set(state.supportedExtensions.images),
);
const videoExtensionsSet = computed(
  () => new Set(state.supportedExtensions.videos),
);

let isWatcherInitialized = false;

export const setupPersistenceWatcher = () => {
  if (isWatcherInitialized) return;
  watch(
    () => state.albumsSelectedForSlideshow,
    (newSelection: { [key: string]: boolean }) => {
      try {
        localStorage.setItem('albumSelection', JSON.stringify(newSelection));
      } catch (e) {
        console.error('Failed to save album selection:', e);
      }
    },
    { deep: true },
  );
  isWatcherInitialized = true;
};

// Start watcher immediately
setupPersistenceWatcher();

export function useLibraryStore() {
  const selectAllAlbumsRecursively = (albums: Album[]) => {
    const traverse = (list: Album[]) => {
      for (const album of list) {
        state.albumsSelectedForSlideshow[album.id] = true;
        if (album.children) {
          traverse(album.children);
        }
      }
    };
    traverse(albums);
  };

  const loadInitialData = async () => {
    try {
      state.allAlbums = await api.getAlbumsWithViewCounts();
      state.mediaDirectories = await api.getMediaDirectories();
      state.smartPlaylists = await api.getSmartPlaylists();
      state.supportedExtensions = await api.getSupportedExtensions();

      const savedSelection = localStorage.getItem('albumSelection');
      if (savedSelection) {
        try {
          state.albumsSelectedForSlideshow = JSON.parse(savedSelection);
        } catch (e) {
          console.error('Failed to parse saved album selection:', e);
          selectAllAlbumsRecursively(state.allAlbums);
        }
      } else {
        selectAllAlbumsRecursively(state.allAlbums);
      }
    } catch (error) {
      console.error('[useLibraryStore] Error during initial load:', error);
    }
  };

  return {
    ...toRefs(state),
    state, // Expose raw state for direct access if needed
    imageExtensionsSet,
    videoExtensionsSet,
    loadInitialData,
    selectAllAlbumsRecursively,
    resetLibraryState: () => {
      state.globalMediaPoolForSelection = [];
      state.albumsSelectedForSlideshow = {};
    },
  };
}
