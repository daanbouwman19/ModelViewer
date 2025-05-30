import { state } from './state.js';
import {
    timerDurationInput,
    playPauseTimerButton,
    countdownProgressBarContainer, // Import new element
    countdownProgressBar         // Import new element
} from './ui-elements.js';
import { displayCurrentMedia, clearMediaDisplay, updateNavButtons } from './ui-updates.js';

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param {Array<any>} array - The array to shuffle.
 * @returns {Array<any>} The shuffled array.
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

    let eligibleItems = items.filter(item => !excludePaths.includes(item.path));

    if (eligibleItems.length === 0) {
        console.warn("Weighted random: All items were in excludePaths or pool is small. Considering all items again.");
        eligibleItems = items;
    }
    if (eligibleItems.length === 0) return null; // Still no items

    const weightedItems = eligibleItems.map(item => ({
        ...item,
        weight: 1 / ((item.viewCount || 0) + 1)
    }));

    const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);

    if (totalWeight <= 1e-9 && eligibleItems.length > 0) {
        // eligibleItems.length > 0 is guaranteed by checks before this point if initial items were provided.
        console.warn("Weighted random: Total weight is very small. Using uniform random selection from eligible items.");
        return eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
    }
    // If totalWeight were 0 (and eligibleItems.length > 0), it would have been caught by the totalWeight <= 1e-9 check above,
    // leading to uniform random selection.
    // If eligibleItems.length were 0, an earlier check would have returned null.
    // Thus, at this point, totalWeight > 1e-9 and eligibleItems.length > 0.
    // The line `if (totalWeight === 0) return null;` was effectively unreachable or redundant.

    let random = Math.random() * totalWeight;
    for (const item of weightedItems) {
        random -= item.weight;
        if (random <= 0) return item;
    }

    // This part of the function should ideally be unreachable if the weighted selection logic above is sound.
    // If execution reaches here, it indicates a potential flaw or an extreme floating-point arithmetic anomaly.
    console.error("selectWeightedRandom: Unreachable code reached. Fallback to last item. This may indicate an issue in selection logic or floating point precision.", {
        eligibleItemsCount: eligibleItems.length,
        totalWeightAtLoopStart: totalWeight,
        finalRandomValueAfterLoop: random // This would be initial_random_value - totalWeight
    });
    // Fallback to returning the last eligible item.
    // eligibleItems is guaranteed to be non-empty at this point due to earlier checks.
    return eligibleItems[eligibleItems.length - 1];
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
 * Updates the countdown progress bar visually.
 * @param {number} percentageRemaining - The percentage of time remaining (0-100).
 */
function updateProgressBarVisual(percentageRemaining) {
    if (countdownProgressBar && countdownProgressBarContainer) {
        // Ensure the bar is visible if it's supposed to be updated
        if (state.isTimerPlaying && countdownProgressBarContainer.style.display === 'none') {
            countdownProgressBarContainer.style.display = 'block';
        }
        countdownProgressBar.style.width = `${Math.max(0, Math.min(100, percentageRemaining))}%`;
    }
}

/**
 * Resets the progress bar when a new media item is shown while the timer is active.
 */
function resetProgressBarForNewMedia() {
    if (state.isTimerPlaying && countdownProgressBarContainer && timerDurationInput) {
        state.timerStartTime = Date.now(); // Reset start time for the new countdown period
        const durationSeconds = parseInt(timerDurationInput.value, 10);

        if (isNaN(durationSeconds) || durationSeconds < 1) {
            console.warn("Timer duration invalid during media change. Progress bar might not reflect accurately until timer restarts.");
            // Use the last known valid duration or a default
            state.currentTimerDurationSeconds = state.currentTimerDurationSeconds > 0 ? state.currentTimerDurationSeconds : 5;
        } else {
            state.currentTimerDurationSeconds = durationSeconds;
        }

        if (countdownProgressBarContainer.style.display !== 'block') {
            countdownProgressBarContainer.style.display = 'block';
        }
        updateProgressBarVisual(100); // Reset to full
    } else if (!state.isTimerPlaying && countdownProgressBarContainer) {
        // If timer is not playing, ensure bar is hidden
        countdownProgressBarContainer.style.display = 'none';
    }
}


/**
 * Stops the slideshow timer and hides the progress bar.
 */
export function stopSlideshowTimer() {
    if (state.slideshowTimerId) clearInterval(state.slideshowTimerId);
    state.slideshowTimerId = null;
    if (state.progressBarUpdateIntervalId) clearInterval(state.progressBarUpdateIntervalId);
    state.progressBarUpdateIntervalId = null;

    state.isTimerPlaying = false;
    if (playPauseTimerButton) playPauseTimerButton.textContent = 'Play';
    if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
    console.log("Slideshow timer and progress bar stopped.");
}

/**
 * Starts the slideshow timer with the duration specified in the input field
 * and manages the progress bar.
 */
