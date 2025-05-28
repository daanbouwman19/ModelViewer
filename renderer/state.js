// --- Application State ---
export const state = {
    allModels: [],
    currentSelectedModelForIndividualView: null,
    originalMediaFilesForIndividualView: [],
    globalMediaPoolForSelection: [],
    displayedMediaFiles: [],
    currentMediaItem: null,
    currentMediaIndex: -1,
    modelRandomModeSettings: {}, // object, can be mutated directly on state.modelRandomModeSettings
    modelsSelectedForGlobal: {}, // object, can be mutated directly on state.modelsSelectedForGlobal
    isGlobalSlideshowActive: false,
    slideshowTimerId: null,
    isTimerPlaying: false,
};
