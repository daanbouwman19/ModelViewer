/**
 * @file Provides composable functions for managing slideshow logic.
 * This includes starting/stopping slideshows, navigating media, filtering,
 * and selecting media items based on a weighted random algorithm.
 */
import { computed } from 'vue';
import { useAppState } from './useAppState';
import {
  collectTexturesRecursive,
  collectSelectedTextures,
} from '../utils/albumUtils';
import type { Album, MediaFile } from '../../core/types';
import { api } from '../api';

/**
 * A Vue composable that provides functions for controlling the media slideshow.
 */
export function useSlideshow() {
  const { state, stopSlideshow, imageExtensionsSet, videoExtensionsSet } =
    useAppState();

  /**
   * Shuffles an array in place.
   * @param array The array to shuffle.
   * @returns The shuffled array.
   */
  const shuffleArray = <T>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  /**
   * Filters a list of media files based on the current filter setting in the global state.
   * @param mediaFiles - The array of media files to filter.
   * @returns The filtered array of media files.
   */
  const filterMedia = (mediaFiles: MediaFile[]): MediaFile[] => {
    if (!mediaFiles || mediaFiles.length === 0) return [];

    const filter = state.mediaFilter;

    return mediaFiles.filter((file) => {
      // Guard against missing path property
      if (!file || !file.path || typeof file.path !== 'string') {
        console.warn('Skipping media item with invalid or missing path:', file);
        return false;
      }

      if (filter === 'All') return true;

      // Optimization: Avoid converting the entire path to lowercase.
      // Instead, find the extension and only lowercase that small substring.
      // This reduces memory allocation and CPU usage in large loops.
      const lastDotIndex = file.path.lastIndexOf('.');
      if (lastDotIndex === -1) return false;

      const ext = file.path.slice(lastDotIndex).toLowerCase();

      if (filter === 'Videos') {
        return videoExtensionsSet.value.has(ext);
      } else if (filter === 'Images') {
        return imageExtensionsSet.value.has(ext);
      }
      return true; // Should not be reached with controlled filters
    });
  };

  /**
   * Memoized filtered pool to avoid O(N) filtering on every slide change.
   * This significantly reduces CPU usage when the media pool is large (e.g., 10k+ items).
   */
  const filteredGlobalMediaPool = computed(() => {
    return filterMedia(state.globalMediaPoolForSelection);
  });

  /**
   * Selects a random item from a list, weighted by view count (less viewed items are more likely).
   * @param items - Array of media items, each with a 'path' and optional 'viewCount'.
   * @param excludePaths - An array of paths to exclude from selection.
   * @returns The selected media item, or null if no item could be selected.
   */
  const selectWeightedRandom = (
    items: MediaFile[],
    excludePaths: string[] = [],
  ): MediaFile | null => {
    if (!items || items.length === 0) return null;

    let eligibleItems = items.filter(
      (item) => !excludePaths.includes(item.path),
    );

    if (eligibleItems.length === 0) {
      eligibleItems = items;
    }
    if (eligibleItems.length === 0) return null;

    const weightedItems = eligibleItems.map((item) => ({
      ...item,
      weight: 1 / ((item.viewCount || 0) + 1),
    }));

    const totalWeight = weightedItems.reduce(
      (sum, item) => sum + item.weight,
      0,
    );

    if (totalWeight <= 1e-9) {
      if (eligibleItems.length > 0) {
        return eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
      }
      return null;
    }

    let random = Math.random() * totalWeight;
    for (const item of weightedItems) {
      random -= item.weight;
      if (random <= 0) return item;
    }

    return weightedItems[weightedItems.length - 1];
  };

  /**
   * Records a view for the given media item.
   * @param mediaItem - The media item to display.
   */
  const displayMedia = async (mediaItem: MediaFile | null) => {
    if (!mediaItem) return;
    try {
      await api.recordMediaView(mediaItem.path);
      if (state.isTimerRunning) {
        resumeSlideshowTimer();
      }
    } catch (error) {
      console.error('Error recording media view:', error);
    }
  };

  /**
   * Selects the next media item using a weighted random algorithm and displays it.
   */
  const pickAndDisplayNextMediaItem = async () => {
    let selectedMedia: MediaFile | null = null;

    // Standard Logic (fallback or default)
    if (!selectedMedia) {
      if (state.globalMediaPoolForSelection.length === 0) {
        console.warn('No media files available in the pool.');
        return;
      }
      // Use memoized filtered pool
      const filteredPool = filteredGlobalMediaPool.value;
      state.totalMediaInPool = filteredPool.length;

      if (filteredPool.length === 0) {
        console.warn('Media pool is empty or no media matches the filter.');
        return;
      }

      const historySize = Math.min(5, state.displayedMediaFiles.length);
      const historyPaths = state.displayedMediaFiles
        .slice(-historySize)
        .map((item) => item.path);

      selectedMedia =
        selectWeightedRandom(filteredPool, historyPaths) ||
        filteredPool[Math.floor(Math.random() * filteredPool.length)];
    }

    if (selectedMedia) {
      state.displayedMediaFiles.push(selectedMedia);
      state.currentMediaIndex = state.displayedMediaFiles.length - 1;
      state.currentMediaItem = selectedMedia;
      if (state.displayedMediaFiles.length > 100) {
        state.displayedMediaFiles.shift();
        state.currentMediaIndex--;
      }
      await displayMedia(state.currentMediaItem);
    }
  };

  /**
   * Navigates to the next or previous media item in the slideshow history.
   * If at the end of history, a new random item is picked.
   * @param direction - The direction to navigate (-1 for previous, 1 for next).
   */
  const navigateMedia = async (direction: number) => {
    if (!state.isSlideshowActive) return;

    if (direction > 0) {
      // Next
      if (state.currentMediaIndex < state.displayedMediaFiles.length - 1) {
        state.currentMediaIndex++;
        state.currentMediaItem =
          state.displayedMediaFiles[state.currentMediaIndex];
        await displayMedia(state.currentMediaItem);
      } else {
        await pickAndDisplayNextMediaItem();
      }
    } else {
      // Previous
      if (state.currentMediaIndex > 0) {
        state.currentMediaIndex--;
        state.currentMediaItem =
          state.displayedMediaFiles[state.currentMediaIndex];
        await displayMedia(state.currentMediaItem);
      }
    }
  };

  /**
   * Resumes the slideshow timer.
   */
  const resumeSlideshowTimer = () => {
    if (state.slideshowTimerId) {
      clearInterval(state.slideshowTimerId);
    }
    state.isTimerRunning = true;
    state.timerProgress = 100;

    const duration = state.timerDuration * 1000;
    const interval = 50; // Update every 50ms
    let elapsed = 0;

    state.slideshowTimerId = setInterval(() => {
      elapsed += interval;
      const progress = Math.max(0, 100 - (elapsed / duration) * 100);
      state.timerProgress = progress;

      if (progress <= 0) {
        if (state.slideshowTimerId) clearInterval(state.slideshowTimerId);
        navigateMedia(1);
      }
    }, interval);
  };

  /**
   * Pauses the slideshow timer.
   */
  const pauseSlideshowTimer = () => {
    if (state.slideshowTimerId) {
      clearInterval(state.slideshowTimerId);
      state.slideshowTimerId = null;
    }
    state.isTimerRunning = false;
  };

  /**
   * Toggles the slideshow timer on or off.
   */
  const toggleSlideshowTimer = () => {
    if (state.isTimerRunning) {
      pauseSlideshowTimer();
    } else {
      resumeSlideshowTimer();
    }
  };

  /**
   * Toggles the selection state of an album for the global slideshow.
   * @param albumName - The name of the album to toggle.
   * @param isSelected - Explicitly set the selection state.
   */
  const toggleAlbumSelection = (albumName: string, isSelected?: boolean) => {
    if (typeof isSelected === 'boolean') {
      state.albumsSelectedForSlideshow[albumName] = isSelected;
    } else {
      state.albumsSelectedForSlideshow[albumName] =
        !state.albumsSelectedForSlideshow[albumName];
    }
  };

  /**
   * Starts a global slideshow using all selected albums.
   */
  const startSlideshow = async () => {
    if (!state.allAlbums) {
      return;
    }
    state.globalMediaPoolForSelection = collectSelectedTextures(
      state.allAlbums,
      state.albumsSelectedForSlideshow,
    );

    if (state.globalMediaPoolForSelection.length === 0) {
      console.warn('No albums selected for slideshow.');
      return;
    }
    state.isSlideshowActive = true;
    state.displayedMediaFiles = [];
    state.currentMediaIndex = -1;
    await pickAndDisplayNextMediaItem();
  };

  /**
   * Starts a slideshow for an individual album.
   * @param album - The album to start the slideshow for.
   */
  const startIndividualAlbumSlideshow = async (album: Album) => {
    if (!album || !Array.isArray(album.textures)) {
      console.warn('Album has no valid textures array.');
      return;
    }
    if (album.textures.length === 0) {
      console.warn('No media files in this album.');
      return;
    }
    state.globalMediaPoolForSelection = [...album.textures];
    state.isSlideshowActive = true;
    state.displayedMediaFiles = [];
    state.currentMediaIndex = -1;
    await pickAndDisplayNextMediaItem();
  };

  /**
   * Opens an album and its children in Grid View.
   * @param album - The album to open.
   */
  const openAlbumInGrid = (album: Album) => {
    const allMedia = collectTexturesRecursive(album);
    state.gridMediaFiles = filterMedia(allMedia);
    state.viewMode = 'grid';
    state.isSlideshowActive = false;
    stopSlideshow();
  };

  /**
   * Re-applies the current media filter and picks a new item.
   */
  const reapplyFilter = async () => {
    if (state.isSlideshowActive) {
      state.globalMediaPoolForSelection = collectSelectedTextures(
        state.allAlbums,
        state.albumsSelectedForSlideshow,
      );
      state.displayedMediaFiles = [];
      state.currentMediaIndex = -1;
      await pickAndDisplayNextMediaItem();
    }
  };

  return {
    navigateMedia,
    toggleSlideshowTimer,
    pauseSlideshowTimer,
    resumeSlideshowTimer,
    toggleAlbumSelection,
    startSlideshow,
    startIndividualAlbumSlideshow,
    openAlbumInGrid,
    pickAndDisplayNextMediaItem,
    reapplyFilter,
    filterMedia,
    selectWeightedRandom,
    shuffleArray,
  };
}
