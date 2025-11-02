/**
 * @file Manages all slideshow logic, including playlist generation, timer control,
 * navigation, and media selection algorithms for both individual model and global modes.
 * @requires ./state.js
 * @requires ./ui-elements.js
 * @requires ./ui-updates.js
 */
import { state } from './state.js';
import { timerDurationInput, playPauseTimerButton } from './ui-elements.js';
import {
  displayCurrentMedia,
  clearMediaDisplay,
  updateNavButtons,
} from './ui-updates.js';

/**
 * Shuffles an array and returns a new shuffled array using the Fisher-Yates algorithm.
 * This function does not mutate the original array.
 * @param {Array<T>} array - The array to shuffle.
 * @returns {Array<T>} A new array containing the same elements in a random order.
 * @template T
 */
export function shuffleArray(array) {
  const shuffled = [...array]; // Create a new array to avoid mutating the original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap elements
  }
  return shuffled;
}

/**
 * Selects a random item from a list, weighted by view count (less viewed items are more likely).
 * @param {Array<Object>} items - Array of media items, each with a 'path' and optional 'viewCount'.
 * @param {Array<string>} excludePaths - Array of paths to exclude from selection (e.g., recently shown).
 * @returns {Object | null} The selected media item or null if no item could be selected.
 */
export function selectWeightedRandom(items, excludePaths = []) {
  if (!items || items.length === 0) return null;

  let eligibleItems = items.filter((item) => !excludePaths.includes(item.path));

  if (eligibleItems.length === 0) {
    // Fallback: if all items were excluded (e.g., small pool and long history),
    // reset to the original pool to avoid getting stuck.
    // This could be refined further, e.g., by only excluding the *current* item.
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

  const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);

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

  // Fallback (should ideally not be reached if logic is sound and totalWeight > 0)
  return eligibleItems.length > 0
    ? eligibleItems[eligibleItems.length - 1]
    : null;
}

/**
 * Filters a list of media files based on the current filter setting.
 * @param {Array<MediaFile>} mediaFiles - The array of media files to filter.
 * @returns {Array<MediaFile>} The filtered array of media files.
 */
function filterMedia(mediaFiles) {
  if (!mediaFiles) return [];
  const filter = state.currentMediaFilter;
  if (filter === 'All') return mediaFiles;

  const extensions =
    filter === 'Images'
      ? state.supportedExtensions.images
      : state.supportedExtensions.videos;
  return mediaFiles.filter((file) => {
    const dotIndex = file.path.lastIndexOf('.');
    const fileExt = dotIndex < 0 ? '' : file.path.slice(dotIndex).toLowerCase();
    return extensions.includes(fileExt);
  });
}

/**
 * Generates a playlist for an individual model.
 * @param {Array<Object>} mediaPool - The pool of media files for the model.
 * @param {boolean} isRandom - Whether to shuffle the playlist.
 * @returns {Array<Object>} The generated playlist.
 */
export function generatePlaylistForIndividualModel(mediaPool, isRandom) {
  if (!mediaPool || mediaPool.length === 0) return [];
  return isRandom ? shuffleArray(mediaPool) : [...mediaPool];
}

/**
 * Stops the slideshow timer.
 */
export function stopSlideshowTimer() {
  if (state.slideshowTimerId) clearInterval(state.slideshowTimerId);
  state.slideshowTimerId = null;
  state.isTimerPlaying = false;
  if (playPauseTimerButton) playPauseTimerButton.textContent = 'Play';
  console.log('Slideshow timer stopped.');
}

/**
 * Starts the slideshow timer with the duration specified in the input field.
 */
export function startSlideshowTimer() {
  stopSlideshowTimer(); // Clear any existing timer
  const durationSeconds = parseInt(timerDurationInput.value, 10);

  if (isNaN(durationSeconds) || durationSeconds < 1) {
    timerDurationInput.value = 5; // Reset to default if invalid
    // If it was playing and duration became invalid, effectively pause it.
    if (state.isTimerPlaying) {
      state.isTimerPlaying = false;
      if (playPauseTimerButton) playPauseTimerButton.textContent = 'Play';
    }
    console.warn('Invalid timer duration, reset to 5s. Timer not started.');
    return;
  }

  state.isTimerPlaying = true;
  if (playPauseTimerButton) playPauseTimerButton.textContent = 'Pause';
  state.slideshowTimerId = setInterval(() => {
    navigateMedia(1);
  }, durationSeconds * 1000);
  console.log(`Slideshow timer started for ${durationSeconds}s interval.`);
}

