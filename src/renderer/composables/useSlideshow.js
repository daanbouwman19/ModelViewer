/**
 * @file Provides composable functions for managing slideshow logic.
 * This includes starting/stopping slideshows, navigating media, filtering,
 * and selecting media items based on a weighted random algorithm.
 * @requires ./useAppState
 */
import { useAppState } from './useAppState';

/**
 * @typedef {import('../../main/media-scanner.js').Album} Album
 * @typedef {import('../../main/media-scanner.js').MediaFile} MediaFile
 */

/**
 * A Vue composable that provides functions for controlling the media slideshow.
 * @returns {{
 *   navigateMedia: (direction: number) => Promise<void>,
 *   toggleSlideshowTimer: () => void,
 *   toggleAlbumSelection: (albumName: string) => void,
 *   startSlideshow: () => Promise<void>,
 *   startIndividualAlbumSlideshow: (album: Album) => Promise<void>,
 *   pickAndDisplayNextMediaItem: () => Promise<void>,
 *   reapplyFilter: () => Promise<void>,
 *   filterMedia: (mediaFiles: MediaFile[]) => MediaFile[],
 *   selectWeightedRandom: (items: MediaFile[], excludePaths?: string[]) => MediaFile | null,
 *   shuffleArray: <T>(array: T[]) => T[]
 * }}
 */
export function useSlideshow() {
  const { state, stopSlideshow } = useAppState();

  /**
   * Shuffles an array in place.
   * @template T
   * @param {T[]} array The array to shuffle.
   * @returns {T[]} The shuffled array.
   */
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  /**
   * Filters a list of media files based on the current filter setting in the global state.
   * @param {MediaFile[]} mediaFiles - The array of media files to filter.
   * @returns {MediaFile[]} The filtered array of media files.
   */
  const filterMedia = (mediaFiles) => {
    if (!mediaFiles || mediaFiles.length === 0) return [];

    const filter = state.mediaFilter;

    const videoExtensions = state.supportedExtensions.videos;
    const imageExtensions = state.supportedExtensions.images;

    return mediaFiles.filter((file) => {
      // Guard against missing path property
      if (!file || !file.path || typeof file.path !== 'string') {
        console.warn('Skipping media item with invalid or missing path:', file);
        return false;
      }

      if (filter === 'All') return true;

      const ext = file.path.toLowerCase().slice(file.path.lastIndexOf('.'));
      if (filter === 'Videos') {
        return videoExtensions.includes(ext);
      } else if (filter === 'Images') {
        return imageExtensions.includes(ext);
      }
      return true; // Should not be reached with controlled filters
    });
  };

  /**
   * Selects a random item from a list, weighted by view count (less viewed items are more likely).
   * @param {MediaFile[]} items - Array of media items, each with a 'path' and optional 'viewCount'.
   * @param {string[]} [excludePaths=[]] - An array of paths to exclude from selection.
   * @returns {MediaFile | null} The selected media item, or null if no item could be selected.
   */
  const selectWeightedRandom = (items, excludePaths = []) => {
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
   * Navigates to the next or previous media item in the slideshow history.
   * If at the end of history, a new random item is picked.
   * @param {number} direction - The direction to navigate (-1 for previous, 1 for next).
   */
  const navigateMedia = async (direction) => {
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
   * Selects the next media item using a weighted random algorithm and displays it.
   */
  const pickAndDisplayNextMediaItem = async () => {
    if (state.globalMediaPoolForSelection.length === 0) {
      console.warn('No media files available in the pool.');
      return;
    }
    const filteredPool = filterMedia(state.globalMediaPoolForSelection);
    state.totalMediaInPool = filteredPool.length;

    if (filteredPool.length === 0) {
      console.warn('Media pool is empty or no media matches the filter.');
      return;
    }

    const historySize = Math.min(5, state.displayedMediaFiles.length);
    const historyPaths = state.displayedMediaFiles
      .slice(-historySize)
      .map((item) => item.path);
    const selectedMedia =
      selectWeightedRandom(filteredPool, historyPaths) ||
      filteredPool[Math.floor(Math.random() * filteredPool.length)];

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
   * Records a view for the given media item.
   * @param {MediaFile} mediaItem - The media item to display.
   */
  const displayMedia = async (mediaItem) => {
    if (!mediaItem) return;
    try {
      await window.electronAPI.recordMediaView(mediaItem.path);
    } catch (error) {
      console.error('Error recording media view:', error);
    }
  };

  /**
   * Toggles the slideshow timer on or off.
   */
  const toggleSlideshowTimer = () => {
    if (state.slideshowTimerId) {
      stopSlideshow();
    } else {
      const duration = state.timerDuration * 1000;
      state.slideshowTimerId = setInterval(() => navigateMedia(1), duration);
      state.isTimerRunning = true;
    }
  };

  /**
   * Toggles the selection state of an album for the global slideshow.
   * @param {string} albumName - The name of the album to toggle.
   */
  const toggleAlbumSelection = (albumName) => {
    state.albumsSelectedForSlideshow[albumName] =
      !state.albumsSelectedForSlideshow[albumName];
  };

  /**
   * Starts a global slideshow using all selected albums.
   */
  const startSlideshow = async () => {
    if (!state.allAlbums) {
      return;
    }
    state.globalMediaPoolForSelection = state.allAlbums.flatMap((album) =>
      state.albumsSelectedForSlideshow[album.name] ? album.textures : [],
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
   * @param {Album} album - The album to start the slideshow for.
   */
  const startIndividualAlbumSlideshow = async (album) => {
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
   * Re-applies the current media filter and picks a new item.
   */
  const reapplyFilter = async () => {
    if (state.isSlideshowActive) {
      state.globalMediaPoolForSelection = (state.allAlbums || []).flatMap(
        (album) =>
          state.albumsSelectedForSlideshow[album.name] ? album.textures : [],
      );
      state.displayedMediaFiles = [];
      state.currentMediaIndex = -1;
      await pickAndDisplayNextMediaItem();
    }
  };

  return {
    navigateMedia,
    toggleSlideshowTimer,
    toggleAlbumSelection,
    startSlideshow,
    startIndividualAlbumSlideshow,
    pickAndDisplayNextMediaItem,
    reapplyFilter,
    filterMedia,
    selectWeightedRandom,
    shuffleArray,
  };
}
