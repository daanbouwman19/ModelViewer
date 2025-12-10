import { reactive, toRefs } from 'vue';
import type { Album, MediaFile } from '../../core/types';
import { api } from '../api';

/**
 * Defines the shape of the global application state.
 */
export interface AppState {
  /** Indicates if a media scan is currently in progress. */
  isScanning: boolean;
  /** The full list of albums loaded from the database. */
  allAlbums: Album[];
  /** Map of album names to their selection state for the global slideshow. */
  albumsSelectedForSlideshow: { [albumName: string]: boolean };
  /** Flattened list of all media files from selected albums, available for the slideshow. */
  globalMediaPoolForSelection: MediaFile[];
  /** Count of media files in the current pool. */
  totalMediaInPool: number;
  /** History of media files displayed in the current session. */
  displayedMediaFiles: MediaFile[];
  /** The currently displayed media item. */
  currentMediaItem: MediaFile | null;
  /** Index of the current item in the displayedMediaFiles history array. */
  currentMediaIndex: number;
  /** Indicates if the slideshow mode is active. */
  isSlideshowActive: boolean;
  /** The ID of the current slideshow timer interval. */
  slideshowTimerId: NodeJS.Timeout | null;
  /** Duration in seconds for each slide. */
  timerDuration: number;
  /** Indicates if the slideshow timer is currently ticking. */
  isTimerRunning: boolean;
  /** Progress percentage of the current slide timer (0-100). */
  timerProgress: number;
  /** If true, videos play to completion regardless of timer. */
  playFullVideo: boolean;
  /** If true, the timer pauses when a video starts playing. */
  pauseTimerOnPlay: boolean;
  /** Filter criteria for media types ('All', 'Images', 'Videos'). */
  mediaFilter: 'All' | 'Images' | 'Videos';
  /** Current main view mode: 'player' for slideshow, 'grid' for thumbnails. */
  viewMode: 'player' | 'grid';
  /** List of media files to display in the grid view. */
  gridMediaFiles: MediaFile[];
  /** Controls visibility of the "Manage Sources" modal. */
  isSourcesModalVisible: boolean;
  /** List of configured media source directories. */
  mediaDirectories: { path: string; isActive: boolean }[];
  /** Supported file extensions grouped by type. */
  supportedExtensions: { images: string[]; videos: string[]; all: string[] };
  /** Reference to the main video DOM element for control purposes. */
  mainVideoElement: HTMLVideoElement | null;
}

/**
 * The reactive global state instance.
 */
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
  mainVideoElement: null,
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
      state.allAlbums = await api.getAlbumsWithViewCounts();
      state.mediaDirectories = await api.getMediaDirectories();
      state.supportedExtensions = await api.getSupportedExtensions();

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
