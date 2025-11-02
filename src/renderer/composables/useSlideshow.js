import { useAppState } from './useAppState';

const { state, stopSlideshow } = useAppState();

export function useSlideshow() {
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const prepareMediaListForIndividualView = (model) => {
    if (!model || !model.textures || model.textures.length === 0) {
      return [];
    }

    state.originalMediaFilesForIndividualView = [...model.textures];

    // Check if random mode is enabled for this model
    const isRandomEnabled = state.modelRandomModeSettings[model.name] || false;

    if (isRandomEnabled) {
      return shuffleArray(model.textures);
    }

    return [...model.textures];
  };

  const navigateMedia = async (direction) => {
    if (state.isGlobalSlideshowActive) {
      // In global mode, always pick a new random media
      if (direction > 0) {
        await pickAndDisplayNextGlobalMediaItem();
      } else {
        // Navigate backward in history
        if (state.currentMediaIndex > 0) {
          state.currentMediaIndex--;
          state.currentMediaItem =
            state.displayedMediaFiles[state.currentMediaIndex];
          await displayMedia(state.currentMediaItem);
        }
      }
    } else {
      // Individual model mode
      if (state.displayedMediaFiles.length === 0) return;

      state.currentMediaIndex += direction;

      // Wrap around
      if (state.currentMediaIndex < 0) {
        state.currentMediaIndex = state.displayedMediaFiles.length - 1;
      } else if (state.currentMediaIndex >= state.displayedMediaFiles.length) {
        state.currentMediaIndex = 0;
      }

      state.currentMediaItem =
        state.displayedMediaFiles[state.currentMediaIndex];
      await displayMedia(state.currentMediaItem);
    }
  };

  const pickAndDisplayNextGlobalMediaItem = async () => {
    if (state.globalMediaPoolForSelection.length === 0) {
      console.warn('No media files available in the global pool.');
      return;
    }

    // Pick a random media file
    const randomIndex = Math.floor(
      Math.random() * state.globalMediaPoolForSelection.length,
    );
    const selectedMedia = state.globalMediaPoolForSelection[randomIndex];

    // Add to history
    state.displayedMediaFiles.push(selectedMedia);
    state.currentMediaIndex = state.displayedMediaFiles.length - 1;
    state.currentMediaItem = selectedMedia;

    // Limit history to prevent memory issues
    if (state.displayedMediaFiles.length > 100) {
      state.displayedMediaFiles.shift();
      state.currentMediaIndex--;
    }

    await displayMedia(selectedMedia);
  };

  const displayMedia = async (mediaItem) => {
    if (!mediaItem) return;

    try {
      await window.electronAPI.recordMediaView(mediaItem.path);
      // The actual display is handled by the MediaDisplay component watching currentMediaItem
    } catch (error) {
      console.error('Error displaying media:', error);
    }
  };

  const toggleSlideshowTimer = () => {
    if (state.slideshowTimerId) {
      // Stop the timer
      stopSlideshow();
    } else {
      // Start the timer
      const duration = state.timerDuration * 1000;
      state.slideshowTimerId = setInterval(() => {
        navigateMedia(1);
      }, duration);
      state.isTimerRunning = true;
    }
  };

  const activateGlobalSlideshow = async () => {
    // Build the global media pool
    state.globalMediaPoolForSelection = [];

    state.allModels.forEach((model) => {
      if (state.modelsSelectedForGlobal[model.name]) {
        state.globalMediaPoolForSelection.push(...model.textures);
      }
    });

    if (state.globalMediaPoolForSelection.length === 0) {
      console.warn('No models selected for global slideshow.');
      return;
    }

    state.isGlobalSlideshowActive = true;
    state.displayedMediaFiles = [];
    state.currentMediaIndex = -1;

    // Display the first media
    await pickAndDisplayNextGlobalMediaItem();
  };

  const selectModel = async (model) => {
    stopSlideshow();
    state.isGlobalSlideshowActive = false;
    state.currentSelectedModelForIndividualView = model;
    state.displayedMediaFiles = prepareMediaListForIndividualView(model);
    state.currentMediaIndex = 0;

    if (state.displayedMediaFiles.length > 0) {
      state.currentMediaItem = state.displayedMediaFiles[0];
      await displayMedia(state.currentMediaItem);
    } else {
      state.currentMediaItem = null;
    }
  };

  const toggleRandomMode = (modelName) => {
    const currentValue = state.modelRandomModeSettings[modelName] || false;
    state.modelRandomModeSettings[modelName] = !currentValue;

    // If this model is currently selected, re-prepare the media list
    if (state.currentSelectedModelForIndividualView?.name === modelName) {
      const model = state.currentSelectedModelForIndividualView;
      state.displayedMediaFiles = prepareMediaListForIndividualView(model);

      // Reset to first item
      if (state.displayedMediaFiles.length > 0) {
        state.currentMediaIndex = 0;
        state.currentMediaItem = state.displayedMediaFiles[0];
        displayMedia(state.currentMediaItem);
      }
    }
  };

  const toggleGlobalSelection = (modelName) => {
    const currentValue = state.modelsSelectedForGlobal[modelName] || false;
    state.modelsSelectedForGlobal[modelName] = !currentValue;
  };

  return {
    navigateMedia,
    toggleSlideshowTimer,
    activateGlobalSlideshow,
    selectModel,
    toggleRandomMode,
    toggleGlobalSelection,
    pickAndDisplayNextGlobalMediaItem,
    prepareMediaListForIndividualView,
  };
}

// Export standalone functions for use in App.vue
export const { navigateMedia, toggleSlideshowTimer } = useSlideshow();