export function startSlideshowTimer() {
    stopSlideshowTimer(); // Clear any existing timer and hide progress bar

    const durationSecondsInput = parseInt(timerDurationInput.value, 10);

    if (isNaN(durationSecondsInput) || durationSecondsInput < 1) {
        timerDurationInput.value = 5; // Reset to default if invalid
        state.currentTimerDurationSeconds = 5; // Store default
        // If it was playing and duration became invalid, effectively pause it.
        // This state is already handled by stopSlideshowTimer.
        console.warn("Invalid timer duration, reset to 5s. Timer not started.");
        return;
    }
    state.currentTimerDurationSeconds = durationSecondsInput; // Store valid duration

    state.isTimerPlaying = true;
    if (playPauseTimerButton) playPauseTimerButton.textContent = 'Pause';

    // Show and reset progress bar
    if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'block';
    updateProgressBarVisual(100); // Reset to full

    state.timerStartTime = Date.now(); // Record start time for progress calculation

    // Interval for advancing media
    state.slideshowTimerId = setInterval(() => {
        navigateMedia(1); // This will also call resetProgressBarForNewMedia if successful
    }, state.currentTimerDurationSeconds * 1000);

    // Interval for updating progress bar visuals
    const updateInterval = 50; // Update progress bar every 50ms for smoothness
    state.progressBarUpdateIntervalId = setInterval(() => {
        if (!state.isTimerPlaying) { // Safety check, should be cleared by stopSlideshowTimer
            clearInterval(state.progressBarUpdateIntervalId);
            state.progressBarUpdateIntervalId = null;
            if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
            return;
        }
        const elapsedTimeMs = Date.now() - state.timerStartTime;
        const totalDurationMs = state.currentTimerDurationSeconds * 1000;

        if (totalDurationMs <= 0) { // Avoid division by zero if duration is somehow invalid
            updateProgressBarVisual(0);
            return;
        }

        const percentageRemaining = Math.max(0, 100 - (elapsedTimeMs / totalDurationMs) * 100);
        updateProgressBarVisual(percentageRemaining);

    }, updateInterval);

    console.log(`Slideshow timer started for ${state.currentTimerDurationSeconds}s interval with progress bar.`);
}

/**
 * Toggles the play/pause state of the slideshow timer.
 */
export function toggleSlideshowTimer() {
    const currentPool = state.isGlobalSlideshowActive ? state.globalMediaPoolForSelection : state.displayedMediaFiles;

    if (currentPool.length === 0 && !state.currentMediaItem) {
        console.log("Cannot start/toggle timer: No media loaded or pool is empty.");
        if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none'; // Ensure bar is hidden
        return;
    }
    if (state.isGlobalSlideshowActive && state.globalMediaPoolForSelection.length === 0) {
        console.log("Cannot start/toggle timer: Global slideshow active but pool is empty.");
        if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
        return;
    }
    if (!state.isGlobalSlideshowActive && state.currentSelectedModelForIndividualView && state.displayedMediaFiles.length === 0) {
        console.log("Cannot start/toggle timer: Individual model selected but has no media.");
        if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
        return;
    }

    if (state.isTimerPlaying) {
        stopSlideshowTimer();
    } else {
        startSlideshowTimer(); // This will handle showing the progress bar
        // If no media is currently displayed but a slideshow is active, show the first item.
        // startSlideshowTimer already handles resetting the progress bar.
        // navigateMedia/pickAndDisplayNextGlobalMediaItem will call resetProgressBarForNewMedia.
        if (!state.currentMediaItem && (state.isGlobalSlideshowActive || state.currentSelectedModelForIndividualView)) {
            if (state.isGlobalSlideshowActive && state.globalMediaPoolForSelection.length > 0) {
                pickAndDisplayNextGlobalMediaItem();
            } else if (!state.isGlobalSlideshowActive && state.displayedMediaFiles.length > 0) {
                navigateMedia(0); // Show current/first
            }
        }
    }
}

/**
 * Picks the next media item for the global slideshow using weighted random selection
 * and updates the display.
 */
