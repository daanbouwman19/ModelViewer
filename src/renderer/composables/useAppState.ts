/**
 * @file Manages the global reactive state for the Vue application.
 * This composable provides a centralized state object and functions to modify it,
 * ensuring that all components share a single source of truth.
 */
import { reactive, toRefs } from 'vue';
import type { Album, MediaFile } from '../../main/media-scanner';
import type { ElectronAPI } from '../../preload/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface AppState {
  isScanning: boolean;
  allAlbums: Album[];
  albumsSelectedForSlideshow: { [albumName: string]: boolean };
  globalMediaPoolForSelection: MediaFile[];
  totalMediaInPool: number;
  displayedMediaFiles: MediaFile[];
  currentMediaItem: MediaFile | null;
  currentMediaIndex: number;
  isSlideshowActive: boolean;
  slideshowTimerId: NodeJS.Timeout | null;
  timerDuration: number;
  isTimerRunning: boolean;
  timerProgress: number;
  playFullVideo: boolean;
  pauseTimerOnPlay: boolean;
  mediaFilter: 'All' | 'Images' | 'Videos';
  viewMode: 'player' | 'grid';
  gridMediaFiles: MediaFile[];
  isSourcesModalVisible: boolean;
  mediaDirectories: { path: string; isActive: boolean }[];
  supportedExtensions: { images: string[]; videos: string[]; all: string[] };
  chameleonMode: boolean;
  chameleonColor: string; // Hex color string
}

const state = reactive<AppState>({
  isScanning: false,
  allAlbums: [],
  albumsSelectedForSlideshow: {},
  globalMediaPoolForSelection: [],
  totalMediaInPool: 0,
  displayedMediaFiles: [],
  currentMediaItem: null,
  currentMediaIndex: -1,
  isSlideshowActive: false,
  slideshowTimerId: null,
  timerDuration: 5,
  isTimerRunning: false,
  timerProgress: 0,
  playFullVideo: false,
  pauseTimerOnPlay: false,
  mediaFilter: 'All',
  viewMode: 'player', // 'player' or 'grid'
  gridMediaFiles: [],
  isSourcesModalVisible: false,
  mediaDirectories: [],
  supportedExtensions: {
    images: [],
    videos: [],
    all: [],
  },
  chameleonMode: false,
  chameleonColor: '#000000',
});

/**
 * A Vue composable that provides access to the global application state and related actions.
 */
export function useAppState() {
  /**
   * Initializes the application state by fetching data from the main process.
   * This includes loading albums, media directories, and supported extensions.
   */
  const initializeApp = async () => {
    try {
      if (!window.electronAPI) {
        throw new Error('electronAPI is not available');
      }
      state.allAlbums = await window.electronAPI.getAlbumsWithViewCounts();
      state.mediaDirectories = await window.electronAPI.getMediaDirectories();
      state.supportedExtensions =
        await window.electronAPI.getSupportedExtensions();

      state.allAlbums.forEach((album) => {
        state.albumsSelectedForSlideshow[album.name] = true;
      });
    } catch (error) {
      console.error('[useAppState] Error during initial load:', error);
    }
  };

  /**
   * Resets the slideshow-related state to its initial values.
   */
  const resetState = () => {
    state.isSlideshowActive = false;
    state.displayedMediaFiles = [];
    state.currentMediaIndex = -1;
    state.currentMediaItem = null;
    state.globalMediaPoolForSelection = [];
  };

  /**
   * Stops the slideshow timer if it is running.
   */
  const stopSlideshow = () => {
    if (state.slideshowTimerId) {
      clearInterval(state.slideshowTimerId);
      state.slideshowTimerId = null;
    }
    state.isTimerRunning = false;
  };

  return {
    ...toRefs(state),
    state,
    initializeApp,
    resetState,
    stopSlideshow,
  };
}
