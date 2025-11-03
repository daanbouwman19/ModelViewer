/**
 * Tests for useAppState composable
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppState } from '../src/renderer/composables/useAppState.js';

describe('useAppState', () => {
  let appState;

  beforeEach(() => {
    // Reset the state before each test
    appState = useAppState();
    appState.state.allModels = [];
    appState.state.modelsSelectedForSlideshow = {};
    appState.state.mediaDirectories = [];
    appState.state.supportedExtensions = { images: [], videos: [], all: [] };
    appState.state.isSlideshowActive = false;
    appState.state.slideshowTimerId = null;
    appState.state.isTimerRunning = false;
  });

  describe('initializeApp', () => {
    it('should initialize app state with data from electronAPI', async () => {
      // Mock window.electronAPI
      const mockModels = [
        { name: 'Model1', files: [], totalViews: 0 },
        { name: 'Model2', files: [], totalViews: 5 },
      ];
      const mockDirectories = [{ path: '/test/dir', isActive: true }];
      const mockExtensions = {
        images: ['.jpg', '.png'],
        videos: ['.mp4'],
        all: ['.jpg', '.png', '.mp4'],
      };

      global.window = {
        electronAPI: {
          getModelsWithViewCounts: vi.fn().mockResolvedValue(mockModels),
          getMediaDirectories: vi.fn().mockResolvedValue(mockDirectories),
          getSupportedExtensions: vi.fn().mockResolvedValue(mockExtensions),
        },
      };

      await appState.initializeApp();

      expect(appState.state.allModels).toEqual(mockModels);
      expect(appState.state.mediaDirectories).toEqual(mockDirectories);
      expect(appState.state.supportedExtensions).toEqual(mockExtensions);
      expect(appState.state.modelsSelectedForSlideshow).toEqual({
        Model1: true,
        Model2: true,
      });
    });

    it('should handle error when electronAPI is not available', async () => {
      global.window = {};
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await appState.initializeApp();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useAppState] Error during initial load:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should handle error when API calls fail', async () => {
      global.window = {
        electronAPI: {
          getModelsWithViewCounts: vi
            .fn()
            .mockRejectedValue(new Error('API Error')),
          getMediaDirectories: vi.fn(),
          getSupportedExtensions: vi.fn(),
        },
      };
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await appState.initializeApp();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useAppState] Error during initial load:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('resetState', () => {
    it('should reset all slideshow-related state', () => {
      // Set up some state
      appState.state.isSlideshowActive = true;
      appState.state.displayedMediaFiles = ['file1.jpg', 'file2.jpg'];
      appState.state.currentMediaIndex = 5;
      appState.state.currentMediaItem = { path: 'test.jpg' };
      appState.state.globalMediaPoolForSelection = ['file3.jpg'];

      appState.resetState();

      expect(appState.state.isSlideshowActive).toBe(false);
      expect(appState.state.displayedMediaFiles).toEqual([]);
      expect(appState.state.currentMediaIndex).toBe(-1);
      expect(appState.state.currentMediaItem).toBe(null);
      expect(appState.state.globalMediaPoolForSelection).toEqual([]);
    });
  });

  describe('stopSlideshow', () => {
    it('should clear timer and set isTimerRunning to false', () => {
      const timerId = setInterval(() => {}, 1000);
      appState.state.slideshowTimerId = timerId;
      appState.state.isTimerRunning = true;

      appState.stopSlideshow();

      expect(appState.state.slideshowTimerId).toBe(null);
      expect(appState.state.isTimerRunning).toBe(false);
    });

    it('should handle case when no timer is active', () => {
      appState.state.slideshowTimerId = null;
      appState.state.isTimerRunning = true;

      appState.stopSlideshow();

      expect(appState.state.slideshowTimerId).toBe(null);
      expect(appState.state.isTimerRunning).toBe(false);
    });
  });

  describe('state management', () => {
    it('should expose reactive state properties', () => {
      expect(appState.allModels).toBeDefined();
      expect(appState.modelsSelectedForSlideshow).toBeDefined();
      expect(appState.globalMediaPoolForSelection).toBeDefined();
      expect(appState.totalMediaInPool).toBeDefined();
      expect(appState.displayedMediaFiles).toBeDefined();
      expect(appState.currentMediaItem).toBeDefined();
      expect(appState.currentMediaIndex).toBeDefined();
      expect(appState.isSlideshowActive).toBeDefined();
      expect(appState.slideshowTimerId).toBeDefined();
      expect(appState.timerDuration).toBeDefined();
      expect(appState.isTimerRunning).toBeDefined();
      expect(appState.mediaFilter).toBeDefined();
      expect(appState.isSourcesModalVisible).toBeDefined();
      expect(appState.mediaDirectories).toBeDefined();
      expect(appState.supportedExtensions).toBeDefined();
    });

    it('should allow state modifications', () => {
      appState.state.timerDuration = 10;
      expect(appState.state.timerDuration).toBe(10);

      appState.state.mediaFilter = 'Images';
      expect(appState.state.mediaFilter).toBe('Images');

      appState.state.isSourcesModalVisible = true;
      expect(appState.state.isSourcesModalVisible).toBe(true);
    });
  });
});
