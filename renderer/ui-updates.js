import {
    mediaDisplayArea,
    mediaPlaceholder,
    fileNameInfoElement,
    fileCountInfoElement,
    prevMediaButton,
    nextMediaButton,
    playPauseTimerButton,
    countdownProgressBarContainer
} from './ui-elements.js';
import { state } from './state.js';
import { navigateMedia, startSlideshowTimer, stopSlideshowTimer } from './slideshow.js';

/**
 * Displays the current media item (image or video) in the media display area.
 */
export async function displayCurrentMedia() {
    const mediaFileToDisplay = state.currentMediaItem;

    if (!mediaFileToDisplay) {
        const message = state.isGlobalSlideshowActive ?
            "No media item selected for global display." :
            (state.currentSelectedModelForIndividualView ?
                "No media to display for this model." :
                "No media selected.");
        clearMediaDisplay(message);
        updateNavButtons();
        return;
    }

    mediaDisplayArea.innerHTML = '';
    if (mediaPlaceholder) mediaPlaceholder.style.display = 'none';

    const loadingText = document.createElement('p');
    loadingText.textContent = `Loading ${mediaFileToDisplay.name}...`;
    loadingText.className = 'text-gray-400 absolute inset-0 flex items-center justify-center';
    mediaDisplayArea.appendChild(loadingText);

    try {
        if (mediaFileToDisplay.path) {
            await window.electronAPI.recordMediaView(mediaFileToDisplay.path);
            state.currentMediaItem.viewCount = (state.currentMediaItem.viewCount || 0) + 1;
        }

        const loadResult = await window.electronAPI.loadFileAsDataURL(mediaFileToDisplay.path);

        if (loadingText.parentNode === mediaDisplayArea) {
            mediaDisplayArea.removeChild(loadingText);
        }

        if (!loadResult || loadResult.type === 'error') {
            throw new Error(loadResult ? loadResult.message : 'Failed to get load result from main process.');
        }

        let mediaElement;
        const imageExtensions = state.imageExtensions || [];
        const videoExtensions = state.videoExtensions || [];
        const fileExtensionWithDot = `.${mediaFileToDisplay.path.split('.').pop().toLowerCase()}`;

        if (imageExtensions.includes(fileExtensionWithDot)) {
            mediaElement = document.createElement('img');
            mediaElement.alt = mediaFileToDisplay.name;
            if (state.isTimerPlaying && state.slideshowTimerId === null && !videoExtensions.includes(fileExtensionWithDot)) {
                // If timer is supposed to be playing and this is an image (and not a video that just ended)
                // and the main timer isn't running (e.g. after a video just finished), restart it.
                startSlideshowTimer();
            }
        } else if (videoExtensions.includes(fileExtensionWithDot)) {
            mediaElement = document.createElement('video');
            mediaElement.controls = true;
            mediaElement.autoplay = true;
            mediaElement.muted = false;
            mediaElement.preload = 'auto';
            mediaElement.loop = !state.isTimerPlaying; // Only loop if timer is OFF

            if (state.isTimerPlaying) {
                // Timer is active: video should play once, then navigate.
                // Suspend the main slideshow timer and progress bar.
                if (state.slideshowTimerId) {
                    clearInterval(state.slideshowTimerId);
                    state.slideshowTimerId = null;
                }
                if (state.progressBarUpdateIntervalId) {
                    clearInterval(state.progressBarUpdateIntervalId);
                    state.progressBarUpdateIntervalId = null;
                }
                if (countdownProgressBarContainer) {
                    countdownProgressBarContainer.style.display = 'none';
                }

                mediaElement.onended = async () => {
                    // Ensure this onended logic only runs if the timer is still meant to be active
                    // and for the video that actually ended.
                    if (state.isTimerPlaying && state.currentMediaItem && state.currentMediaItem.path === mediaFileToDisplay.path) {
                        await navigateMedia(1); // Attempt to move to the next item

                        // After navigateMedia, re-evaluate state:
                        // If timer is still supposed to be playing and there's a new item:
                        if (state.isTimerPlaying && state.currentMediaItem) {
                            const newFileExt = `.${state.currentMediaItem.path.split('.').pop().toLowerCase()}`;
                            if (!(state.videoExtensions || []).includes(newFileExt)) {
                                // New item is not a video, restart the fixed interval timer
                                startSlideshowTimer();
                            }
                            // If new item is a video, its own displayCurrentMedia will set up its onended.
                        } else if (state.isTimerPlaying && !state.currentMediaItem) {
                            // Timer was playing, but navigateMedia resulted in no current item (end of list/pool)
                            stopSlideshowTimer();
                        }
                        // If state.isTimerPlaying became false (e.g. navigateMedia stopped it), do nothing more.
                    }
                };
            }
        } else {
            mediaElement = document.createElement('p');
            mediaElement.textContent = `Unsupported file type: ${mediaFileToDisplay.name}`;
            mediaElement.className = 'text-red-400 absolute inset-0 flex items-center justify-center';
        }

        mediaElement.src = loadResult.url;
        if (mediaElement.tagName === 'VIDEO' || mediaElement.tagName === 'IMG') {
            mediaElement.onerror = (e) => { /* ... existing error handling ... */ };
        }
        // if (mediaElement.tagName === 'VIDEO') {
        //     mediaElement.onloadedmetadata = () => console.debug(`Video metadata loaded for: ${mediaFileToDisplay.name}`);
        // }

        if (!mediaDisplayArea.querySelector('.text-red-400')) {
            mediaDisplayArea.appendChild(mediaElement);
        }

    } catch (error) {
        console.error(`Error displaying media ${mediaFileToDisplay.name} (Path: ${mediaFileToDisplay.path}):`, error);
        if (mediaDisplayArea.contains(loadingText)) mediaDisplayArea.removeChild(loadingText);
        mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute inset-0 flex items-center justify-center">Error loading: ${mediaFileToDisplay.name}. ${error.message}. Check console.</p>`;
    }

    if (fileNameInfoElement && state.currentMediaItem) { /* ... update info ... */ }
    if (fileCountInfoElement) { /* ... update info ... */ }
    updateNavButtons();
}

