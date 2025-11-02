import { reactive, toRefs, computed } from 'vue';

const state = reactive({
  // The complete list of all models discovered by the media scanner
  allModels: [],

  // The model object that is currently selected for individual viewing
  currentSelectedModelForIndividualView: null,

  // The original, unsorted list of media files for the currently selected individual model
  originalMediaFilesForIndividualView: [],

  // A flat array of all media files from all models that are currently selected
  globalMediaPoolForSelection: [],

  // Represents the current "playlist"
  displayedMediaFiles: [],

  // The specific media item that is currently being displayed on the screen
  currentMediaItem: null,

  // The index of currentMediaItem within the displayedMediaFiles array
  currentMediaIndex: -1,

  // A map where keys are model names and values are booleans indicating if
  // random playback mode is enabled for that model's individual slideshow
  modelRandomModeSettings: {},

  // A map where keys are model names and values are booleans indicating if
  // the model is included in the global slideshow
  modelsSelectedForGlobal: {},

  // A flag that is true when the global slideshow is active
  isGlobalSlideshowActive: false,

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
});

export function useAppState() {
  const initializeApp = async () => {
    try {
      if (!window.electronAPI) {
        throw new Error('electronAPI is not available');
      }
      state.allModels = await window.electronAPI.getModelsWithViewCounts();
      state.mediaDirectories = await window.electronAPI.getMediaDirectories();
    } catch (error) {
      console.error('[useAppState] Error during initial load:', error);
    }
  };

  const resetState = () => {
    state.currentSelectedModelForIndividualView = null;
    state.isGlobalSlideshowActive = false;
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

  const getFilteredMediaFiles = computed(() => {
    if (!state.displayedMediaFiles.length) return [];

    if (state.mediaFilter === 'All') {
      return state.displayedMediaFiles;
    }

    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

    return state.displayedMediaFiles.filter((file) => {
      const ext = file.path.toLowerCase().slice(file.path.lastIndexOf('.'));
      if (state.mediaFilter === 'Videos') {
        return videoExtensions.includes(ext);
      } else if (state.mediaFilter === 'Images') {
        return imageExtensions.includes(ext);
      }
      return true;
    });
  });

  return {
    ...toRefs(state),
    state,
    initializeApp,
    resetState,
    stopSlideshow,
    getFilteredMediaFiles,
  };
}
