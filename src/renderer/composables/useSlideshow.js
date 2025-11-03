import { useAppState } from './useAppState';

export function useSlideshow() {
  // Get state inside the function to ensure we have the same reactive reference
  const { state, stopSlideshow } = useAppState();

  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  /**
   * Filters a list of media files based on the current filter setting.
   * @param {Array<Object>} mediaFiles - The array of media files to filter.
   * @returns {Array<Object>} The filtered array of media files.
   */
  const filterMedia = (mediaFiles) => {
    if (!mediaFiles || mediaFiles.length === 0) return [];

    const filter = state.mediaFilter;

    const videoExtensions = state.supportedExtensions.videos;
    const imageExtensions = state.supportedExtensions.images;

    return mediaFiles.filter((file) => {
      // Guard against missing path property
      if (!file || !file.path || typeof file.path !== 'string') {
        console.warn('Skipping media item with invalid or missing path:', file);
        return false;
      }

      if (filter === 'All') return true;

      const ext = file.path.toLowerCase().slice(file.path.lastIndexOf('.'));
      if (filter === 'Videos') {
        return videoExtensions.includes(ext);
      } else if (filter === 'Images') {
        return imageExtensions.includes(ext);
      }
      return true; // Should not be reached with controlled filters
    });
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

  const navigateMedia = async (direction) => {
    if (state.isSlideshowActive) {
      // In slideshow mode, handle navigation with history
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
          await pickAndDisplayNextMediaItem();
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
    }
  };

  const pickAndDisplayNextMediaItem = async () => {
    if (state.globalMediaPoolForSelection.length === 0) {
      console.warn('No media files available in the pool.');
      return;
    }

    // Apply the current media filter to the pool
    const filteredPool = filterMedia(state.globalMediaPoolForSelection);

    // Update the total pool size
    state.totalMediaInPool = filteredPool.length;

    if (filteredPool.length === 0) {
      console.warn('Media pool is empty or no media matches the filter.');
      return;
    }

    // Exclude recently shown items to avoid quick repeats (e.g., last 5 items)
    const historySize = Math.min(5, state.displayedMediaFiles.length);
    const historyPaths = state.displayedMediaFiles
      .slice(-historySize)
      .map((item) => item.path);

    // Use weighted random selection to prioritize less-viewed items
    const selectedMedia = selectWeightedRandom(filteredPool, historyPaths);

    if (!selectedMedia) {
      console.warn(
        'Could not select a new distinct global media item. Pool might be exhausted or too small.',
      );
      // Fallback: pick any item if weighted selection fails
      if (filteredPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * filteredPool.length);
        const fallbackMedia = filteredPool[randomIndex];
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

  const toggleModelSelection = (modelName) => {
    const currentValue = state.modelsSelectedForSlideshow[modelName] || false;
    state.modelsSelectedForSlideshow[modelName] = !currentValue;
    console.log(`Toggled selection for ${modelName}: ${!currentValue}`);
  };

  const startSlideshow = async () => {
    // Build the media pool from all selected models
    state.globalMediaPoolForSelection = [];

    console.log('Starting slideshow...');
    console.log(
      'Models selected for slideshow:',
      state.modelsSelectedForSlideshow,
    );

    // Guard against null/undefined allModels
    if (!state.allModels || !Array.isArray(state.allModels)) {
      console.warn('No models available (allModels is null or not an array).');
      return;
    }

    state.allModels.forEach((model) => {
      if (state.modelsSelectedForSlideshow[model.name]) {
        console.log(
          `Adding model to pool: ${model.name} (${model.textures.length} files)`,
        );
        state.globalMediaPoolForSelection.push(...model.textures);
      }
    });

    console.log(
      `Total media files in pool: ${state.globalMediaPoolForSelection.length}`,
    );

    if (state.globalMediaPoolForSelection.length === 0) {
      console.warn('No models selected for slideshow.');
      return;
    }

    state.isSlideshowActive = true;
    state.displayedMediaFiles = [];
    state.currentMediaIndex = -1;

    // Display the first random media
    await pickAndDisplayNextMediaItem();
  };

  const startIndividualModelSlideshow = async (model) => {
    console.log(`Starting individual slideshow for: ${model.name}`);

    // Guard against null/undefined textures
    if (!model.textures || !Array.isArray(model.textures)) {
      console.warn('Model has no valid textures array.');
      return;
    }

    // Build pool from just this one model
    state.globalMediaPoolForSelection = [...model.textures];

    if (state.globalMediaPoolForSelection.length === 0) {
      console.warn('No media files in this model.');
      return;
    }

    state.isSlideshowActive = true;
    state.displayedMediaFiles = [];
    state.currentMediaIndex = -1;

    // Display the first random media
    await pickAndDisplayNextMediaItem();
  };

  const reapplyFilter = async () => {
    // If in slideshow mode, rebuild the pool and pick a new item
    if (state.isSlideshowActive) {
      // Rebuild the media pool with current selections
      state.globalMediaPoolForSelection = [];
      state.allModels.forEach((model) => {
        if (state.modelsSelectedForSlideshow[model.name]) {
          state.globalMediaPoolForSelection.push(...model.textures);
        }
      });

      // Clear history and pick a new item with the new filter
      state.displayedMediaFiles = [];
      state.currentMediaIndex = -1;
      await pickAndDisplayNextMediaItem();
      return;
    }
  };

  return {
    navigateMedia,
    toggleSlideshowTimer,
    toggleModelSelection,
    startSlideshow,
    startIndividualModelSlideshow,
    pickAndDisplayNextMediaItem,
    reapplyFilter,
    // Export for testing
    filterMedia,
    selectWeightedRandom,
    shuffleArray,
  };
}