/** Clears the media display area */
export function clearMediaDisplay(message = "Select a model or start Global Slideshow.") {
    if (mediaDisplayArea) mediaDisplayArea.innerHTML = '';
    if (mediaPlaceholder) {
        mediaPlaceholder.textContent = message;
        mediaPlaceholder.style.display = 'block';
    }
    if (fileNameInfoElement) fileNameInfoElement.innerHTML = '&nbsp;';
    if (fileCountInfoElement) fileCountInfoElement.innerHTML = '&nbsp;';
    state.currentMediaItem = null;
    if (!state.isTimerPlaying && countdownProgressBarContainer) {
        countdownProgressBarContainer.style.display = 'none';
    }
}

/** Updates navigation buttons' state */
export function updateNavButtons() {
    if (!prevMediaButton || !nextMediaButton || !playPauseTimerButton) return;
    const noMediaAvailableForTimer = (state.isGlobalSlideshowActive && state.globalMediaPoolForSelection.length === 0) ||
        (!state.isGlobalSlideshowActive && state.displayedMediaFiles.length === 0);
    if (state.isGlobalSlideshowActive) {
        prevMediaButton.disabled = state.currentMediaIndex <= 0;
        nextMediaButton.disabled = state.globalMediaPoolForSelection.length === 0;
        playPauseTimerButton.disabled = noMediaAvailableForTimer && !state.currentMediaItem;
    } else {
        prevMediaButton.disabled = state.currentMediaIndex <= 0;
        nextMediaButton.disabled = (state.displayedMediaFiles.length === 0 || state.currentMediaIndex >= state.displayedMediaFiles.length - 1);
        playPauseTimerButton.disabled = noMediaAvailableForTimer && !state.currentMediaItem;
    }
}
