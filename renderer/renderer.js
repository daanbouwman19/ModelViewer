/**
 * @file This is the main entry point for the renderer process.
 * It orchestrates the entire application setup by:
 * 1. Verifying that all critical UI elements are present in the DOM.
 * 2. Attaching all necessary event listeners to the UI elements.
 * 3. Kicking off the initial data load from the main process.
 * It also includes a top-level error handler to catch and display critical
 * errors that may occur during the initialization sequence.
 * @requires ./ui-elements.js
 * @requires ./ui-updates.js
 * @requires ./slideshow.js
 * @requires ./event-handlers.js
 */

import {
  prevMediaButton,
  nextMediaButton,
  startGlobalSlideshowButton,
  playPauseTimerButton,
  reindexLibraryButton,
  criticalElements,
} from './ui-elements.js';

import { updateNavButtons } from './ui-updates.js';
import { toggleSlideshowTimer, navigateMedia } from './slideshow.js';
import {
  initialLoad,
  activateGlobalSlideshowHandler,
  handleReindex,
  handleKeydown,
} from './event-handlers.js';
import { state } from './state.js';

/**
 * The primary initialization function for the application's renderer process.
 * It performs a critical check to ensure all necessary DOM elements are available,
 * then proceeds to set up all event listeners for user interaction, and finally
 * triggers the initial loading of media models. If any critical element is missing,
 * it halts execution and attempts to display an error.
 * @async
 */
async function initializeApp() {
  // --- Initial Critical Element Check ---
  if (Object.values(criticalElements).some((el) => !el)) {
    console.error(
      'CRITICAL ERROR: One or more essential UI elements are missing from the DOM. The application may not function correctly.',
    );
    // Attempt to display an error message to the user if possible.
    const titleEl =
      criticalElements.currentModelTitleElement ||
      document.getElementById('current-model-title');
    if (titleEl) {
      titleEl.textContent = 'Error: UI components missing. App cannot start.';
      titleEl.style.color = 'red'; // Make error more visible
    }
    // Disable interactive elements if critical components are missing
    if (prevMediaButton) prevMediaButton.disabled = true;
    if (nextMediaButton) nextMediaButton.disabled = true;
    if (startGlobalSlideshowButton) startGlobalSlideshowButton.disabled = true;
    if (playPauseTimerButton) playPauseTimerButton.disabled = true;
    if (reindexLibraryButton) reindexLibraryButton.disabled = true;
    return; // Halt further initialization - now valid within a function
  }

  // --- Event Listeners Setup ---
  // Assigns event handlers to their respective UI elements.
  // These handlers are imported from other modules (event-handlers.js or slideshow.js).

  if (prevMediaButton)
    prevMediaButton.addEventListener('click', () => navigateMedia(-1));
  if (nextMediaButton)
    nextMediaButton.addEventListener('click', () => navigateMedia(1));
  if (startGlobalSlideshowButton)
    startGlobalSlideshowButton.addEventListener(
      'click',
      activateGlobalSlideshowHandler,
    );
  if (playPauseTimerButton)
    playPauseTimerButton.addEventListener('click', toggleSlideshowTimer);
  if (reindexLibraryButton)
    reindexLibraryButton.addEventListener('click', handleReindex);

  // Global keydown listener for keyboard shortcuts (e.g., arrow keys, spacebar).
  document.addEventListener('keydown', handleKeydown);

  // --- Application Initialization ---
  // Performs initial setup tasks like loading models and updating UI components.
  state.supportedExtensions = await window.electronAPI.getSupportedExtensions();
  await initialLoad(); // Loads initial model data and populates the UI.
  updateNavButtons(); // Sets the initial state of navigation buttons.

  console.log('Renderer process initialized and event listeners attached.');
}

// --- Start the Application ---
// Call the main initialization function and catch any potential errors.
initializeApp().catch((error) => {
  console.error('Failed to initialize the renderer process:', error);
  // Optionally, display a more prominent error message in the UI
  // if the basic error display within initializeApp wasn't sufficient or didn't run.
  const bodyElement = document.body;
  let errorDisplay = document.getElementById('app-critical-error-message');
  if (!errorDisplay) {
    errorDisplay = document.createElement('div');
    errorDisplay.id = 'app-critical-error-message';
    errorDisplay.style.position = 'fixed';
    errorDisplay.style.top = '0';
    errorDisplay.style.left = '0';
    errorDisplay.style.width = '100%';
    errorDisplay.style.backgroundColor = 'red';
    errorDisplay.style.color = 'white';
    errorDisplay.style.padding = '10px';
    errorDisplay.style.textAlign = 'center';
    errorDisplay.style.zIndex = '9999';
    errorDisplay.textContent =
      'A critical error occurred during application startup. Please check the console (Ctrl+Shift+I or Cmd+Option+I) for details.';
    if (bodyElement) {
      bodyElement.prepend(errorDisplay);
    }
  } else {
    errorDisplay.textContent =
      'A critical error occurred during application startup. Please check the console (Ctrl+Shift+I or Cmd+Option+I) for details.';
  }
});
