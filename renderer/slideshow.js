import { state } from './state.js';
import { 
    timerDurationInput, 
    playPauseTimerButton 
    // Add other ui-elements if directly used by slideshow logic, e.g. prev/next buttons for enabling/disabling within navigateMedia
} from './ui-elements.js';
import { displayCurrentMedia, clearMediaDisplay, updateNavButtons } from './ui-updates.js';

// Function to be moved: shuffleArray
export function shuffleArray(array) {
    // Body from renderer.js
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Function to be moved: selectWeightedRandom
export function selectWeightedRandom(items, excludePaths = []) {
    // Body from renderer.js, ensure state usage is state.variableName
    if (!items || items.length === 0) return null;
    let eligibleItems = items.filter(item => !excludePaths.includes(item.path));
    if (eligibleItems.length === 0) {
        console.warn("Weighted random: All items were in excludePaths or pool is small, picking from original list (excluding only current if applicable).");
        eligibleItems = items; // Fallback to original if all excluded, to prevent getting stuck
    }
    if (eligibleItems.length === 0) return null;

    const weightedItems = eligibleItems.map(item => ({
        ...item,
        weight: 1 / ((item.viewCount || 0) + 1)
    }));
    const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight < 1e-9 && eligibleItems.length > 0) { // Check for near-zero or zero total weight
        console.warn("Weighted random: Total weight is near zero or zero, using uniform random selection from eligible items.");
        return eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
    }
    if (totalWeight === 0) return null;


    let random = Math.random() * totalWeight;
    for (const item of weightedItems) {
        random -= item.weight;
        if (random <= 0) return item;
    }
    // Fallback, should ideally not be reached if weights are calculated correctly and totalWeight > 0
    return eligibleItems.length > 0 ? eligibleItems[eligibleItems.length - 1] : null;
}

// Function to be moved: generatePlaylistForIndividualModel
export function generatePlaylistForIndividualModel(mediaPool, isRandom) {
    // Body from renderer.js
    if (!mediaPool || mediaPool.length === 0) return [];
    if (isRandom) {
        return shuffleArray(mediaPool); // Uses local shuffleArray
    } else {
        return [...mediaPool];
    }
}
 
// Function to be moved: stopSlideshowTimer
export function stopSlideshowTimer() {
    // Body from renderer.js, ensure state usage is state.variableName (e.g. state.slideshowTimerId)
    if (state.slideshowTimerId) clearInterval(state.slideshowTimerId);
    state.slideshowTimerId = null;
    state.isTimerPlaying = false;
    if(playPauseTimerButton) playPauseTimerButton.textContent = 'Play'; // Check if element exists
    console.log("Slideshow timer stopped.");
}

// Function to be moved: startSlideshowTimer
// This function calls navigateMedia.
export function startSlideshowTimer() {
    // Body from renderer.js, ensure state usage is state.variableName
    stopSlideshowTimer(); // Uses local stopSlideshowTimer
    const durationSeconds = parseInt(timerDurationInput.value, 10);
    if (isNaN(durationSeconds) || durationSeconds < 1) {
        timerDurationInput.value = 5; // default
        if (state.isTimerPlaying) { // Check state
            state.isTimerPlaying = false; // Update state
            // toggleSlideshowTimer(); // This would be a recursive call if not careful.
                                    // The original logic was: if (isTimerPlaying) { isTimerPlaying = false; toggleSlideshowTimer(); }
                                    // This means if it was playing and duration is bad, it effectively pauses.
            if(playPauseTimerButton) playPauseTimerButton.textContent = 'Play';
        }
        return;
    }
    state.isTimerPlaying = true; // Update state
    if(playPauseTimerButton) playPauseTimerButton.textContent = 'Pause';
    state.slideshowTimerId = setInterval(() => { navigateMedia(1); }, durationSeconds * 1000); // Calls navigateMedia
    console.log(`Slideshow timer started for ${durationSeconds}s interval.`);
}
 
