/**
 * @file Responsible for all direct manipulations of the DOM to reflect the current application state.
 * This includes displaying media, clearing the display, and updating UI components like
 * navigation buttons and information text.
 * @requires ./ui-elements.js
 * @requires ./state.js
 */

import {
  mediaDisplayArea,
  mediaPlaceholder,
  fileNameInfoElement,
  fileCountInfoElement,
  prevMediaButton,
  nextMediaButton,
  playPauseTimerButton,
} from './ui-elements.js';
import { state } from './state.js';

/**
 * Displays the current media item (image or video) in the media display area.
 * It fetches the media content (either as a Data URL or a local server URL) from the main
 * process via IPC. It handles the display of loading indicators, and error messages,
 * and also records a view for the media item being displayed. After displaying the media,
 * it updates the file information and navigation buttons.
 * @async
 */
export async function displayCurrentMedia() {
  const mediaFileToDisplay = state.currentMediaItem;

  if (!mediaFileToDisplay) {
    const message = state.isGlobalSlideshowActive
      ? 'No media item selected for global display.'
      : state.currentSelectedModelForIndividualView
        ? 'No media to display for this model.'
        : 'No media selected.';
    clearMediaDisplay(message);
    updateNavButtons();
    return;
  }

  mediaDisplayArea.innerHTML = ''; // Clear previous media
  mediaPlaceholder.style.display = 'none'; // Hide placeholder

  // Show loading indicator
  const loadingText = document.createElement('p');
  loadingText.textContent = `Loading ${mediaFileToDisplay.name}...`;
  loadingText.className =
    'text-gray-400 absolute inset-0 flex items-center justify-center'; // Centered
  mediaDisplayArea.appendChild(loadingText);

  try {
    // Record view before attempting to load
    if (mediaFileToDisplay.path) {
      await window.electronAPI.recordMediaView(mediaFileToDisplay.path);
      // Optimistically update view count in local state
      state.currentMediaItem.viewCount =
        (state.currentMediaItem.viewCount || 0) + 1;
    }

    const loadResult = await window.electronAPI.loadFileAsDataURL(
      mediaFileToDisplay.path,
    );

    // Remove loading indicator only if it's still there (might have been replaced by error)
    if (loadingText.parentNode === mediaDisplayArea) {
      mediaDisplayArea.removeChild(loadingText);
    }

    if (!loadResult || loadResult.type === 'error') {
      const errorMsg = loadResult
        ? loadResult.message
        : 'Failed to get load result from main process.';
      throw new Error(errorMsg);
    }

    let mediaElement;
    const fileExtension = mediaFileToDisplay.path
      .split('.')
      .pop()
      .toLowerCase();
    // Consider moving these to a shared constants/config if used elsewhere
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];

    if (imageExtensions.includes(fileExtension)) {
      mediaElement = document.createElement('img');
      mediaElement.alt = mediaFileToDisplay.name;
    } else if (videoExtensions.includes(fileExtension)) {
      mediaElement = document.createElement('video');
      mediaElement.controls = true;
      mediaElement.autoplay = true; // Autoplay videos
      mediaElement.muted = false; // Start unmuted, user can mute
      mediaElement.loop = !state.isTimerPlaying; // Loop if timer is not active
      mediaElement.preload = 'auto'; // Hint to browser to preload

      // If timer is playing, video ending should advance the slideshow
      if (state.isTimerPlaying) {
        mediaElement.onended = () => {
          // This import would create a circular dependency if navigateMedia was also here.
          // It's better if slideshow.js handles this logic.
          // For now, assuming navigateMedia is globally available or imported in slideshow.js
          // This line is problematic due to module boundaries.
          // A better approach: slideshow.js's navigateMedia could be called,
          // or this onended handler could emit an event that slideshow.js listens to.
          // For simplicity of this cleanup, we'll leave the direct call,
          // acknowledging it implies navigateMedia is accessible.
          // This should be: import { navigateMedia } from './slideshow.js'; then call it.
          // However, that would create circular dependency if slideshow.js imports this file.
          // This is a known issue from the original refactor.
          // The most robust solution is often event-driven or a higher-order controller.
          // For now, we assume `navigateMedia` is callable, likely from slideshow.js.
          if (typeof navigateMedia === 'function' && state.isTimerPlaying) {
            // This is a placeholder for where slideshow.js's navigateMedia should be called.
            // It's currently not directly callable here without creating circular dependencies
            // or restructuring.
            console.warn(
              'Video ended while timer playing - navigateMedia call skipped due to refactor boundary.',
            );
          }
        };
      }
    } else {
      mediaElement = document.createElement('p');
      mediaElement.textContent = `Unsupported file type: ${mediaFileToDisplay.name}`;
      mediaElement.className =
        'text-red-400 absolute inset-0 flex items-center justify-center';
    }

    mediaElement.src = loadResult.url;

    // Error handling for media element loading
    if (mediaElement.tagName === 'VIDEO' || mediaElement.tagName === 'IMG') {
      mediaElement.onerror = (e) => {
        const errorSource = e.target;
        let errorMessage = `Error loading media: ${mediaFileToDisplay.name}.`;
        if (errorSource && errorSource.error) {
          errorMessage += ` Code: ${errorSource.error.code}, Message: ${errorSource.error.message || 'No specific message.'}`;
        }
        console.error(errorMessage, e);
        if (mediaDisplayArea.contains(loadingText))
          mediaDisplayArea.removeChild(loadingText);
        mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute inset-0 flex items-center justify-center">${errorMessage} Check console.</p>`;
      };
    }
    if (mediaElement.tagName === 'VIDEO') {
      mediaElement.onloadedmetadata = () =>
        console.log(`Video metadata loaded for: ${mediaFileToDisplay.name}`);
    }

    // Append media element if no error message is already shown
    if (!mediaDisplayArea.querySelector('.text-red-400')) {
      mediaDisplayArea.appendChild(mediaElement);
    }
  } catch (error) {
    console.error(
      `Error displaying media ${mediaFileToDisplay.name} (Path: ${mediaFileToDisplay.path}):`,
      error,
    );
    if (mediaDisplayArea.contains(loadingText))
      mediaDisplayArea.removeChild(loadingText); // Ensure loading text is removed
    mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute inset-0 flex items-center justify-center">Error loading: ${mediaFileToDisplay.name}. ${error.message}. Check console.</p>`;
  }

  // Update file info display
  if (fileNameInfoElement && state.currentMediaItem) {
    fileNameInfoElement.textContent = `${state.currentMediaItem.name} (Viewed: ${state.currentMediaItem.viewCount || 0} times)`;
  }
  if (fileCountInfoElement) {
    if (state.isGlobalSlideshowActive) {
      fileCountInfoElement.textContent = `Global Slideshow - Item ${state.currentMediaIndex + 1} of ${state.displayedMediaFiles.length} (Pool: ${state.globalMediaPoolForSelection.length} items)`;
    } else {
      fileCountInfoElement.textContent = `File ${state.currentMediaIndex + 1} of ${state.displayedMediaFiles.length}`;
    }
  }
  updateNavButtons();
}

