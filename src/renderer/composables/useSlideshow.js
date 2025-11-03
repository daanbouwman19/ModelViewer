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

  /**
   * Selects a random item from a list, weighted by view count (less viewed items are more likely).
   * @param {Array<Object>} items - Array of media items, each with a 'path' and optional 'viewCount'.
   * @param {Array<string>} excludePaths - Array of paths to exclude from selection (e.g., recently shown).
   * @returns {Object | null} The selected media item or null if no item could be selected.
   */
  const selectWeightedRandom = (items, excludePaths = []) => {
    if (!items || items.length === 0) return null;

    let eligibleItems = items.filter(
      (item) => !excludePaths.includes(item.path),
    );

    if (eligibleItems.length === 0) {
      // Fallback: if all items were excluded (e.g., small pool and long history),
      // reset to the original pool to avoid getting stuck.
      console.warn(
        'Weighted random: All items were in excludePaths or pool is small. Considering all items again.',
      );
      eligibleItems = items;
    }
    if (eligibleItems.length === 0) return null; // Still no items

    // Calculate weights (inverse of view count + 1 to avoid division by zero and give new items higher weight)
    const weightedItems = eligibleItems.map((item) => ({
      ...item,
      weight: 1 / ((item.viewCount || 0) + 1),
    }));

    const totalWeight = weightedItems.reduce(
      (sum, item) => sum + item.weight,
      0,
    );

    if (totalWeight <= 1e-9) {
      // This can happen if all eligible items have such a high view count that the weight is near zero.
      // In this edge case, fall back to a uniform random selection from the eligible items.
      if (eligibleItems.length > 0) {
        console.warn(
          'Weighted random: Total weight is near zero. Using uniform random selection.',
        );
        return eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
      }
      return null; // No eligible items to select.
    }

    let random = Math.random() * totalWeight;
    for (const item of weightedItems) {
      random -= item.weight;
      if (random <= 0) return item;
    }

    // Fallback to last item if rounding errors occur
    return weightedItems[weightedItems.length - 1];
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
      // In global mode, handle navigation with history
      if (direction > 0) {
        // Check if we can navigate forward in history
        if (state.currentMediaIndex < state.displayedMediaFiles.length - 1) {
          // Navigate forward in history
          state.currentMediaIndex++;
          state.currentMediaItem =
            state.displayedMediaFiles[state.currentMediaIndex];
          await displayMedia(state.currentMediaItem);
        } else {
          // At the end of history, pick a new random media
          await pickAndDisplayNextGlobalMediaItem();
        }
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

    // Exclude recently shown items to avoid quick repeats (e.g., last 5 items)
    const historySize = Math.min(5, state.displayedMediaFiles.length);
    const historyPaths = state.displayedMediaFiles
      .slice(-historySize)
      .map((item) => item.path);

    // Use weighted random selection to prioritize less-viewed items
    const selectedMedia = selectWeightedRandom(
      state.globalMediaPoolForSelection,
      historyPaths,
    );

    if (!selectedMedia) {
      console.warn(
        'Could not select a new distinct global media item. Pool might be exhausted or too small.',
      );
      // Fallback: pick any item if weighted selection fails
      if (state.globalMediaPoolForSelection.length > 0) {
        const randomIndex = Math.floor(
          Math.random() * state.globalMediaPoolForSelection.length,
        );
        const fallbackMedia = state.globalMediaPoolForSelection[randomIndex];
        state.displayedMediaFiles.push(fallbackMedia);
        state.currentMediaIndex = state.displayedMediaFiles.length - 1;
        state.currentMediaItem = fallbackMedia;
      }
    } else {
      // Add to history
      state.displayedMediaFiles.push(selectedMedia);
      state.currentMediaIndex = state.displayedMediaFiles.length - 1;
      state.currentMediaItem = selectedMedia;
    }

    // Limit history to prevent memory issues
    if (state.displayedMediaFiles.length > 100) {
      state.displayedMediaFiles.shift();
      state.currentMediaIndex--;
    }

    await displayMedia(state.currentMediaItem);
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
