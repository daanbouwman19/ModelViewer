document.addEventListener('DOMContentLoaded', async () => {
    // Import necessary UI elements, state management, UI update functions, slideshow logic, and event handlers.
    // Specific UI elements like modelsListElement are used within event-handlers.js or other modules.
    import {
        prevMediaButton,
        nextMediaButton,
        startGlobalSlideshowButton,
        playPauseTimerButton,
        reindexLibraryButton,
        criticalElements // Used for initial check
    } from './ui-elements.js';
    // state is managed and used by other modules (event-handlers, slideshow, ui-updates).
    // import { state } from './state.js';

    import { updateNavButtons } from './ui-updates.js'; // Called at initialization.
    import { toggleSlideshowTimer, navigateMedia } from './slideshow.js'; // Used by event listeners.
    import {
        initialLoad,
        activateGlobalSlideshowHandler,
        handleReindex,
        handleKeydown
        // selectModelForIndividualView and populateModelsListUI_internal are part of event-handlers.js
    } from './event-handlers.js';

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
        if(prevMediaButton) prevMediaButton.disabled = true;
        if(nextMediaButton) nextMediaButton.disabled = true;
        if(startGlobalSlideshowButton) startGlobalSlideshowButton.disabled = true;
        if(playPauseTimerButton) playPauseTimerButton.disabled = true;
        if(reindexLibraryButton) reindexLibraryButton.disabled = true;
        return; // Halt further initialization
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
});
