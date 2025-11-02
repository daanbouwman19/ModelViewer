/**
 * @file Manages the central state for the renderer process.
 * This single `state` object holds all dynamic data required for the UI to function,
 * including the list of all media models, the current user selections, slideshow status,
 * and various UI settings.
 */

/**
 * @typedef {Object} MediaFile
 * @property {string} name - The name of the media file (e.g., 'image.jpg').
 * @property {string} path - The full, absolute path to the media file.
 * @property {number} [viewCount] - The number of times this file has been viewed.
 */

/**
 * @typedef {Object} Model
 * @property {string} name - The name of the model, typically the folder name.
 * @property {Array<MediaFile>} textures - An array of media files belonging to this model.
 */

/**
 * This object holds the central state for the renderer process.
 * It includes data about models, current selections, slideshow status, and UI settings.
 */
export const state = {
  /**
   * The complete list of all models discovered by the media scanner.
   * @type {Array<Model>}
   */
  allModels: [],

  /**
   * The model object that is currently selected for individual viewing.
   * Null if the global slideshow is active or no model is selected.
   * @type {Model | null}
   */
  currentSelectedModelForIndividualView: null,

  /**
   * The original, unsorted list of media files for the currently selected individual model.
   * This is kept to restore the original order when toggling random mode off.
   * @type {Array<MediaFile>}
   */
  originalMediaFilesForIndividualView: [],

  /**
   * A flat array of all media files from all models that are currently selected
   * for inclusion in the global slideshow.
   * @type {Array<MediaFile>}
   */
  globalMediaPoolForSelection: [],

  /**
   * Represents the current "playlist".
   * In individual mode, it's the (potentially shuffled) list of media for the selected model.
   * In global mode, it acts as a history of recently displayed items to avoid immediate repeats.
   * @type {Array<MediaFile>}
   */
  displayedMediaFiles: [],

  /**
   * The specific media item that is currently being displayed on the screen.
   * @type {MediaFile | null}
   */
  currentMediaItem: null,

  /**
   * The index of `currentMediaItem` within the `displayedMediaFiles` array.
   * This is crucial for navigating back and forth in the playlist.
   * @type {number}
   */
  currentMediaIndex: -1,

  /**
   * A map where keys are model names and values are booleans indicating if
   * random playback mode is enabled for that model's individual slideshow.
   * @type {Object<string, boolean>}
   */
  modelRandomModeSettings: {},

  /**
   * A map where keys are model names and values are booleans indicating if
   * the model is included in the global slideshow.
   * @type {Object<string, boolean>}
   */
  modelsSelectedForGlobal: {},

  /**
   * A flag that is true when the global slideshow is active, and false when in
   * individual model view mode.
   * @type {boolean}
   */
  isGlobalSlideshowActive: false,

  /**
   * Holds the timer ID returned by `setInterval` for the slideshow.
   * Null when the timer is not running.
   * @type {NodeJS.Timeout | null}
   */
  slideshowTimerId: null,

  /**
   * A flag indicating if the slideshow timer is currently active (playing).
   * This is toggled by the play/pause button.
   * @type {boolean}
   */
  isTimerPlaying: false,

  /**
   * The current media filter ('All', 'Images', 'Videos').
   * @type {string}
   */
  currentMediaFilter: 'All',

  /**
   * An object containing arrays of supported file extensions.
   * @type {{images: string[], videos: string[], all: string[]}}
   */
  supportedExtensions: { images: [], videos: [], all: [] },
};
