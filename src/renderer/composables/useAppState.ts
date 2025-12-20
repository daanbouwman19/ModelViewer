import { reactive, toRefs } from 'vue';
import { useLibraryStore, setupPersistenceWatcher } from './useLibraryStore';
import { usePlayerStore } from './usePlayerStore';
import { useUIStore } from './useUIStore';
// Since AppState was defined in this file, we should keep the interface definition here to avoid breaking imports
// OR import the types from core/types if possible, but the interface was specific to this file.
// To avoid breakage, I will redefine the interface here or export 'any' temporarily?
// Better: keep the interface definition.

import type {
  Album,
  MediaFile,
  SmartPlaylist,
  MediaDirectory,
} from '../../core/types';

/**
 * Defines the shape of the global application state.
 * Kept for backward compatibility.
 */
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
  isSmartPlaylistModalVisible: boolean;
  smartPlaylists: SmartPlaylist[];
  playlistToEdit: SmartPlaylist | null;
  mediaDirectories: MediaDirectory[];
  supportedExtensions: { images: string[]; videos: string[]; all: string[] };
  mainVideoElement: HTMLVideoElement | null;
}

/**
 * A Vue composable that provides access to the global application state and related actions.
 * Acts as a facade over segmented stores.
 */
export function useAppState() {
  const libraryStore = useLibraryStore();
  const playerStore = usePlayerStore();
  const uiStore = useUIStore();

  // Create a reactive object that proxies to the underlying refs
  // Since the stores are singletons, this sets up the binding once per call,
  // but essentially they point to the same refs.
  const state = reactive({
    isScanning: libraryStore.isScanning,
    allAlbums: libraryStore.allAlbums,
    albumsSelectedForSlideshow: libraryStore.albumsSelectedForSlideshow,
    globalMediaPoolForSelection: libraryStore.globalMediaPoolForSelection,
    totalMediaInPool: libraryStore.totalMediaInPool,

    displayedMediaFiles: playerStore.displayedMediaFiles,
    currentMediaItem: playerStore.currentMediaItem,
    currentMediaIndex: playerStore.currentMediaIndex,
    isSlideshowActive: playerStore.isSlideshowActive,
    slideshowTimerId: playerStore.slideshowTimerId,
    timerDuration: playerStore.timerDuration,
    isTimerRunning: playerStore.isTimerRunning,
    timerProgress: playerStore.timerProgress,
    playFullVideo: playerStore.playFullVideo,
    pauseTimerOnPlay: playerStore.pauseTimerOnPlay,
    mainVideoElement: playerStore.mainVideoElement,

    mediaFilter: uiStore.mediaFilter,
    viewMode: uiStore.viewMode,
    gridMediaFiles: uiStore.gridMediaFiles,
    isSourcesModalVisible: uiStore.isSourcesModalVisible,
    isSmartPlaylistModalVisible: uiStore.isSmartPlaylistModalVisible,
    smartPlaylists: libraryStore.smartPlaylists, // Note: smartPlaylists is in LibraryStore
    playlistToEdit: uiStore.playlistToEdit,

    mediaDirectories: libraryStore.mediaDirectories,
    supportedExtensions: libraryStore.supportedExtensions,
  }) as AppState;

  const resetInternalState = () => {
    // legacy support for testing
    playerStore.resetPlayerState();
    // libraryStore doesn't have a reset, but maybe we don't need it or can add it if tests fail
  };

  return {
    ...toRefs(state),
    state,
    imageExtensionsSet: libraryStore.imageExtensionsSet,
    videoExtensionsSet: libraryStore.videoExtensionsSet,
    initializeApp: libraryStore.loadInitialData,
    resetState: () => {
      playerStore.resetPlayerState();
      libraryStore.resetLibraryState();
    },
    stopSlideshow: playerStore.stopSlideshow,
    resetInternalState,
    setupPersistenceWatcher,
  };
}

export { setupPersistenceWatcher };
