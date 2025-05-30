import {
    mediaDisplayArea,
    mediaPlaceholder,
    fileNameInfoElement,
    fileCountInfoElement,
    prevMediaButton,
    nextMediaButton,
    playPauseTimerButton,
    countdownProgressBarContainer // Added for clearMediaDisplay
} from './ui-elements.js';
import { state } from './state.js';

/**
 * Displays the current media item (image or video) in the media display area.
 * Handles loading via Data URL or HTTP URL from the main process.
 * Records a view for the media item.
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

    mediaDisplayArea.innerHTML = ''; // Clear previous media
    if (mediaPlaceholder) mediaPlaceholder.style.display = 'none'; // Hide placeholder

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
            const errorMsg = loadResult ? loadResult.message : 'Failed to get load result from main process.';
            throw new Error(errorMsg);
        }

        let mediaElement;
        const fileExtension = mediaFileToDisplay.path.split('.').pop().toLowerCase();
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
        const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];

        if (imageExtensions.includes(fileExtension)) {
            mediaElement = document.createElement('img');
            mediaElement.alt = mediaFileToDisplay.name;
        } else if (videoExtensions.includes(fileExtension)) {
            mediaElement = document.createElement('video');
            mediaElement.controls = true;
            mediaElement.autoplay = true;
            mediaElement.muted = false;
            mediaElement.loop = !state.isTimerPlaying;
            mediaElement.preload = 'auto';

            if (state.isTimerPlaying) {
                mediaElement.onended = () => {
                    // This is tricky due to module boundaries.
                    // Ideally, this would call navigateMedia(1) from slideshow.js
                    // For now, this event will trigger the main interval timer to advance.
                    // If the video ends *before* the timer, the timer will still fire.
                    // If it ends *after*, the timer would have already advanced.
                    // This specific onended behavior might need refinement if precise video-end navigation is critical
                    // while the timer is also active.
                    console.log("Video ended, timer will advance if still active.");
                };
            }
        } else {
            mediaElement = document.createElement('p');
            mediaElement.textContent = `Unsupported file type: ${mediaFileToDisplay.name}`;
            mediaElement.className = 'text-red-400 absolute inset-0 flex items-center justify-center';
        }

        mediaElement.src = loadResult.url;

        if (mediaElement.tagName === 'VIDEO' || mediaElement.tagName === 'IMG') {
            mediaElement.onerror = (e) => {
                const errorSource = e.target;
                let errorMessage = `Error loading media: ${mediaFileToDisplay.name}.`;
                if (errorSource && errorSource.error) {
                    errorMessage += ` Code: ${errorSource.error.code}, Message: ${errorSource.error.message || 'No specific message.'}`;
                }
                console.error(errorMessage, e);
                if (mediaDisplayArea.contains(loadingText)) mediaDisplayArea.removeChild(loadingText);
                mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute inset-0 flex items-center justify-center">${errorMessage} Check console.</p>`;
            };
        }
        if (mediaElement.tagName === 'VIDEO') {
            mediaElement.onloadedmetadata = () => console.log(`Video metadata loaded for: ${mediaFileToDisplay.name}`);
        }

        if (!mediaDisplayArea.querySelector('.text-red-400')) {
            mediaDisplayArea.appendChild(mediaElement);
        }

    } catch (error) {
        console.error(`Error displaying media ${mediaFileToDisplay.name} (Path: ${mediaFileToDisplay.path}):`, error);
        if (mediaDisplayArea.contains(loadingText)) mediaDisplayArea.removeChild(loadingText);
        mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute inset-0 flex items-center justify-center">Error loading: ${mediaFileToDisplay.name}. ${error.message}. Check console.</p>`;
    }

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
 * Clears the media display area and shows a placeholder message.
 * @param {string} [message="Select a model or start Global Slideshow."] - The message to display.
 */
export function clearMediaDisplay(message = "Select a model or start Global Slideshow.") {
    if (mediaDisplayArea) mediaDisplayArea.innerHTML = '';
    if (mediaPlaceholder) {
        mediaPlaceholder.textContent = message;
        mediaPlaceholder.style.display = 'block';
    }
    if (fileNameInfoElement) fileNameInfoElement.innerHTML = '&nbsp;';
    if (fileCountInfoElement) fileCountInfoElement.innerHTML = '&nbsp;';

    state.currentMediaItem = null;

    // If clearing display and timer isn't playing, ensure progress bar is hidden.
    if (!state.isTimerPlaying && countdownProgressBarContainer) {
        countdownProgressBarContainer.style.display = 'none';
    }
    // updateNavButtons(); // Typically called by the function that calls clearMediaDisplay
}

/**
 * Updates the enabled/disabled state of navigation and timer buttons
 * based on the current application state.
 */
export function updateNavButtons() {
    if (!prevMediaButton || !nextMediaButton || !playPauseTimerButton) return;

    if (state.isGlobalSlideshowActive) {
        prevMediaButton.disabled = state.currentMediaIndex <= 0;
        nextMediaButton.disabled = state.globalMediaPoolForSelection.length === 0;
        playPauseTimerButton.disabled = state.globalMediaPoolForSelection.length === 0;
    } else { // Individual model mode
        prevMediaButton.disabled = state.currentMediaIndex <= 0;
        nextMediaButton.disabled = (state.displayedMediaFiles.length === 0 || state.currentMediaIndex >= state.displayedMediaFiles.length - 1);
        playPauseTimerButton.disabled = state.displayedMediaFiles.length === 0;
    }
}
