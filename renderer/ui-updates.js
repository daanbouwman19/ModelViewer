import {
    modelsListElement,
    currentModelTitleElement,
    mediaDisplayArea,
    mediaPlaceholder,
    fileNameInfoElement,
    fileCountInfoElement,
    prevMediaButton,
    nextMediaButton,
    playPauseTimerButton // Added, as updateNavButtons modifies it
} from './ui-elements.js';
import { state } from './state.js';
// Note: Some UI update functions might call other UI update functions or slideshow functions.
// For now, we are only moving the core DOM update functions.
// If displayCurrentMedia calls (for example) navigateMedia or pickAndDisplayNextGlobalMediaItem,
// those calls will remain for now, and will be dealt with when slideshow.js or event-handlers.js is created.

export async function populateModelsListUI() {
    // --- Function body of populateModelsListUI from renderer.js ---
    // Ensure all references to global state (like allModels) are prefixed with state.
    // Ensure all references to UI elements are direct (e.g., modelsListElement).
    // Be careful with functions defined in renderer.js that are called by this function,
    // e.g. selectModelForIndividualView. For now, those would become undefined.
    // This indicates populateModelsListUI might be more of an event handler setup or part of a larger UI controller.
    //
    // REVISED APPROACH: For populateModelsListUI, it also attaches event listeners which call
    // functions like selectModelForIndividualView. This makes it more than just a UI update.
    // For this step, we will move the DOM manipulation parts, but the event listener attachment
    // that calls functions still in renderer.js (like selectModelForIndividualView) is problematic.
    //
    // Let's focus on moving functions that *primarily* update DOM and have fewer complex dependencies first.
    // populateModelsListUI is complex. Let's defer it or simplify what's moved.
    //
    // Alternative for populateModelsListUI:
    // It could take 'selectModelForIndividualViewCallback' and 'modelRandomModeToggleCallback' etc. as arguments.
    // This is getting too complex for a simple refactor step.
    //
    // For now, let's assume populateModelsListUI will be refactored more deeply later
    // and only move its direct DOM clearing and list item creation parts if easily separable.
    // Or, leave it in renderer.js for this step and tackle it during event-handler separation.
    //
    // --> Decision: Defer populateModelsListUI for now. It's too entangled with event handlers
    //     that use functions not yet moved (selectModelForIndividualView, etc.).
    //     It will be refactored when event-handlers.js is created.
}

