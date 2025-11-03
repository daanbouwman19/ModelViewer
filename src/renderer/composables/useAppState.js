import { reactive, toRefs, computed } from 'vue';

const state = reactive({
  // The complete list of all models discovered by the media scanner
  allModels: [],

  // A map where keys are model names and values are booleans indicating if
  // the model is selected for the slideshow (all selected by default)
  modelsSelectedForSlideshow: {},

  // A flat array of all media files from all selected models
  globalMediaPoolForSelection: [],

  // Total number of media items in the filtered pool
  totalMediaInPool: 0,

  // Represents the current "playlist"
  displayedMediaFiles: [],

  // The specific media item that is currently being displayed on the screen
  currentMediaItem: null,

  // The index of currentMediaItem within the displayedMediaFiles array
  currentMediaIndex: -1,

  // A flag that is true when the slideshow is active
  isSlideshowActive: false,

  // Holds the timer ID returned by setInterval for the slideshow
  slideshowTimerId: null,

  // The duration in seconds for the slideshow timer
  timerDuration: 5,

  // Whether the slideshow timer is running
  isTimerRunning: false,

  // Current media filter: 'All', 'Images', 'Videos'
  mediaFilter: 'All',

  // Whether the sources modal is visible
  isSourcesModalVisible: false,

  // List of media directories
  mediaDirectories: [],

  // Supported file extensions from main process
  supportedExtensions: {
    images: [],
    videos: [],
    all: [],
  },
});

export function useAppState() {
  const initializeApp = async () => {
    try {
      if (!window.electronAPI) {
        throw new Error('electronAPI is not available');
      }
      state.allModels = await window.electronAPI.getModelsWithViewCounts();
      state.mediaDirectories = await window.electronAPI.getMediaDirectories();
      state.supportedExtensions =
        await window.electronAPI.getSupportedExtensions();

      // Select all models by default
      state.allModels.forEach((model) => {
        state.modelsSelectedForSlideshow[model.name] = true;
      });
    } catch (error) {
      console.error('[useAppState] Error during initial load:', error);
    }
  };

  const resetState = () => {
    state.isSlideshowActive = false;
    state.displayedMediaFiles = [];
    state.currentMediaIndex = -1;
    state.currentMediaItem = null;
    state.globalMediaPoolForSelection = [];
  };

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
