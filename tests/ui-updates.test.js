/**
 * @jest-environment jsdom
 * @file Unit tests for the UI updates logic.
 */
import {
  displayCurrentMedia,
  clearMediaDisplay,
  updateNavButtons,
} from '../renderer/ui-updates.js';
import { state } from '../renderer/state.js';

jest.mock('../renderer/ui-elements.js', () => ({
    mediaDisplayArea: { innerHTML: '', style: {}, appendChild: jest.fn(), removeChild: jest.fn(), querySelector: jest.fn(), contains: jest.fn() },
    mediaPlaceholder: { textContent: '', style: {} },
    fileNameInfoElement: { innerHTML: '', textContent: '' },
    fileCountInfoElement: { innerHTML: '', textContent: '' },
    prevMediaButton: { disabled: false },
    nextMediaButton: { disabled: false },
    playPauseTimerButton: { disabled: false },
}));

Object.defineProperty(window, 'electronAPI', {
    value: {
      recordMediaView: jest.fn().mockResolvedValue(undefined),
      loadFileAsDataURL: jest.fn(),
    },
  });

describe('ui-updates.js', () => {
    let uiUpdates;
    let uiElements;
  beforeEach(() => {
    jest.resetModules();
    uiUpdates = require('../renderer/ui-updates.js');
    uiElements = require('../renderer/ui-elements.js');
    // Reset state
    state.currentMediaItem = null;
    state.currentMediaIndex = -1;
    state.displayedMediaFiles = [];
    state.isGlobalSlideshowActive = false;
    state.globalMediaPoolForSelection = [];

    // Clear mocks
    window.electronAPI.recordMediaView.mockClear();
    window.electronAPI.loadFileAsDataURL.mockClear();
    uiElements.mediaDisplayArea.appendChild.mockClear();
    uiElements.mediaDisplayArea.removeChild.mockClear();
    uiElements.mediaDisplayArea.querySelector.mockClear();
    uiElements.mediaDisplayArea.contains.mockClear();
  });

  describe('displayCurrentMedia', () => {
    it('should display an image', async () => {
        state.currentMediaItem = { name: 'test.jpg', path: '/test.jpg', viewCount: 0 };
        window.electronAPI.loadFileAsDataURL.mockResolvedValue({ type: 'success', url: 'data:image/jpeg;base64,...' });

        await uiUpdates.displayCurrentMedia();

        expect(window.electronAPI.recordMediaView).toHaveBeenCalledWith('/test.jpg');
        expect(uiElements.mediaDisplayArea.appendChild).toHaveBeenCalled();
    });
  });
});
