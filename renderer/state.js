// --- Application State ---
// This object holds the central state for the renderer process.
// It includes data about models, current selections, slideshow status, and UI settings.
export const state = {
    /** @type {Array<Object>} List of all models, each with name and textures array. */
    allModels: [],

    /** @type {Object | null} The currently selected model for individual slideshow. */
    currentSelectedModelForIndividualView: null,

    /** @type {Array<Object>} Original list of media files for the currently selected individual model. */
    originalMediaFilesForIndividualView: [],

    /** @type {Array<Object>} Pool of media files eligible for the global slideshow. */
    globalMediaPoolForSelection: [],

    /**
     * @type {Array<Object>}
     * For individual mode: The current playlist (possibly shuffled) for the selected model.
     * For global mode: A history of recently displayed items from the global pool.
     */
    displayedMediaFiles: [],

    /** @type {Object | null} The media item currently being displayed or about to be displayed. */
    currentMediaItem: null,

    /** @type {number} Index of the currentMediaItem within displayedMediaFiles. */
    currentMediaIndex: -1,

    /** @type {Object<string, boolean>} Settings for random playback mode per model. Keys are model names. */
    modelRandomModeSettings: {},

    /** @type {Object<string, boolean>} Settings for including models in the global slideshow. Keys are model names. */
    modelsSelectedForGlobal: {},

    /** @type {boolean} Flag indicating if the global slideshow is active. */
    isGlobalSlideshowActive: false,

    /** @type {NodeJS.Timeout | null} ID of the slideshow timer interval. */
    slideshowTimerId: null,

    /** @type {boolean} Flag indicating if the slideshow timer is currently playing. */
    isTimerPlaying: false,

    /** @type {NodeJS.Timeout | null} ID of the interval that updates the progress bar. */
    progressBarUpdateIntervalId: null,

    /** @type {number} Timestamp (Date.now()) when the current timer period started. */
    timerStartTime: 0,

    /** @type {number} Duration of the current timer cycle in seconds. */
    currentTimerDurationSeconds: 0,

    /** @type {string[]} List of supported image file extensions. Loaded at startup. */
    imageExtensions: [],

    /** @type {string[]} List of supported video file extensions. Loaded at startup. */
    videoExtensions: []
};