export function pickAndDisplayNextGlobalMediaItem() {
    if (state.globalMediaPoolForSelection.length === 0) {
        clearMediaDisplay("Global media pool is empty.");
        if (countdownProgressBarContainer && !state.isTimerPlaying) { // Ensure bar is hidden if timer stopped
            countdownProgressBarContainer.style.display = 'none';
        }
        updateNavButtons();
        return;
    }

    const historySize = Math.min(5, state.displayedMediaFiles.length);
    const historyPaths = state.displayedMediaFiles.slice(-historySize).map(item => item.path);
    const newItem = selectWeightedRandom(state.globalMediaPoolForSelection, historyPaths);

    if (newItem) {
        state.displayedMediaFiles.push(newItem);
        state.currentMediaIndex = state.displayedMediaFiles.length - 1;
        state.currentMediaItem = newItem;
        displayCurrentMedia(); // Call display first
        if (state.isTimerPlaying) { // Then reset progress bar if timer is active
            resetProgressBarForNewMedia();
        }
    } else {
        console.warn("Could not select a new distinct global media item. Pool might be exhausted or too small for history avoidance. Trying any item.");
        if (state.globalMediaPoolForSelection.length > 0) {
            state.currentMediaItem = state.globalMediaPoolForSelection[Math.floor(Math.random() * state.globalMediaPoolForSelection.length)];
            state.displayedMediaFiles.push(state.currentMediaItem);
            state.currentMediaIndex = state.displayedMediaFiles.length - 1;
            displayCurrentMedia();
            if (state.isTimerPlaying) {
                resetProgressBarForNewMedia();
            }
        } else {
            clearMediaDisplay("Global media pool exhausted.");
            if (countdownProgressBarContainer && !state.isTimerPlaying) {
                countdownProgressBarContainer.style.display = 'none';
            }
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
    const isRandom = state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name] || false;
    state.displayedMediaFiles = generatePlaylistForIndividualModel(state.originalMediaFilesForIndividualView, isRandom);
}

/**
 * Navigates to the next or previous media item, or re-displays the current one.
 * Manages progress bar reset if the timer is active.
 * @param {number} direction - 1 for next, -1 for previous, 0 to re-display/initialize.
 */
export function navigateMedia(direction) {
    let newMediaItemToDisplay = null;

    if (state.isGlobalSlideshowActive) {
        if (direction === 1) { // Next
            if (state.currentMediaIndex < state.displayedMediaFiles.length - 1) {
                state.currentMediaIndex++;
                newMediaItemToDisplay = state.displayedMediaFiles[state.currentMediaIndex];
            } else {
                pickAndDisplayNextGlobalMediaItem(); // This handles its own display and progress bar
                return; // Exit early
            }
        } else if (direction === -1) { // Previous
            if (state.currentMediaIndex > 0) {
                state.currentMediaIndex--;
                newMediaItemToDisplay = state.displayedMediaFiles[state.currentMediaIndex];
            } else {
                console.log("At the beginning of global slideshow history.");
            }
        } else if (direction === 0 && state.currentMediaItem) { // Re-display current
            newMediaItemToDisplay = state.currentMediaItem;
        } else if (direction === 0 && !state.currentMediaItem && state.globalMediaPoolForSelection.length > 0) {
            pickAndDisplayNextGlobalMediaItem(); // Handles its own display and progress bar
            return;
        }
    } else { // Individual model slideshow
        if (state.displayedMediaFiles.length === 0 && direction === 0 && state.currentSelectedModelForIndividualView && state.originalMediaFilesForIndividualView.length > 0) {
            prepareMediaListForIndividualView();
            if (state.displayedMediaFiles.length > 0) {
                state.currentMediaIndex = 0;
                newMediaItemToDisplay = state.displayedMediaFiles[0];
            } else {
                clearMediaDisplay("No media files in this model (after attempting to prepare list).");
            }
        } else if (state.displayedMediaFiles.length === 0) {
            // No media to navigate
        } else {
            let newIndex = state.currentMediaIndex + direction;
            if (newIndex >= state.displayedMediaFiles.length) {
                if (state.currentSelectedModelForIndividualView && state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name]) {
                    prepareMediaListForIndividualView();
                    newIndex = state.displayedMediaFiles.length > 0 ? 0 : -1;
                } else {
                    newIndex = state.displayedMediaFiles.length - 1;
                    if (state.isTimerPlaying) stopSlideshowTimer();
                }
            } else if (newIndex < 0) {
                if (state.currentSelectedModelForIndividualView && state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name]) {
                    prepareMediaListForIndividualView();
                    newIndex = state.displayedMediaFiles.length > 0 ? 0 : -1;
                } else {
                    newIndex = 0;
                }
            }

            if (newIndex !== -1 && newIndex < state.displayedMediaFiles.length) {
                state.currentMediaIndex = newIndex;
                newMediaItemToDisplay = state.displayedMediaFiles[state.currentMediaIndex];
            } else if (direction === 0 && state.currentMediaItem) {
                newMediaItemToDisplay = state.currentMediaItem;
            } else if (newIndex === -1 && state.displayedMediaFiles.length === 0) {
                clearMediaDisplay("No media to display in this model.");
            }
        }
    }

    state.currentMediaItem = newMediaItemToDisplay; // Update state

    if (state.currentMediaItem) {
        displayCurrentMedia(); // Display the new media
        if (state.isTimerPlaying) {
            resetProgressBarForNewMedia(); // Reset bar for the new item if timer is running
        }
    } else if (!state.isGlobalSlideshowActive && state.displayedMediaFiles.length === 0) {
        clearMediaDisplay("No media to display in this model.");
    }

    // Ensure progress bar is hidden if timer is not playing
    if (!state.isTimerPlaying && countdownProgressBarContainer) {
        countdownProgressBarContainer.style.display = 'none';
    }
    updateNavButtons();
}


// Initialize progress bar to be hidden on module load
if (countdownProgressBarContainer) {
    countdownProgressBarContainer.style.display = 'none';
}