// Function to be moved: toggleSlideshowTimer
// This function calls startSlideshowTimer, stopSlideshowTimer, navigateMedia
export function toggleSlideshowTimer() {
    // Body from renderer.js, ensure state usage is state.variableName
    const currentPool = state.isGlobalSlideshowActive ? state.globalMediaPoolForSelection : state.displayedMediaFiles;
    if (currentPool.length === 0 && !state.currentMediaItem) {
        console.log("Cannot start timer: No media loaded or pool is empty."); return;
    }
    if (state.isGlobalSlideshowActive && state.globalMediaPoolForSelection.length === 0) {
        console.log("Cannot start timer: Global slideshow active but pool is empty."); return;
    }
    if (!state.isGlobalSlideshowActive && state.currentSelectedModelForIndividualView && state.displayedMediaFiles.length === 0) {
        console.log("Cannot start timer: Individual model selected but has no media."); return;
    }

    if (state.isTimerPlaying) stopSlideshowTimer(); // Uses local stopSlideshowTimer
    else {
        startSlideshowTimer(); // Uses local startSlideshowTimer
        if (!state.currentMediaItem && (state.isGlobalSlideshowActive || state.currentSelectedModelForIndividualView)) {
            navigateMedia(0); // Calls navigateMedia
        }
    }
}

// Function to be moved: pickAndDisplayNextGlobalMediaItem
// This function calls selectWeightedRandom, displayCurrentMedia, updateNavButtons, clearMediaDisplay
export function pickAndDisplayNextGlobalMediaItem() {
    // Body from renderer.js, ensure state usage is state.variableName
    if (state.globalMediaPoolForSelection.length === 0) {
        clearMediaDisplay("Global media pool is empty."); // Uses imported clearMediaDisplay
        updateNavButtons(); // Uses imported updateNavButtons
        return;
    }

    const historyPaths = state.displayedMediaFiles.slice(-Math.min(5, state.displayedMediaFiles.length)).map(item => item.path);
    const newItem = selectWeightedRandom(state.globalMediaPoolForSelection, historyPaths); // Uses local selectWeightedRandom

    if (newItem) {
        state.displayedMediaFiles.push(newItem); // Mutate state array
        state.currentMediaIndex = state.displayedMediaFiles.length - 1; // Update state
        state.currentMediaItem = newItem; // Update state
        displayCurrentMedia(); // Uses imported displayCurrentMedia
    } else {
        console.warn("Could not select a new distinct global media item. Pool might be exhausted or too small for history avoidance. Trying any item.");
        if (state.globalMediaPoolForSelection.length > 0) {
            state.currentMediaItem = state.globalMediaPoolForSelection[Math.floor(Math.random() * state.globalMediaPoolForSelection.length)];
            state.displayedMediaFiles.push(state.currentMediaItem);
            state.currentMediaIndex = state.displayedMediaFiles.length - 1;
            displayCurrentMedia(); // Uses imported displayCurrentMedia
        } else {
            clearMediaDisplay("Global media pool exhausted."); // Uses imported clearMediaDisplay
        }
    }
    updateNavButtons(); // Uses imported updateNavButtons
}

// Function to be moved: navigateMedia
// This function calls displayCurrentMedia, pickAndDisplayNextGlobalMediaItem, stopSlideshowTimer, 
// clearMediaDisplay, updateNavButtons, and prepareMediaListForIndividualView (which itself uses state and generatePlaylistForIndividualModel).
// prepareMediaListForIndividualView should also be moved to this file or event-handlers.js if it's more of a setup.
// Given it generates a playlist, it fits well in slideshow.js.
export function prepareMediaListForIndividualView() {
   // Body from renderer.js, using state and generatePlaylistForIndividualModel
   if (!state.currentSelectedModelForIndividualView) return;
   const isRandom = state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name] || false;
   // Reassigning state.displayedMediaFiles directly
   state.displayedMediaFiles = generatePlaylistForIndividualModel(state.originalMediaFilesForIndividualView, isRandom);
}