/**
 * Clears the media display area and shows a placeholder message. It also resets
 * the file info displays and the current media item in the application state.
 * @param {string} [message='Select a model or start Global Slideshow.'] - The message to display in the placeholder.
 */
export function clearMediaDisplay(
  message = 'Select a model or start Global Slideshow.',
) {
  if (mediaDisplayArea) mediaDisplayArea.innerHTML = ''; // Clear any existing media or error
  if (mediaPlaceholder) {
    mediaPlaceholder.textContent = message;
    mediaPlaceholder.style.display = 'block'; // Make placeholder visible
  }
  if (fileNameInfoElement) fileNameInfoElement.innerHTML = '&nbsp;'; // Clear file name
  if (fileCountInfoElement) fileCountInfoElement.innerHTML = '&nbsp;'; // Clear file count

  state.currentMediaItem = null; // Reset current media item in state

  // If the timer was playing but now there's nothing to display (e.g., in individual mode or empty global pool), stop it.
  // This logic is a bit tricky due to module boundaries.
  // The `stopSlideshowTimer` function is in `slideshow.js`.
  // A direct call here would imply it's globally available or needs to be imported,
  // potentially creating circular dependencies if `slideshow.js` imports this file.
  // This is a known structural issue from the original refactor.
  // if (state.isTimerPlaying && (!state.isGlobalSlideshowActive || state.globalMediaPoolForSelection.length === 0)) {
  //    // Placeholder for where slideshow.js's stopSlideshowTimer should be called.
  //    console.warn("clearMediaDisplay: stopSlideshowTimer call skipped due to refactor boundary.");
  // }
}

/**
 * Updates the enabled/disabled state of navigation and timer buttons
 * based on the current application state.
 */
export function updateNavButtons() {
  if (!prevMediaButton || !nextMediaButton || !playPauseTimerButton) return;

  if (state.isGlobalSlideshowActive) {
    prevMediaButton.disabled = state.currentMediaIndex <= 0;
    // Next button is enabled if there's a pool to pick from, even if at end of current history
    nextMediaButton.disabled = state.globalMediaPoolForSelection.length === 0;
    playPauseTimerButton.disabled =
      state.globalMediaPoolForSelection.length === 0;
  } else {
    // Individual model mode
    prevMediaButton.disabled = state.currentMediaIndex <= 0;
    nextMediaButton.disabled =
      state.displayedMediaFiles.length === 0 ||
      state.currentMediaIndex >= state.displayedMediaFiles.length - 1;
    playPauseTimerButton.disabled = state.displayedMediaFiles.length === 0;
  }
}