export async function displayCurrentMedia() {
    const mediaFileToDisplay = state.currentMediaItem;

    if (!mediaFileToDisplay) {
        const message = state.isGlobalSlideshowActive ? "No media item selected for global display." : (state.currentSelectedModelForIndividualView ? "No media to display for this model." : "No media selected.");
        clearMediaDisplay(message); // Assumes clearMediaDisplay is in this file
        // if (state.isTimerPlaying && state.isGlobalSlideshowActive && state.globalMediaPoolForSelection.length > 0) {
        //     pickAndDisplayNextGlobalMediaItem(); // This will be broken
        // } else {
        //     stopSlideshowTimer(); // This will be broken
        // }
        updateNavButtons(); // Assumes updateNavButtons is in this file
        return;
    }

    mediaDisplayArea.innerHTML = '';
    mediaPlaceholder.style.display = 'none';
    const loadingText = document.createElement('p');
    loadingText.textContent = `Loading ${mediaFileToDisplay.name}...`;
    loadingText.className = 'text-gray-400 absolute';
    mediaDisplayArea.appendChild(loadingText);

    try {
        if (mediaFileToDisplay && mediaFileToDisplay.path) {
            await window.electronAPI.recordMediaView(mediaFileToDisplay.path);
            state.currentMediaItem.viewCount = (state.currentMediaItem.viewCount || 0) + 1; // Modify state directly
        }

        const loadResult = await window.electronAPI.loadFileAsDataURL(mediaFileToDisplay.path);
        if (loadingText.parentNode === mediaDisplayArea) mediaDisplayArea.removeChild(loadingText);

        if (!loadResult || loadResult.type === 'error') {
            const errorMsg = loadResult ? loadResult.message : 'Failed to get load result from main process';
            throw new Error(errorMsg);
        }

        let mediaElement;
        const fileExtension = mediaFileToDisplay.path.split('.').pop().toLowerCase();
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']; // Consider moving to constants if not already
        const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']; // Consider moving to constants

        if (imageExtensions.includes(fileExtension)) {
            mediaElement = document.createElement('img');
            mediaElement.alt = mediaFileToDisplay.name;
        } else if (videoExtensions.includes(fileExtension)) {
            mediaElement = document.createElement('video');
            mediaElement.controls = true;
            mediaElement.autoplay = true;
            mediaElement.muted = false;
            mediaElement.loop = !state.isTimerPlaying; // Use state
            mediaElement.preload = 'auto';
            // if (state.isTimerPlaying) { // This logic involves navigateMedia
            //     mediaElement.onended = () => { if (state.isTimerPlaying) navigateMedia(1); };
            // }
        } else {
            mediaElement = document.createElement('p');
            mediaElement.textContent = `Unsupported: ${mediaFileToDisplay.name}`;
            mediaElement.className = 'text-red-400 absolute';
        }

        mediaElement.src = loadResult.url;

        if (mediaElement.tagName === 'VIDEO' || mediaElement.tagName === 'IMG') {
            mediaElement.onerror = (e) => {
                const errorSource = e.target;
                let errorMessage = `Error loading ${mediaFileToDisplay.name}.`;
                if (errorSource.error) {
                    errorMessage += ` Code: ${errorSource.error.code}, Message: ${errorSource.error.message || 'No specific message.'}`;
                }
                console.error(errorMessage, e);
                if (mediaDisplayArea.contains(loadingText)) mediaDisplayArea.removeChild(loadingText);
                mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute">${errorMessage}. Check console.</p>`;
            };
        }
        if (mediaElement.tagName === 'VIDEO') {
            mediaElement.onloadedmetadata = () => console.log(`Video metadata loaded: ${mediaFileToDisplay.name}`);
        }

        if (!mediaDisplayArea.querySelector('.text-red-400')) {
            mediaDisplayArea.appendChild(mediaElement);
        }
    } catch (error) {
        console.error(`Error displaying media ${mediaFileToDisplay.name} (Path: ${mediaFileToDisplay.path}):`, error);
        if (mediaDisplayArea.contains(loadingText)) mediaDisplayArea.removeChild(loadingText);
        mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute">Error loading: ${mediaFileToDisplay.name}. ${error.message}. Check console.</p>`;
    }

    fileNameInfoElement.textContent = `${state.currentMediaItem.name} (Viewed: ${state.currentMediaItem.viewCount || 0} times)`;
    if (state.isGlobalSlideshowActive) {
        fileCountInfoElement.textContent = `Global Slideshow - Item ${state.currentMediaIndex + 1} of ${state.displayedMediaFiles.length} (Pool: ${state.globalMediaPoolForSelection.length} items)`;
    } else {
        fileCountInfoElement.textContent = `File ${state.currentMediaIndex + 1} of ${state.displayedMediaFiles.length}`;
    }
    updateNavButtons(); // Assumes this is in the same file
}

export function clearMediaDisplay(message = "Select a model or start Global Slideshow.") {
    mediaDisplayArea.innerHTML = '';
    mediaPlaceholder.textContent = message;
    mediaPlaceholder.style.display = 'block';
    fileNameInfoElement.textContent = '\u00A0';
    fileCountInfoElement.textContent = '\u00A0';
    state.currentMediaItem = null;
    // if (state.isTimerPlaying && (!state.isGlobalSlideshowActive || state.globalMediaPoolForSelection.length === 0)) {
    //     stopSlideshowTimer(); // This will be broken
    // }
}

export function updateNavButtons() {
    if (state.isGlobalSlideshowActive) {
        prevMediaButton.disabled = state.currentMediaIndex <= 0;
        nextMediaButton.disabled = state.globalMediaPoolForSelection.length === 0;
        playPauseTimerButton.disabled = state.globalMediaPoolForSelection.length === 0;
    } else {
        prevMediaButton.disabled = state.currentMediaIndex <= 0;
        nextMediaButton.disabled = (state.currentMediaIndex >= state.displayedMediaFiles.length - 1 || state.displayedMediaFiles.length === 0);
        playPauseTimerButton.disabled = state.displayedMediaFiles.length === 0;
    }
}
