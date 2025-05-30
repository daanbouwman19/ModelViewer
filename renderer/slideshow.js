import { state } from './state.js';
import {
    mediaDisplayArea,
    timerDurationInput,
    playPauseTimerButton,
    countdownProgressBarContainer,
    countdownProgressBar,
} from './ui-elements.js';
import { displayCurrentMedia, clearMediaDisplay, updateNavButtons } from './ui-updates.js';

export function shuffleArray(array) { /* ... existing shuffleArray ... */
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
export function selectWeightedRandom(items, excludePaths = []) { /* ... existing selectWeightedRandom ... */
    if (!items || items.length === 0) return null;
    let eligibleItems = items.filter(item => !excludePaths.includes(item.path));
    if (eligibleItems.length === 0) {
        eligibleItems = items;
    }
    if (eligibleItems.length === 0) return null;
    const weightedItems = eligibleItems.map(item => ({ ...item, weight: 1 / ((item.viewCount || 0) + 1) }));
    const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 1e-9) {
        return eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
    }
    let random = Math.random() * totalWeight;
    for (const item of weightedItems) {
        random -= item.weight;
        if (random <= 0) return item;
    }
    return eligibleItems.length > 0 ? eligibleItems[eligibleItems.length - 1] : null;
}
export function generatePlaylistForIndividualModel(mediaPool, isRandom) { /* ... existing generatePlaylistForIndividualModel ... */
    if (!mediaPool || mediaPool.length === 0) return [];
    return isRandom ? shuffleArray(mediaPool) : [...mediaPool];
}

function updateProgressBarVisual(percentageRemaining) { /* ... existing updateProgressBarVisual ... */
    if (countdownProgressBar && countdownProgressBarContainer) {
        const videoExtensions = state.videoExtensions || [];
        const currentFileExtension = state.currentMediaItem ? `.${state.currentMediaItem.path.split('.').pop().toLowerCase()}` : '';
        if (state.isTimerPlaying && !videoExtensions.includes(currentFileExtension)) {
            if (countdownProgressBarContainer.style.display === 'none') {
                countdownProgressBarContainer.style.display = 'block';
            }
        } else if (videoExtensions.includes(currentFileExtension) && countdownProgressBarContainer.style.display === 'block') {
            countdownProgressBarContainer.style.display = 'none';
        }
        countdownProgressBar.style.width = `${Math.max(0, Math.min(100, percentageRemaining))}%`;
    }
}
function resetProgressBarForNewMedia() { /* ... existing resetProgressBarForNewMedia ... */
    const videoExtensions = state.videoExtensions || [];
    if (state.isTimerPlaying && countdownProgressBarContainer && timerDurationInput) {
        const currentFileExtension = state.currentMediaItem ? `.${state.currentMediaItem.path.split('.').pop().toLowerCase()}` : '';
        if (videoExtensions.includes(currentFileExtension)) {
            if (countdownProgressBarContainer.style.display !== 'none') {
                countdownProgressBarContainer.style.display = 'none';
            }
            return;
        }
        state.timerStartTime = Date.now();
        const durationSeconds = parseInt(timerDurationInput.value, 10);
        state.currentTimerDurationSeconds = (isNaN(durationSeconds) || durationSeconds < 1) ? 5 : durationSeconds;
        if (isNaN(durationSeconds) || durationSeconds < 1) timerDurationInput.value = '5';
        if (countdownProgressBarContainer.style.display !== 'block') {
            countdownProgressBarContainer.style.display = 'block';
        }
        updateProgressBarVisual(100);
    } else if (!state.isTimerPlaying && countdownProgressBarContainer) {
        countdownProgressBarContainer.style.display = 'none';
    }
}

export function stopSlideshowTimer() { /* ... existing stopSlideshowTimer, ensures video.loop = true ... */
    if (state.slideshowTimerId) clearInterval(state.slideshowTimerId);
    state.slideshowTimerId = null;
    if (state.progressBarUpdateIntervalId) clearInterval(state.progressBarUpdateIntervalId);
    state.progressBarUpdateIntervalId = null;
    state.isTimerPlaying = false;
    if (playPauseTimerButton) playPauseTimerButton.textContent = 'Play';
    if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
    if (state.currentMediaItem) {
        const videoExtensions = state.videoExtensions || [];
        const currentFileExtension = `.${state.currentMediaItem.path.split('.').pop().toLowerCase()}`;
        if (videoExtensions.includes(currentFileExtension)) {
            const videoElement = mediaDisplayArea.querySelector('video');
            if (videoElement) {
                videoElement.loop = true;
            }
        }
    }
}

