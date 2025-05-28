document.addEventListener('DOMContentLoaded', async () => {
    // Import UI elements, state, UI updates, slideshow functions, and event handlers
    import { 
        prevMediaButton, 
        nextMediaButton, 
        startGlobalSlideshowButton, 
        playPauseTimerButton, 
        reindexLibraryButton,
        criticalElements 
        // modelsListElement, currentModelTitleElement, timerDurationInput are used by event-handlers.js, 
        // but not directly in renderer.js anymore after refactor
    } from './ui-elements.js';
    // import { state } from './state.js'; // state is used by event-handlers and others, not directly here
    import { updateNavButtons } from './ui-updates.js'; // updateNavButtons is called at init
    import { toggleSlideshowTimer, navigateMedia } from './slideshow.js'; // Used by event listeners in this file
    import { 
        initialLoad, 
        activateGlobalSlideshowHandler,
        handleReindex,
        handleKeydown
        // selectModelForIndividualView, populateModelsListUI_internal are used by event-handlers.js
    } from './event-handlers.js';

    // --- Initial Checks --- 
    if (Object.values(criticalElements).some(el => !el)) {
        console.error('CRITICAL ERROR: One or more UI elements are missing. App cannot function fully.');
        const titleEl = criticalElements.currentModelTitleElement || document.getElementById('current-model-title');
        if (titleEl) titleEl.textContent = 'Error: UI missing elements.';
        return;
    }

    // --- Event Listeners ---
    // These listeners now call functions imported from event-handlers.js or slideshow.js
    prevMediaButton.addEventListener('click', () => navigateMedia(-1));
    nextMediaButton.addEventListener('click', () => navigateMedia(1));
    startGlobalSlideshowButton.addEventListener('click', activateGlobalSlideshowHandler);
    playPauseTimerButton.addEventListener('click', toggleSlideshowTimer);
    reindexLibraryButton.addEventListener('click', handleReindex);
    document.addEventListener('keydown', handleKeydown);

    // --- Initialization ---
    initialLoad(); // Call the imported initialLoad
    updateNavButtons(); // Call the imported updateNavButtons
});
