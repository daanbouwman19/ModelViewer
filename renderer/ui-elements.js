/**
 * @file Centralizes references to all major UI elements used in the renderer process.
 * Exporting these references from a single module makes it easier to manage element IDs
 * and avoids repeated `document.getElementById` calls throughout the application.
 */

/**
 * The `<ul>` element that displays the list of available models.
 * @type {HTMLUListElement | null}
 */
export const modelsListElement = document.getElementById('models-list');

/**
 * The `<h1>` element that displays the title of the currently selected model or "Global Slideshow".
 * @type {HTMLHeadingElement | null}
 */
export const currentModelTitleElement = document.getElementById(
  'current-model-title',
);

/**
 * The `<button>` that opens a dialog to add a new media directory.
 * @type {HTMLButtonElement | null}
 */
export const addMediaDirectoryButton = document.getElementById('add-media-directory-button');

/**
 * The main `<div>` where images and videos are displayed.
 * @type {HTMLDivElement | null}
 */
export const mediaDisplayArea = document.getElementById('media-display-area');

/**
 * The `<div>` shown inside the media display area when no media is loaded.
 * @type {HTMLDivElement | null}
 */
export const mediaPlaceholder = document.getElementById('media-placeholder');

/**
 * The `<span>` element that displays the name of the current media file.
 * @type {HTMLSpanElement | null}
 */
export const fileNameInfoElement = document.getElementById('file-name-info');

/**
 * The `<span>` element that displays the current position in the playlist (e.g., "3 / 10").
 * @type {HTMLSpanElement | null}
 */
export const fileCountInfoElement = document.getElementById('file-count-info');

/**
 * The `<button>` for navigating to the previous media item.
 * @type {HTMLButtonElement | null}
 */
export const prevMediaButton = document.getElementById('prev-media-button');

/**
 * The `<button>` for navigating to the next media item.
 * @type {HTMLButtonElement | null}
 */
export const nextMediaButton = document.getElementById('next-media-button');

/**
 * The `<button>` that starts the global slideshow mode.
 * @type {HTMLButtonElement | null}
 */
export const startGlobalSlideshowButton = document.getElementById(
  'start-global-slideshow-button',
);

/**
 * The `<input type="number">` field for setting the slideshow timer duration.
 * @type {HTMLInputElement | null}
 */
export const timerDurationInput = document.getElementById('timer-duration');

/**
 * The `<button>` to play or pause the slideshow timer.
 * @type {HTMLButtonElement | null}
 */
export const playPauseTimerButton = document.getElementById(
  'play-pause-timer-button',
);

/**
 * The `<button>` that triggers a re-scan of the media library.
 * @type {HTMLButtonElement | null}
 */
export const reindexLibraryButton = document.getElementById(
  'reindex-library-button',
);

/**
 * An object containing references to all critical UI elements.
 * This is used for an initial check in `renderer.js` to ensure the application
 * can start up correctly. If any of these elements are missing, the application
 * will halt initialization and display an error.
 * @type {Object<string, HTMLElement | null>}
 */
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
  reindexLibraryButton,
  addMediaDirectoryButton,
};
