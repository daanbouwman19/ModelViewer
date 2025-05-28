// --- UI Elements ---
export const modelsListElement = document.getElementById('models-list');
export const currentModelTitleElement = document.getElementById('current-model-title');
export const mediaDisplayArea = document.getElementById('media-display-area');
export const mediaPlaceholder = document.getElementById('media-placeholder');
export const fileNameInfoElement = document.getElementById('file-name-info');
export const fileCountInfoElement = document.getElementById('file-count-info');
export const prevMediaButton = document.getElementById('prev-media-button');
export const nextMediaButton = document.getElementById('next-media-button');
export const startGlobalSlideshowButton = document.getElementById('start-global-slideshow-button');
export const timerDurationInput = document.getElementById('timer-duration');
export const playPauseTimerButton = document.getElementById('play-pause-timer-button');
export const reindexLibraryButton = document.getElementById('reindex-library-button');

// For the initial critical elements check, we can also export them as an array or object
export const criticalElements = {
   modelsListElement,
   currentModelTitleElement,
   mediaDisplayArea,
   mediaPlaceholder,
   fileNameInfoElement,
   fileCountInfoElement,
   prevMediaButton,
   nextMediaButton,
   startGlobalSlideshowButton,
   timerDurationInput,
   playPauseTimerButton,
   reindexLibraryButton
};
