import {
    prevMediaButton,
    nextMediaButton,
    startGlobalSlideshowButton,
    playPauseTimerButton,
    reindexLibraryButton,
    criticalElements
} from './ui-elements.js';


import { updateNavButtons } from './ui-updates.js'; // Called at initialization.
import { toggleSlideshowTimer, navigateMedia } from './slideshow.js'; // Used by event listeners.
import {
    initialLoad,
    activateGlobalSlideshowHandler,
    handleReindex,
    handleKeydown
} from './event-handlers.js';

// --- Main Initialization Function ---
// We wrap the main logic in an async function to allow for top-level await
// and to correctly scope the 'return' statement.
async function initializeApp() {
    // --- Initial Critical Element Check ---
    // Verifies that essential UI components are present in the DOM.
    if (Object.values(criticalElements).some(el => !el)) {
        console.error('CRITICAL ERROR: One or more essential UI elements are missing from the DOM. The application may not function correctly.');
        // Attempt to display an error message to the user if possible.
        const titleEl = criticalElements.currentModelTitleElement || document.getElementById('current-model-title');
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

    if (prevMediaButton) prevMediaButton.addEventListener('click', () => navigateMedia(-1));
    if (nextMediaButton) nextMediaButton.addEventListener('click', () => navigateMedia(1));
    if (startGlobalSlideshowButton) startGlobalSlideshowButton.addEventListener('click', activateGlobalSlideshowHandler);
    if (playPauseTimerButton) playPauseTimerButton.addEventListener('click', toggleSlideshowTimer);
    if (reindexLibraryButton) reindexLibraryButton.addEventListener('click', handleReindex);

    // Global keydown listener for keyboard shortcuts (e.g., arrow keys, spacebar).
    document.addEventListener('keydown', handleKeydown);

    // --- Application Initialization ---
    // Performs initial setup tasks like loading models and updating UI components.
    await initialLoad(); // Loads initial model data and populates the UI.
    updateNavButtons();  // Sets the initial state of navigation buttons.

    console.log("Renderer process initialized and event listeners attached.");
}

// --- Start the Application ---
// Call the main initialization function and catch any potential errors.
initializeApp().catch(error => {
    console.error("Failed to initialize the renderer process:", error);
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
        errorDisplay.textContent = 'A critical error occurred during application startup. Please check the console (Ctrl+Shift+I or Cmd+Option+I) for details.';
        if (bodyElement) {
            bodyElement.prepend(errorDisplay);
        }
    } else {
        errorDisplay.textContent = 'A critical error occurred during application startup. Please check the console (Ctrl+Shift+I or Cmd+Option+I) for details.';
    }
});