/**
 * Toggles the play/pause state of the slideshow timer.
 */
export function toggleSlideshowTimer() {
  // Determine the current pool of media based on slideshow mode
  const currentPool = state.isGlobalSlideshowActive
    ? state.globalMediaPoolForSelection
    : state.displayedMediaFiles;

  // Prevent starting timer if no media is available
  if (currentPool.length === 0 && !state.currentMediaItem) {
    console.log('Cannot start/toggle timer: No media loaded or pool is empty.');
    return;
  }
  // Specific checks for empty pools in different modes
  if (
    state.isGlobalSlideshowActive &&
    state.globalMediaPoolForSelection.length === 0
  ) {
    console.log(
      'Cannot start/toggle timer: Global slideshow active but pool is empty.',
    );
    return;
  }
  if (
    !state.isGlobalSlideshowActive &&
    state.currentSelectedModelForIndividualView &&
    state.displayedMediaFiles.length === 0
  ) {
    console.log(
      'Cannot start/toggle timer: Individual model selected but has no media.',
    );
    return;
  }

  if (state.isTimerPlaying) {
    stopSlideshowTimer();
  } else {
    startSlideshowTimer();
    // If no media is currently displayed but a slideshow is active, show the first item.
    if (
      !state.currentMediaItem &&
      (state.isGlobalSlideshowActive ||
        state.currentSelectedModelForIndividualView)
    ) {
      navigateMedia(0); // Navigate to the current/first item
    }
  }
}

/**
 * Picks the next media item for the global slideshow using weighted random selection
 * and updates the display.
 */
export function pickAndDisplayNextGlobalMediaItem() {
  const filteredPool = filterMedia(state.globalMediaPoolForSelection);
  if (filteredPool.length === 0) {
    clearMediaDisplay(
      'Global media pool is empty or no media matches the filter.',
    );
    updateNavButtons();
    return;
  }

  // Exclude recently shown items to avoid quick repeats (e.g., last 5 items)
  const historySize = Math.min(5, state.displayedMediaFiles.length);
  const historyPaths = state.displayedMediaFiles
    .slice(-historySize)
    .map((item) => item.path);
  const newItem = selectWeightedRandom(filteredPool, historyPaths);

  if (newItem) {
    state.displayedMediaFiles.push(newItem); // Add to history for global mode
    state.currentMediaIndex = state.displayedMediaFiles.length - 1;
    state.currentMediaItem = newItem;
    displayCurrentMedia();
  } else {
    // This might happen if the pool is very small and all items are in recent history.
    console.warn(
      'Could not select a new distinct global media item. Pool might be exhausted or too small for history avoidance. Trying any item.',
    );
    if (filteredPool.length > 0) {
      // Fallback: pick any item from the pool if weighted selection with history fails
      state.currentMediaItem =
        filteredPool[Math.floor(Math.random() * filteredPool.length)];
      state.displayedMediaFiles.push(state.currentMediaItem); // Add to history
      state.currentMediaIndex = state.displayedMediaFiles.length - 1;
      displayCurrentMedia();
    } else {
      clearMediaDisplay('Global media pool exhausted.');
    }
  }
  updateNavButtons();
}

/**
 * Prepares the list of media files to be displayed for an individual model.
 * Shuffles if random mode is enabled for the model.
 */
export function prepareMediaListForIndividualView() {
  if (!state.currentSelectedModelForIndividualView) return;
  const isRandom =
    state.modelRandomModeSettings[
      state.currentSelectedModelForIndividualView.name
    ] || false;
  const filteredFiles = filterMedia(state.originalMediaFilesForIndividualView);
  state.displayedMediaFiles = generatePlaylistForIndividualModel(
    filteredFiles,
    isRandom,
  );
}

/**
 * Navigates to the next or previous media item, or re-displays the current one.
 * @param {number} direction - 1 for next, -1 for previous, 0 to re-display/initialize.
 */
