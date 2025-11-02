/**
 * @jest-environment jsdom
 * @file Unit tests for the slideshow logic.
 */

describe('slideshow.js', () => {
  let shuffleArray,
    selectWeightedRandom,
    generatePlaylistForIndividualModel,
    navigateMedia,
    startSlideshowTimer,
    stopSlideshowTimer,
    toggleSlideshowTimer,
    pickAndDisplayNextGlobalMediaItem,
    prepareMediaListForIndividualView;
  let state;
  let uiUpdates;
  let uiElements;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('../renderer/ui-updates.js', () => ({
      displayCurrentMedia: jest.fn(),
      updateNavButtons: jest.fn(),
      clearMediaDisplay: jest.fn(),
    }));

    // Mock ui-elements as it depends on the DOM on load
    jest.mock('../renderer/ui-elements.js', () => ({
      timerDurationInput: { value: '1' },
      playPauseTimerButton: { textContent: '' },
    }));

    const slideshow = require('../renderer/slideshow.js');
    shuffleArray = slideshow.shuffleArray;
    selectWeightedRandom = slideshow.selectWeightedRandom;
    generatePlaylistForIndividualModel =
      slideshow.generatePlaylistForIndividualModel;
    navigateMedia = slideshow.navigateMedia;
    startSlideshowTimer = slideshow.startSlideshowTimer;
    stopSlideshowTimer = slideshow.stopSlideshowTimer;
    toggleSlideshowTimer = slideshow.toggleSlideshowTimer;
    pickAndDisplayNextGlobalMediaItem =
      slideshow.pickAndDisplayNextGlobalMediaItem;
    prepareMediaListForIndividualView =
      slideshow.prepareMediaListForIndividualView;

    state = require('../renderer/state.js').state;
    uiUpdates = require('../renderer/ui-updates.js');
    uiElements = require('../renderer/ui-elements.js');

    // Reset state
    state.currentMediaItem = null;
    state.currentMediaIndex = -1;
    state.displayedMediaFiles = [];
    state.isGlobalSlideshowActive = false;
    state.globalMediaPoolForSelection = [];
    state.modelRandomModeSettings = {};
    state.currentSelectedModelForIndividualView = null;
    state.originalMediaFilesForIndividualView = [];
    state.slideshowTimerId = null;
    state.isTimerPlaying = false;

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('shuffleArray', () => {
    it('should return a new array with the same elements in a different order', () => {
      const originalArray = [1, 2, 3, 4, 5];
      const spy = jest.spyOn(global.Math, 'random').mockReturnValue(0.5);
      const shuffledArray = shuffleArray(originalArray);
      expect(shuffledArray).toHaveLength(originalArray.length);
      expect(shuffledArray).not.toEqual(originalArray);
      expect(shuffledArray.sort()).toEqual(originalArray.sort());
      spy.mockRestore();
    });

    it('should not mutate the original array', () => {
      const originalArray = [1, 2, 3, 4, 5];
      const originalArrayCopy = [...originalArray];
      shuffleArray(originalArray);
      expect(originalArray).toEqual(originalArrayCopy);
    });
  });

  describe('selectWeightedRandom', () => {
    it('should select items with higher weight more often', () => {
      const items = [
        { path: 'a', viewCount: 100 },
        { path: 'b', viewCount: 0 },
      ];
      const selections = { a: 0, b: 0 };
      for (let i = 0; i < 100; i++) {
        const selected = selectWeightedRandom(items);
        selections[selected.path]++;
      }
      expect(selections['b']).toBeGreaterThan(selections['a']);
    });

    it('should fallback to the full list if all items are excluded', () => {
      const items = [
        { path: 'a', viewCount: 0 },
        { path: 'b', viewCount: 1 },
      ];
      const selected = selectWeightedRandom(items, ['a', 'b']);
      expect(selected).not.toBeNull();
    });

    it('should handle items with no view count', () => {
      const items = [{ path: 'a' }, { path: 'b' }];
      const selected = selectWeightedRandom(items);
      expect(selected).not.toBeNull();
    });

    it('should return null if items is null or empty', () => {
      expect(selectWeightedRandom(null)).toBeNull();
      expect(selectWeightedRandom([])).toBeNull();
    });
  });

  describe('generatePlaylistForIndividualModel', () => {
    it('should return a shuffled playlist when isRandom is true', () => {
      const mediaPool = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
      const spy = jest.spyOn(global.Math, 'random').mockReturnValue(0.5);
      const playlist = generatePlaylistForIndividualModel(mediaPool, true);
      expect(playlist).toHaveLength(mediaPool.length);
      expect(playlist).not.toEqual(mediaPool);
      spy.mockRestore();
    });

    it('should return the original playlist when isRandom is false', () => {
      const mediaPool = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
      const playlist = generatePlaylistForIndividualModel(mediaPool, false);
      expect(playlist).toEqual(mediaPool);
    });
  });

  describe('navigateMedia', () => {
    it('should navigate to the next media item in individual mode', () => {
      state.displayedMediaFiles = [{ path: 'a.jpg' }, { path: 'b.jpg' }];
      state.currentMediaIndex = 0;
      navigateMedia(1);
      expect(state.currentMediaIndex).toBe(1);
      expect(uiUpdates.displayCurrentMedia).toHaveBeenCalled();
    });

    it('should navigate to the previous media item in individual mode', () => {
      state.displayedMediaFiles = [{ path: 'a.jpg' }, { path: 'b.jpg' }];
      state.currentMediaIndex = 1;
      navigateMedia(-1);
      expect(state.currentMediaIndex).toBe(0);
      expect(uiUpdates.displayCurrentMedia).toHaveBeenCalled();
    });

    it('should pick a new item in global mode when navigating next at the end of the history', () => {
      state.isGlobalSlideshowActive = true;
      state.globalMediaPoolForSelection = [
        { path: 'a.jpg' },
        { path: 'b.jpg' },
      ];
      state.displayedMediaFiles = [{ path: 'a.jpg' }];
      state.currentMediaIndex = 0;
      navigateMedia(1);
      expect(state.currentMediaIndex).toBe(1);
      expect(uiUpdates.displayCurrentMedia).toHaveBeenCalled();
      expect(state.displayedMediaFiles.length).toBe(2);
    });
  });

  describe('timers', () => {
    it('should start and stop the timer', () => {
      startSlideshowTimer();
      expect(state.slideshowTimerId).not.toBeNull();
      stopSlideshowTimer();
      expect(state.slideshowTimerId).toBeNull();
    });

    it('should handle invalid timer duration', () => {
      uiElements.timerDurationInput.value = 'abc';
      startSlideshowTimer();
      expect(state.slideshowTimerId).toBeNull();
      expect(uiElements.timerDurationInput.value).toBe(5);
    });

    it('should toggle the timer', () => {
      state.globalMediaPoolForSelection = [{ path: 'a.jpg' }];
      state.isGlobalSlideshowActive = true;
      toggleSlideshowTimer();
      expect(state.isTimerPlaying).toBe(true);
      expect(uiElements.playPauseTimerButton.textContent).toBe('Pause');
      toggleSlideshowTimer();
      expect(state.isTimerPlaying).toBe(false);
      expect(uiElements.playPauseTimerButton.textContent).toBe('Play');
    });

    it('should advance slideshow in global mode when timer ticks', () => {
      state.isGlobalSlideshowActive = true;
      state.globalMediaPoolForSelection = [
        { path: 'a.jpg' },
        { path: 'b.jpg' },
      ];
      startSlideshowTimer();
      jest.runOnlyPendingTimers();
      expect(uiUpdates.displayCurrentMedia).toHaveBeenCalledTimes(1);
    });

    it('should advance slideshow in individual mode when timer ticks', () => {
      state.isGlobalSlideshowActive = false;
      state.displayedMediaFiles = [{ path: 'a.jpg' }, { path: 'b.jpg' }];
      state.currentMediaIndex = 0;
      startSlideshowTimer();
      jest.runOnlyPendingTimers();
      expect(state.currentMediaIndex).toBe(1);
    });
  });

  describe('pickAndDisplayNextGlobalMediaItem', () => {
    it('should pick and display a new item', () => {
      state.globalMediaPoolForSelection = [
        { path: 'a.jpg' },
        { path: 'b.jpg' },
      ];
      pickAndDisplayNextGlobalMediaItem();
      expect(state.currentMediaItem).not.toBeNull();
      expect(uiUpdates.displayCurrentMedia).toHaveBeenCalled();
    });

    it('should clear display if no media is available', () => {
      state.globalMediaPoolForSelection = [];
      pickAndDisplayNextGlobalMediaItem();
      expect(uiUpdates.clearMediaDisplay).toHaveBeenCalled();
    });
  });

  describe('prepareMediaListForIndividualView', () => {
    it('should prepare a media list for an individual view', () => {
      state.currentSelectedModelForIndividualView = { name: 'test' };
      state.originalMediaFilesForIndividualView = [
        { path: 'a.jpg' },
        { path: 'b.jpg' },
      ];
      prepareMediaListForIndividualView();
      expect(state.displayedMediaFiles).toHaveLength(2);
    });
  });
});