export function startSlideshowTimer() { /* ... existing startSlideshowTimer, handles video/image distinction ... */
    stopSlideshowTimer();
    const videoExtensions = state.videoExtensions || [];
    if (state.currentMediaItem) {
        const currentFileExtension = `.${state.currentMediaItem.path.split('.').pop().toLowerCase()}`;
        if (videoExtensions.includes(currentFileExtension)) {
            state.isTimerPlaying = true;
            if (playPauseTimerButton) playPauseTimerButton.textContent = 'Pause';
            if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
            const videoElement = mediaDisplayArea.querySelector('video');
            if (videoElement) {
                videoElement.loop = false; // Critical: ensure loop is false if timer starts
                // onended in displayCurrentMedia will handle advancement
            }
            return;
        }
    }
    const durationSecondsInput = parseInt(timerDurationInput.value, 10);
    if (isNaN(durationSecondsInput) || durationSecondsInput < 1) {
        timerDurationInput.value = '5'; state.currentTimerDurationSeconds = 5; state.isTimerPlaying = false;
        if (playPauseTimerButton) playPauseTimerButton.textContent = 'Play';
        if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
        return;
    }
    state.currentTimerDurationSeconds = durationSecondsInput; state.isTimerPlaying = true;
    if (playPauseTimerButton) playPauseTimerButton.textContent = 'Pause';
    if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'block';
    updateProgressBarVisual(100); state.timerStartTime = Date.now();
    state.slideshowTimerId = setInterval(() => { navigateMedia(1); }, state.currentTimerDurationSeconds * 1000);
    const updateInterval = 50;
    state.progressBarUpdateIntervalId = setInterval(() => {
        if (!state.isTimerPlaying) { clearInterval(state.progressBarUpdateIntervalId); state.progressBarUpdateIntervalId = null; if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none'; return; }
        const currentFileExt = state.currentMediaItem ? `.${state.currentMediaItem.path.split('.').pop().toLowerCase()}` : '';
        if (videoExtensions.includes(currentFileExt)) { if (countdownProgressBarContainer && countdownProgressBarContainer.style.display !== 'none') { countdownProgressBarContainer.style.display = 'none'; } return; }
        const elapsedTimeMs = Date.now() - state.timerStartTime; const totalDurationMs = state.currentTimerDurationSeconds * 1000;
        if (totalDurationMs <= 0) { updateProgressBarVisual(0); return; }
        const percentageRemaining = Math.max(0, 100 - (elapsedTimeMs / totalDurationMs) * 100);
        updateProgressBarVisual(percentageRemaining);
    }, updateInterval);
}

export function toggleSlideshowTimer() { /* ... existing toggleSlideshowTimer, calls start/stop ... */
    const currentPool = state.isGlobalSlideshowActive ? state.globalMediaPoolForSelection : state.displayedMediaFiles;
    if (currentPool.length === 0 && !state.currentMediaItem) { if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none'; return; }
    if (state.isGlobalSlideshowActive && state.globalMediaPoolForSelection.length === 0) { if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none'; return; }
    if (!state.isGlobalSlideshowActive && state.currentSelectedModelForIndividualView && state.displayedMediaFiles.length === 0) { if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none'; return; }
    if (state.isTimerPlaying) {
        stopSlideshowTimer();
    } else {
        state.isTimerPlaying = true; if (playPauseTimerButton) playPauseTimerButton.textContent = 'Pause';
        if (!state.currentMediaItem) {
            if (state.isGlobalSlideshowActive && state.globalMediaPoolForSelection.length > 0) pickAndDisplayNextGlobalMediaItem();
            else if (!state.isGlobalSlideshowActive && state.displayedMediaFiles.length > 0) navigateMedia(0);
            else { state.isTimerPlaying = false; if (playPauseTimerButton) playPauseTimerButton.textContent = 'Play'; }
        } else {
            const videoExtensions = state.videoExtensions || [];
            const currentFileExtension = `.${state.currentMediaItem.path.split('.').pop().toLowerCase()}`;
            if (videoExtensions.includes(currentFileExtension)) {
                const videoElement = mediaDisplayArea.querySelector('video');
                if (videoElement) {
                    videoElement.loop = false; // Ensure video doesn't loop when timer is turned on
                    if (videoElement.paused && videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
                        videoElement.play().catch(e => console.error("Error trying to play video on timer toggle:", e));
                    }
                    // The onended handler from displayCurrentMedia is responsible for advancement
                    if (countdownProgressBarContainer) countdownProgressBarContainer.style.display = 'none';
                } else { startSlideshowTimer(); /* Fallback if video element somehow not found */ }
            } else { startSlideshowTimer(); /* It's an image */ }
        }
    }
}

export async function pickAndDisplayNextGlobalMediaItem() { /* ... existing pickAndDisplayNextGlobalMediaItem ... */
    if (state.globalMediaPoolForSelection.length === 0) { clearMediaDisplay("Global media pool is empty."); if (countdownProgressBarContainer && !state.isTimerPlaying) { countdownProgressBarContainer.style.display = 'none'; } updateNavButtons(); return; }
    const historySize = Math.min(5, Math.floor(state.globalMediaPoolForSelection.length / 2), state.displayedMediaFiles.length);
    const historyPaths = state.displayedMediaFiles.slice(-historySize).map(item => item.path);
    let newItem = selectWeightedRandom(state.globalMediaPoolForSelection, historyPaths);
    if (newItem && state.currentMediaItem && newItem.path === state.currentMediaItem.path && state.globalMediaPoolForSelection.length > 1) {
        const alternativeItems = state.globalMediaPoolForSelection.filter(item => item.path !== newItem.path);
        if (alternativeItems.length > 0) {
            newItem = selectWeightedRandom(alternativeItems, historyPaths.filter(p => p !== newItem.path));
            if (!newItem) newItem = alternativeItems[Math.floor(Math.random() * alternativeItems.length)];
        }
    }
    if (newItem) {
        if (!state.displayedMediaFiles.find(existingItem => existingItem.path === newItem.path)) { state.displayedMediaFiles.push(newItem); }
        let newIndexInHistory = state.displayedMediaFiles.findIndex(item => item.path === newItem.path);
        if (newIndexInHistory === -1) { state.displayedMediaFiles.push(newItem); newIndexInHistory = state.displayedMediaFiles.length - 1; }
        state.currentMediaIndex = newIndexInHistory; state.currentMediaItem = newItem;
        await displayCurrentMedia();
    } else {
        if (state.globalMediaPoolForSelection.length > 0) {
            state.currentMediaItem = state.globalMediaPoolForSelection[Math.floor(Math.random() * state.globalMediaPoolForSelection.length)];
            if (!state.displayedMediaFiles.find(existingItem => existingItem.path === state.currentMediaItem.path)) { state.displayedMediaFiles.push(state.currentMediaItem); }
            state.currentMediaIndex = state.displayedMediaFiles.findIndex(item => item.path === state.currentMediaItem.path);
            if (state.currentMediaIndex === -1) state.currentMediaIndex = state.displayedMediaFiles.length - 1;
            await displayCurrentMedia();
        } else {
            clearMediaDisplay("Global media pool exhausted.");
            if (countdownProgressBarContainer && !state.isTimerPlaying) { countdownProgressBarContainer.style.display = 'none'; }
            stopSlideshowTimer();
        }
    }
    updateNavButtons();
}
export function prepareMediaListForIndividualView() { /* ... existing prepareMediaListForIndividualView ... */
    if (!state.currentSelectedModelForIndividualView) return;
    const isRandom = state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name] || false;
    state.displayedMediaFiles = generatePlaylistForIndividualModel(state.originalMediaFilesForIndividualView, isRandom);
}

/**
 * Navigates media items. Handles end-of-list for non-random individual slideshows.
 * @param {number} direction - 1 for next, -1 for previous, 0 to re-display.
 */
export async function navigateMedia(direction) {
    let newMediaItemToDisplay = null;
    const previousMediaItemPath = state.currentMediaItem ? state.currentMediaItem.path : null;

    if (state.isGlobalSlideshowActive) {
        if (direction === 1) {
            if (state.currentMediaIndex < state.displayedMediaFiles.length - 1 && state.displayedMediaFiles.length > 0) {
                state.currentMediaIndex++;
                newMediaItemToDisplay = state.displayedMediaFiles[state.currentMediaIndex];
            } else {
                await pickAndDisplayNextGlobalMediaItem(); // This will set newMediaItemToDisplay
                return; // pickAndDisplayNextGlobalMediaItem calls displayCurrentMedia
            }
        } else if (direction === -1) { /* ... existing previous logic ... */
            if (state.currentMediaIndex > 0) {
                state.currentMediaIndex--; newMediaItemToDisplay = state.displayedMediaFiles[state.currentMediaIndex];
            } else { updateNavButtons(); return; }
        } else if (direction === 0 && state.currentMediaItem) {
            newMediaItemToDisplay = state.currentMediaItem;
        } else if (direction === 0 && !state.currentMediaItem && state.globalMediaPoolForSelection.length > 0) {
            await pickAndDisplayNextGlobalMediaItem(); return;
        }
    } else { // Individual model slideshow
        if (state.displayedMediaFiles.length === 0 && direction === 0 && state.currentSelectedModelForIndividualView && state.originalMediaFilesForIndividualView.length > 0) {
            prepareMediaListForIndividualView();
            if (state.displayedMediaFiles.length > 0) {
                state.currentMediaIndex = 0; newMediaItemToDisplay = state.displayedMediaFiles[0];
            } else { clearMediaDisplay("No media files in this model."); }
        } else if (state.displayedMediaFiles.length === 0) {
            // No media
        } else {
            let newIndex = state.currentMediaIndex + direction;
            const isRandomMode = state.currentSelectedModelForIndividualView && state.modelRandomModeSettings[state.currentSelectedModelForIndividualView.name];

            if (newIndex >= state.displayedMediaFiles.length) { // Reached end or went past
                if (isRandomMode) {
                    prepareMediaListForIndividualView();
                    newIndex = state.displayedMediaFiles.length > 0 ? 0 : -1;
                    newMediaItemToDisplay = newIndex !== -1 ? state.displayedMediaFiles[newIndex] : null;
                } else { // Not random, reached end
                    newMediaItemToDisplay = null; // Signal end of list
                    // Keep state.currentMediaIndex at the last valid item for context
                    if (state.isTimerPlaying && direction === 1) { // If timer was advancing and hit the end
                        stopSlideshowTimer();
                    }
                }
            } else if (newIndex < 0) { // Reached beginning or went before
                newIndex = 0; // Stay at first item
                newMediaItemToDisplay = state.displayedMediaFiles[newIndex];
            } else { // Valid new index
                // newIndex = state.currentMediaIndex + direction; // This was already calculated
                newMediaItemToDisplay = state.displayedMediaFiles[newIndex];
            }

            if (newMediaItemToDisplay) {
                state.currentMediaIndex = state.displayedMediaFiles.findIndex(item => item.path === newMediaItemToDisplay.path);
                if (state.currentMediaIndex === -1 && newMediaItemToDisplay) {
                    state.displayedMediaFiles.push(newMediaItemToDisplay);
                    state.currentMediaIndex = state.displayedMediaFiles.length - 1;
                }
            }
        }
    }

    if (newMediaItemToDisplay && newMediaItemToDisplay.path === previousMediaItemPath && direction !== 0) {
        const videoExtensions = state.videoExtensions || [];
        const currentFileIsVideo = state.currentMediaItem && videoExtensions.includes(`.${state.currentMediaItem.path.split('.').pop().toLowerCase()}`);
        // If it's the same item and not a video that just naturally ended (which would have direction=1 from onended)
        // and not an explicit re-display (direction=0), then don't re-process.
        // This check might be too aggressive if a video is manually skipped to its end, then 'next' is clicked.
        // For now, let's assume if newMediaItemToDisplay is set, we process it.
        // The onended handler in ui-updates is more specific about when to advance.
    }

    state.currentMediaItem = newMediaItemToDisplay;

    if (state.currentMediaItem) {
        await displayCurrentMedia();
    } else {
        clearMediaDisplay("End of slideshow or no media.");
        if (state.isTimerPlaying) { // If we cleared display because there's nothing next
            stopSlideshowTimer();
        }
    }
    updateNavButtons();
}

if (countdownProgressBarContainer) {
    countdownProgressBarContainer.style.display = 'none';
}
