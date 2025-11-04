/**
 * @file Manages the global reactive state for the Vue application.
 * This composable provides a centralized state object and functions to modify it,
 * ensuring that all components share a single source of truth.
 * @requires vue
 */
import { reactive, toRefs } from 'vue';

/**
 * @typedef {import('../../main/media-scanner.js').Album} Album
 * @typedef {import('../../main/media-scanner.js').MediaFile} MediaFile
 */

/**
 * The reactive state object that holds the application's global state.
 * @type {object}
 * @property {Album[]} allAlbums - The complete list of all albums discovered by the media scanner.
 * @property {{[albumName: string]: boolean}} albumsSelectedForSlideshow - A map indicating if an album is selected for the slideshow.
 * @property {MediaFile[]} globalMediaPoolForSelection - A flat array of all media files from all selected albums.
 * @property {number} totalMediaInPool - The total number of media items in the filtered pool.
 * @property {MediaFile[]} displayedMediaFiles - The history of media files that have been displayed in the current slideshow.
 * @property {MediaFile | null} currentMediaItem - The media item currently being displayed.
 * @property {number} currentMediaIndex - The index of the current media item within the displayedMediaFiles array.
 * @property {boolean} isSlideshowActive - A flag indicating if the slideshow mode is active.
 * @property {NodeJS.Timeout | null} slideshowTimerId - The ID of the slideshow timer.
 * @property {number} timerDuration - The duration in seconds for the slideshow timer.
 * @property {boolean} isTimerRunning - A flag indicating if the slideshow timer is running.
 * @property {'All' | 'Images' | 'Videos'} mediaFilter - The current filter for media types.
 * @property {boolean} isSourcesModalVisible - A flag to control the visibility of the sources modal.
 * @property {boolean} isScanning - A flag to indicate when the media scanner is running.
 * @property {{path: string, isActive: boolean}[]} mediaDirectories - The list of configured media directories.
 * @property {{images: string[], videos: string[], all: string[]}} supportedExtensions - The supported file extensions.
 */
const state = reactive({
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
  isSourcesModalVisible: false,
  mediaDirectories: [],
  supportedExtensions: {
    images: [],
    videos: [],
    all: [],
  },
});

/**
 * A Vue composable that provides access to the global application state and related actions.
 * @returns {{
 *   state: object,
 *   initializeApp: () => Promise<void>,
 *   resetState: () => void,
 *   stopSlideshow: () => void,
 *   ...toRefs<object>
 * }}
 */
export function useAppState() {
  /**
   * Initializes the application state by fetching data from the main process.
   * This includes loading albums, media directories, and supported extensions.
   * @returns {Promise<void>}
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