export function navigateMedia(direction) {
  if (state.isGlobalSlideshowActive) {
    if (direction === 1) {
      // Next
      if (state.currentMediaIndex < state.displayedMediaFiles.length - 1) {
        // If there are items in the "history" of globally displayed files, move to the next one
        state.currentMediaIndex++;
        state.currentMediaItem =
          state.displayedMediaFiles[state.currentMediaIndex];
        displayCurrentMedia();
      } else {
        // Otherwise, pick a new item from the global pool
        pickAndDisplayNextGlobalMediaItem();
      }
    } else if (direction === -1) {
      // Previous
      if (state.currentMediaIndex > 0) {
        state.currentMediaIndex--;
        state.currentMediaItem =
          state.displayedMediaFiles[state.currentMediaIndex];
        displayCurrentMedia();
      } else {
        console.log('At the beginning of global slideshow history.');
        // Optionally, disable prev button or do nothing
      }
    } else if (direction === 0 && state.currentMediaItem) {
      // Re-display current
      displayCurrentMedia();
    } else if (
      direction === 0 &&
      !state.currentMediaItem &&
      state.globalMediaPoolForSelection.length > 0
    ) {
      // If no current item and global slideshow is active, pick the first one
      pickAndDisplayNextGlobalMediaItem();
    }
  } else {
    // Individual model slideshow
    // Special case: if 'play' (direction 0) is hit on an individual model with no current media displayed,
    // but files exist in the model, prepare the list and show the first item.
    if (
      state.displayedMediaFiles.length === 0 &&
      direction === 0 &&
      state.currentSelectedModelForIndividualView &&
      state.originalMediaFilesForIndividualView.length > 0
    ) {
      prepareMediaListForIndividualView();
      if (state.displayedMediaFiles.length > 0) {
        state.currentMediaIndex = 0;
        state.currentMediaItem = state.displayedMediaFiles[0];
        displayCurrentMedia();
      } else {
        clearMediaDisplay(
          'No media files in this model (after attempting to prepare list).',
        );
      }
      updateNavButtons();
      return;
    }

    if (state.displayedMediaFiles.length === 0) {
      updateNavButtons(); // Ensure buttons are correctly disabled
      return; // No media to navigate
    }

    let newIndex = state.currentMediaIndex + direction;

    if (newIndex >= state.displayedMediaFiles.length) {
      // Reached end of list
      if (
        state.currentSelectedModelForIndividualView &&
        state.modelRandomModeSettings[
          state.currentSelectedModelForIndividualView.name
        ]
      ) {
        // If random mode, reshuffle and go to the first item of the new playlist
        prepareMediaListForIndividualView(); // This reshuffles if random is on
        newIndex = state.displayedMediaFiles.length > 0 ? 0 : -1; // -1 if list became empty
      } else {
        // If not random, stop at the end
        newIndex = state.displayedMediaFiles.length - 1;
        if (state.isTimerPlaying) stopSlideshowTimer(); // Stop timer if at the end of non-random list
      }
    } else if (newIndex < 0) {
      // Reached beginning of list
      if (
        state.currentSelectedModelForIndividualView &&
        state.modelRandomModeSettings[
          state.currentSelectedModelForIndividualView.name
        ]
      ) {
        // For random mode, going "previous" from the first item could reshuffle and pick a new "first"
        prepareMediaListForIndividualView();
        newIndex = state.displayedMediaFiles.length > 0 ? 0 : -1;
      } else {
        // If not random, stop at the beginning
        newIndex = 0;
      }
    }

    if (newIndex !== -1 && newIndex < state.displayedMediaFiles.length) {
      state.currentMediaIndex = newIndex;
      state.currentMediaItem =
        state.displayedMediaFiles[state.currentMediaIndex];
      displayCurrentMedia();
    } else if (
      state.displayedMediaFiles.length > 0 &&
      direction === 0 &&
      state.currentMediaIndex !== -1 &&
      state.currentMediaIndex < state.displayedMediaFiles.length
    ) {
      // Re-display current item if direction is 0 (e.g., after timer start with an item already showing)
      state.currentMediaItem =
        state.displayedMediaFiles[state.currentMediaIndex];
      displayCurrentMedia();
    } else if (newIndex === -1 && state.displayedMediaFiles.length === 0) {
      // This can happen if reshuffling an empty model (e.g. after filtering)
      clearMediaDisplay('No media to display in this model.');
    }
  }
  updateNavButtons();
}
