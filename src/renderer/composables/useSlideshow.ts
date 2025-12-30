/**
 * @file Provides composable functions for managing slideshow logic.
 * This includes starting/stopping slideshows, navigating media, filtering,
 * and selecting media items based on a weighted random algorithm.
 */
import { computed } from 'vue';
import { useLibraryStore } from './useLibraryStore';
import { usePlayerStore } from './usePlayerStore';
import { useUIStore } from './useUIStore';
import {
  collectTexturesRecursive,
  collectSelectedTextures,
} from '../utils/albumUtils';
import type { Album, MediaFile } from '../../core/types';
import { api } from '../api';

/**
 * Cache for file extensions to reduce string operations.
 * Keyed by MediaFile object reference.
 */
const extensionCache = new WeakMap<MediaFile, string>();

/**
 * A Vue composable that provides functions for controlling the media slideshow.
 */
export function useSlideshow() {
  const libraryStore = useLibraryStore();
  const playerStore = usePlayerStore();
  const uiStore = useUIStore();

  const { imageExtensionsSet, videoExtensionsSet } = libraryStore;
  const { stopSlideshow } = playerStore;

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
   * Helper to get or compute extension for a media file.
   */
  const getCachedExtension = (file: MediaFile): string | null => {
    if (extensionCache.has(file)) {
      return extensionCache.get(file)!;
    }

    const fileName = file.name || file.path;
    const lastDotIndex = fileName.lastIndexOf('.');

    let ext = '';
    if (lastDotIndex !== -1) {
      ext = fileName.slice(lastDotIndex).toLowerCase();
    }

    extensionCache.set(file, ext);
    return ext;
  };

  /**
   * Filters a list of media files based on the current filter setting in the global state.
   * @param mediaFiles - The array of media files to filter.
   * @returns The filtered array of media files.
   */
  const filterMedia = (mediaFiles: MediaFile[]): MediaFile[] => {
    if (!mediaFiles || mediaFiles.length === 0) return [];

    const filter = uiStore.state.mediaFilter;

    return mediaFiles.filter((file) => {
      // Guard against missing path property
      if (!file || !file.path || typeof file.path !== 'string') {
        console.warn('Skipping media item with invalid or missing path:', file);
        return false;
      }

      if (filter === 'All') return true;

      const ext = getCachedExtension(file);
      if (!ext) return false;

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
    return filterMedia(libraryStore.state.globalMediaPoolForSelection);
  });

  /**
   * Selects a random item from a list, weighted by view count (less viewed items are more likely).
   * Optimized to avoid creating intermediate arrays (filter/map) for better performance and less GC.
   * @param items - Array of media items, each with a 'path' and optional 'viewCount'.
   * @param excludePaths - An array of paths to exclude from selection.
   * @returns The selected media item, or null if no item could be selected.
   */
  const selectWeightedRandom = (
    items: MediaFile[],
    excludePaths: string[] = [],
  ): MediaFile | null => {
    if (!items || items.length === 0) return null;

    let totalWeight = 0;
    let eligibleCount = 0;

    // First pass: Calculate total weight for eligible items
    // Using simple loop to avoid array allocation
    for (const item of items) {
      if (!excludePaths.includes(item.path)) {
        totalWeight += 1 / ((item.viewCount || 0) + 1);
        eligibleCount++;
      }
    }

    // Fallback: If no items are eligible (all excluded), consider ALL items eligible
    let usingFallback = false;
    if (eligibleCount === 0) {
      usingFallback = true;
      totalWeight = 0;
      for (const item of items) {
        totalWeight += 1 / ((item.viewCount || 0) + 1);
      }
    }

    // Handle edge case where totalWeight is effectively zero
    // (Should be rare with 1/(count+1) unless count is infinite)
    if (totalWeight <= 1e-9) {
      const effectiveItemsCount = usingFallback ? items.length : eligibleCount;
      if (effectiveItemsCount === 0) return null;

      // Pick a random eligible item uniformly
      let targetIndex = Math.floor(Math.random() * effectiveItemsCount);
      for (const item of items) {
        if (usingFallback || !excludePaths.includes(item.path)) {
          if (targetIndex === 0) return item;
          targetIndex--;
        }
      }
      // Should effectively not be reached
      return items[items.length - 1];
    }

    let random = Math.random() * totalWeight;

    // Second pass: Find the selected item
    for (const item of items) {
      if (!usingFallback && excludePaths.includes(item.path)) {
        continue;
      }

      const weight = 1 / ((item.viewCount || 0) + 1);
      random -= weight;
      if (random <= 0) return item;
    }

    // Fallback for floating point rounding errors
    // Search backwards to find the last eligible item
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (usingFallback || !excludePaths.includes(item.path)) {
        return item;
      }
    }

    return null;
  };

  /**
   * Records a view for the given media item.
   * @param mediaItem - The media item to display.
   */
  const displayMedia = async (mediaItem: MediaFile | null) => {
    if (!mediaItem) return;
    try {
      // Optimistically update the local view count so the UI reflects it immediately
      if (mediaItem.viewCount === undefined) {
        mediaItem.viewCount = 0;
      }
      mediaItem.viewCount++;

      await api.recordMediaView(mediaItem.path);
      if (playerStore.state.isTimerRunning) {
        resumeSlideshowTimer();
      }
    } catch (error) {
      console.error('Error recording media view:', error);
      // Rollback if needed, but low risk
    }
  };

  /**
   * Selects the next media item using a weighted random algorithm and displays it.
   */
  const pickAndDisplayNextMediaItem = async () => {
    let selectedMedia: MediaFile | null = null;

    // Standard Logic (fallback or default)
    if (!selectedMedia) {
      if (libraryStore.state.globalMediaPoolForSelection.length === 0) {
        console.warn('No media files available in the pool.');
        return;
      }
      // Use memoized filtered pool
      const filteredPool = filteredGlobalMediaPool.value;
      libraryStore.state.totalMediaInPool = filteredPool.length;

      if (filteredPool.length === 0) {
        console.warn('Media pool is empty or no media matches the filter.');
        return;
      }

      const historySize = Math.min(
        5,
        playerStore.state.displayedMediaFiles.length,
      );
      const historyPaths = playerStore.state.displayedMediaFiles
        .slice(-historySize)
        .map((item) => item.path);

      selectedMedia =
        selectWeightedRandom(filteredPool, historyPaths) ||
        filteredPool[Math.floor(Math.random() * filteredPool.length)];
    }

    if (selectedMedia) {
      playerStore.state.displayedMediaFiles.push(selectedMedia);
      playerStore.state.currentMediaIndex =
        playerStore.state.displayedMediaFiles.length - 1;
      playerStore.state.currentMediaItem = selectedMedia;
      if (playerStore.state.displayedMediaFiles.length > 100) {
        playerStore.state.displayedMediaFiles.shift();
        playerStore.state.currentMediaIndex--;
      }
      await displayMedia(playerStore.state.currentMediaItem);
    }
  };

  /**
   * Navigates to the next or previous media item in the slideshow history.
   * If at the end of history, a new random item is picked.
   * @param direction - The direction to navigate (-1 for previous, 1 for next).
   */
  const navigateMedia = async (direction: number) => {
    if (!playerStore.state.isSlideshowActive) return;

    if (direction > 0) {
      // Next
      if (
        playerStore.state.currentMediaIndex <
        playerStore.state.displayedMediaFiles.length - 1
      ) {
        playerStore.state.currentMediaIndex++;
        playerStore.state.currentMediaItem =
          playerStore.state.displayedMediaFiles[
            playerStore.state.currentMediaIndex
          ];
        await displayMedia(playerStore.state.currentMediaItem);
      } else {
        await pickAndDisplayNextMediaItem();
      }
    } else {
      // Previous
      if (playerStore.state.currentMediaIndex > 0) {
        playerStore.state.currentMediaIndex--;
        playerStore.state.currentMediaItem =
          playerStore.state.displayedMediaFiles[
            playerStore.state.currentMediaIndex
          ];
        await displayMedia(playerStore.state.currentMediaItem);
      }
    }
  };

  /**
   * Resumes the slideshow timer.
   */
  const resumeSlideshowTimer = () => {
    if (playerStore.state.slideshowTimerId) {
      clearInterval(playerStore.state.slideshowTimerId);
    }
    playerStore.state.isTimerRunning = true;
    playerStore.state.timerProgress = 100;

    const duration = playerStore.state.timerDuration * 1000;
    const interval = 50; // Update every 50ms
    let elapsed = 0;

    playerStore.state.slideshowTimerId = setInterval(() => {
      elapsed += interval;
      const progress = Math.max(0, 100 - (elapsed / duration) * 100);
      playerStore.state.timerProgress = progress;

      if (progress <= 0) {
        if (playerStore.state.slideshowTimerId)
          clearInterval(playerStore.state.slideshowTimerId);
        navigateMedia(1);
      }
    }, interval);
  };

  /**
   * Pauses the slideshow timer.
   */
  const pauseSlideshowTimer = () => {
    if (playerStore.state.slideshowTimerId) {
      clearInterval(playerStore.state.slideshowTimerId);
      playerStore.state.slideshowTimerId = null;
    }
    playerStore.state.isTimerRunning = false;
  };

  /**
   * Toggles the slideshow timer on or off.
   */
  const toggleSlideshowTimer = () => {
    if (playerStore.state.isTimerRunning) {
      pauseSlideshowTimer();
    } else {
      resumeSlideshowTimer();
    }
  };

  /**
   * Toggles the selection state of an album for the global slideshow.
   * @param albumId - The ID of the album to toggle.
   * @param isSelected - Explicitly set the selection state.
   */
  const toggleAlbumSelection = (albumId: string, isSelected?: boolean) => {
    if (typeof isSelected === 'boolean') {
      libraryStore.state.albumsSelectedForSlideshow[albumId] = isSelected;
    } else {
      libraryStore.state.albumsSelectedForSlideshow[albumId] =
        !libraryStore.state.albumsSelectedForSlideshow[albumId];
    }
  };

  /**
   * Starts a global slideshow using all selected albums.
   */
  const startSlideshow = async () => {
    if (!libraryStore.state.allAlbums) {
      return;
    }
    libraryStore.state.globalMediaPoolForSelection = collectSelectedTextures(
      libraryStore.state.allAlbums,
      libraryStore.state.albumsSelectedForSlideshow,
    );

    if (libraryStore.state.globalMediaPoolForSelection.length === 0) {
      console.warn('No albums selected for slideshow.');
      return;
    }
    playerStore.state.isSlideshowActive = true;
    playerStore.state.displayedMediaFiles = [];
    playerStore.state.currentMediaIndex = -1;
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
    libraryStore.state.globalMediaPoolForSelection = [...album.textures];
    playerStore.state.isSlideshowActive = true;
    playerStore.state.displayedMediaFiles = [];
    playerStore.state.currentMediaIndex = -1;
    await pickAndDisplayNextMediaItem();
  };

  /**
   * Opens an album and its children in Grid View.
   * @param album - The album to open.
   */
  const openAlbumInGrid = (album: Album) => {
    const allMedia = collectTexturesRecursive(album);
    uiStore.state.gridMediaFiles = filterMedia(allMedia);
    uiStore.state.viewMode = 'grid';
    playerStore.state.isSlideshowActive = false;
    stopSlideshow();
  };

  /**
   * Re-applies the current media filter and picks a new item.
   */
  const reapplyFilter = async () => {
    if (playerStore.state.isSlideshowActive) {
      libraryStore.state.globalMediaPoolForSelection = collectSelectedTextures(
        libraryStore.state.allAlbums,
        libraryStore.state.albumsSelectedForSlideshow,
      );
      playerStore.state.displayedMediaFiles = [];
      playerStore.state.currentMediaIndex = -1;
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