export function navigateMedia(direction) {
    // Body from renderer.js, ensure state usage is state.variableName
    // Calls to other functions (e.g. displayCurrentMedia, pickAndDisplayNextGlobalMediaItem etc.)
    // should now correctly resolve if those functions are also in this file or imported.

    if (state.isGlobalSlideshowActive) {
        if (direction === 1) { // Next
            if (state.currentMediaIndex < state.displayedMediaFiles.length - 1) {
                state.currentMediaIndex++;
                state.currentMediaItem = state.displayedMediaFiles[state.currentMediaIndex];
                displayCurrentMedia();
            } else {
                pickAndDisplayNextGlobalMediaItem(); // Call within this module
            }
        } else if (direction === -1) { // Previous
            if (state.currentMediaIndex > 0) {
                state.currentMediaIndex--;
                state.currentMediaItem = state.displayedMediaFiles[state.currentMediaIndex];
                displayCurrentMedia();
            } else {
                console.log("At the beginning of global slideshow history.");
            }
        } else if (direction === 0 && state.currentMediaItem) { // Re-display current or first if none
            displayCurrentMedia();
        } else if (direction === 0 && !state.currentMediaItem && state.globalMediaPoolForSelection.length > 0) {
            pickAndDisplayNextGlobalMediaItem(); // Call within this module
        }
    } else { // Individual model slideshow
        if (state.displayedMediaFiles.length === 0 && direction === 0 && state.currentSelectedModelForIndividualView && state.originalMediaFilesForIndividualView.length > 0) {
            // Special case: if 'play' is hit on an individual model with no current media displayed, but files exist
            prepareMediaListForIndividualView(); // Call within this module
            if(state.displayedMediaFiles.length > 0) { // Check if playlist got populated
               state.currentMediaIndex = 0;
               state.currentMediaItem = state.displayedMediaFiles[0];
               displayCurrentMedia();
            } else {
               clearMediaDisplay("No media files in this model (after attempting to prepare list).");
            }
            updateNavButtons();
            return;
        }
        if (state.displayedMediaFiles.length === 0) {
           updateNavButtons(); // Ensure buttons are updated even if nothing to navigate
           return;
        }

        let newIndex = state.currentMediaIndex + direction;
        if (newIndex >= state.displayedMediaFiles.length) { // End of list
            if (state.currentSelectedModelForIndividualView && state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name]) {
                // If random, reshuffle and go to first
                prepareMediaListForIndividualView(); // Reshuffles if random is on
                newIndex = state.displayedMediaFiles.length > 0 ? 0 : -1;
            } else {
                // If not random, stop at the end
                newIndex = state.displayedMediaFiles.length - 1;
                if (state.isTimerPlaying) stopSlideshowTimer(); // Stop timer if at the end of non-random
            }
        } else if (newIndex < 0) { // Beginning of list
            if (state.currentSelectedModelForIndividualView && state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name]) {
               // If random, reshuffle and go to first (or last if more appropriate, but 0 is fine)
               // This case is less common as random usually picks from anywhere.
               // For now, let's just go to the beginning, as the list might have been just generated.
                prepareMediaListForIndividualView();
                newIndex = state.displayedMediaFiles.length > 0 ? 0 : -1;
            } else {
               // If not random, stop at the beginning
                newIndex = 0;
            }
        }

        if (newIndex !== -1 && newIndex < state.displayedMediaFiles.length) {
            state.currentMediaIndex = newIndex;
            state.currentMediaItem = state.displayedMediaFiles[state.currentMediaIndex];
            displayCurrentMedia();
        } else if (state.displayedMediaFiles.length > 0 && direction === 0 && state.currentMediaIndex !== -1 && state.currentMediaIndex < state.displayedMediaFiles.length) {
            // This condition is for re-displaying current item if direction is 0 (e.g. after timer start)
            state.currentMediaItem = state.displayedMediaFiles[state.currentMediaIndex];
            displayCurrentMedia();
        } else {
            clearMediaDisplay("No media to display or index out of bounds.");
        }
    }
    updateNavButtons(); // Uses imported updateNavButtons
}
