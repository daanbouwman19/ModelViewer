/**
 * @jest-environment jsdom
 * @file Unit tests for the UI updates logic.
 */

// Mock dependencies at the top level
jest.mock('../renderer/ui-elements.js', () => ({
  mediaDisplayArea: {
    innerHTML: '',
    style: {},
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelector: jest.fn(),
    contains: jest.fn(),
  },
  mediaPlaceholder: { textContent: '', style: {} },
  fileNameInfoElement: { innerHTML: '', textContent: '' },
  fileCountInfoElement: { innerHTML: '', textContent: '' },
  prevMediaButton: { disabled: false },
  nextMediaButton: { disabled: false },
  playPauseTimerButton: { disabled: false },
}));

const mockElectronAPI = {
  recordMediaView: jest.fn().mockResolvedValue(undefined),
  loadFileAsDataURL: jest.fn(),
};

// Define the mock at the module level to avoid redefinition errors
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
  configurable: true,
});

describe('ui-updates.js', () => {
  let uiUpdates, state, uiElements;

  beforeEach(() => {
    jest.resetModules(); // This is key to get fresh modules for each test
    jest.clearAllMocks(); // Reset mocks before each test

    // Re-require modules to get fresh copies with mocks applied
    uiUpdates = require('../renderer/ui-updates.js');
    state = require('../renderer/state.js').state;
    uiElements = require('../renderer/ui-elements.js'); // This will get the top-level mock

    // Reset state
    state.currentMediaItem = null;
    state.currentMediaIndex = -1;
    state.displayedMediaFiles = [];
    state.isGlobalSlideshowActive = false;
    state.globalMediaPoolForSelection = [];
  });

  describe('displayCurrentMedia', () => {
    beforeEach(() => {
      // Mock document.createElement for this suite
      const mockElement = {
        play: jest.fn(),
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
      };
      global.document.createElement = jest.fn((tag) => {
        if (tag === 'img' || tag === 'video') {
          return mockElement;
        }
        return {};
      });
    });

    it('should display an image', async () => {
      state.currentMediaItem = {
        name: 'test.jpg',
        path: '/test.jpg',
        viewCount: 0,
      };
      mockElectronAPI.loadFileAsDataURL.mockResolvedValue({
        type: 'success',
        url: 'data:image/jpeg;base64,...',
      });

      await uiUpdates.displayCurrentMedia();

      expect(mockElectronAPI.recordMediaView).toHaveBeenCalledWith('/test.jpg');
      expect(uiElements.mediaDisplayArea.appendChild).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('img');
    });

    it('should display a video', async () => {
      state.currentMediaItem = {
        name: 'test.mp4',
        path: '/test.mp4',
        viewCount: 0,
      };
      mockElectronAPI.loadFileAsDataURL.mockResolvedValue({
        type: 'success',
        url: 'data:video/mp4;base64,...',
      });

      await uiUpdates.displayCurrentMedia();

      expect(mockElectronAPI.recordMediaView).toHaveBeenCalledWith('/test.mp4');
      expect(uiElements.mediaDisplayArea.appendChild).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    it('should handle file load failure', async () => {
      state.currentMediaItem = { name: 'bad.jpg', path: '/bad.jpg' };
      mockElectronAPI.loadFileAsDataURL.mockResolvedValue({
        type: 'error',
        message: 'File not found',
      });

      await uiUpdates.displayCurrentMedia();

      // The error message is set inside mediaDisplayArea, not mediaPlaceholder
      expect(uiElements.mediaDisplayArea.innerHTML).toContain(
        'Error loading: bad.jpg',
      );
    });

    it('should clear display if no media item is set', async () => {
      state.currentMediaItem = null;
      await uiUpdates.displayCurrentMedia();
      expect(uiElements.mediaDisplayArea.innerHTML).toBe('');
      expect(uiElements.mediaPlaceholder.textContent).toBe(
        'No media selected.',
      );
    });
  });

  describe('clearMediaDisplay', () => {
    it('should clear the media display area and show a placeholder', () => {
      uiUpdates.clearMediaDisplay('Test Message');

      expect(uiElements.mediaDisplayArea.innerHTML).toBe('');
      expect(uiElements.mediaPlaceholder.textContent).toBe('Test Message');
      expect(uiElements.mediaPlaceholder.style.display).toBe('block');
      expect(state.currentMediaItem).toBeNull();
    });
  });

  describe('updateNavButtons', () => {
    it('should disable prev button at the start of the list', () => {
      state.currentMediaIndex = 0;
      state.displayedMediaFiles = [{}, {}];
      uiUpdates.updateNavButtons();
      expect(uiElements.prevMediaButton.disabled).toBe(true);
      expect(uiElements.nextMediaButton.disabled).toBe(false);
    });

    it('should disable next button at the end of the list in individual mode', () => {
      state.isGlobalSlideshowActive = false;
      state.currentMediaIndex = 1;
      state.displayedMediaFiles = [{}, {}];
      uiUpdates.updateNavButtons();
      expect(uiElements.prevMediaButton.disabled).toBe(false);
      expect(uiElements.nextMediaButton.disabled).toBe(true);
    });

    it('should enable both buttons in the middle of the list', () => {
      state.currentMediaIndex = 1;
      state.displayedMediaFiles = [{}, {}, {}];
      uiUpdates.updateNavButtons();
      expect(uiElements.prevMediaButton.disabled).toBe(false);
      expect(uiElements.nextMediaButton.disabled).toBe(false);
    });

    it('should keep next button enabled in global slideshow mode if pool is not empty', () => {
      state.isGlobalSlideshowActive = true;
      state.currentMediaIndex = 1;
      state.displayedMediaFiles = [{}, {}]; // At the end of history
      state.globalMediaPoolForSelection = [{}, {}, {}]; // Pool has items
      uiUpdates.updateNavButtons();
      expect(uiElements.prevMediaButton.disabled).toBe(false);
      expect(uiElements.nextMediaButton.disabled).toBe(false); // Still enabled
    });

    it('should disable next button in global slideshow mode if pool is empty', () => {
      state.isGlobalSlideshowActive = true;
      state.globalMediaPoolForSelection = []; // Pool is empty
      uiUpdates.updateNavButtons();
      expect(uiElements.nextMediaButton.disabled).toBe(true);
    });
  });
});
