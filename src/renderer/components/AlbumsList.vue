<template>
  <div
    class="glass-panel rounded-xl p-4 flex flex-col overflow-y-auto custom-scrollbar"
  >
    <div class="header-controls">
      <button
        class="action-button"
        data-testid="start-slideshow-button"
        @click="handleStartSlideshow"
      >
        Start Slideshow
      </button>
      <div class="timer-controls">
        <label for="timer-duration">Timer (s):</label>
        <input
          id="timer-duration"
          v-model.number="timerDuration"
          type="number"
          min="1"
          class="timer-input"
        />
        <button class="timer-button" @click="handleToggleTimer">
          {{ isTimerRunning ? 'Pause' : 'Play' }}
        </button>
      </div>

      <button class="action-button" @click="openModal">Manage Sources</button>
      <button class="action-button" @click="openSmartPlaylistModal">
        + Playlist
      </button>
    </div>
    <div
      v-if="isTimerRunning"
      class="progress-bar-container"
      data-testid="slideshow-progress-bar"
    >
      <div class="progress-bar" :style="{ width: `${timerProgress}%` }"></div>
    </div>
    <h2 class="albums-list-header">Albums</h2>
    <ul class="space-y-1 grow pr-2 albums-list">
      <li v-if="allAlbums.length === 0" class="text-gray-400">
        Loading albums...
      </li>
      <AlbumTree
        v-for="album in allAlbums"
        :key="album.name"
        :album="album"
        :selection="albumsSelectedForSlideshow"
        @toggle-selection="handleToggleSelection"
        @album-click="handleClickAlbum"
      />
    </ul>

    <!-- Smart Playlists Section -->
    <h2 class="albums-list-header mt-4">Smart Playlists</h2>
    <ul class="space-y-1 grow pr-2 albums-list">
      <li v-for="playlist in smartPlaylists" :key="playlist.id">
        <div
          class="group flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
        >
          <button
            class="grow text-left text-gray-300 hover:text-white flex items-center gap-2"
            @click="handleSmartPlaylistSlideshow(playlist)"
          >
            <span class="text-pink-500">▶</span>
            {{ playlist.name }}
          </button>
          <button
            class="text-xs text-gray-400 hover:text-white ml-2 p-1 rounded border border-gray-600 hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Open in Grid"
            @click.stop="handleSmartPlaylistGrid(playlist)"
          >
            Grid
          </button>
          <div
            class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              class="text-xs text-blue-400 hover:text-blue-300"
              title="Edit"
              @click.stop="editPlaylist(playlist)"
            >
              ✎
            </button>
            <button
              class="text-xs text-gray-500 hover:text-red-400"
              title="Delete"
              @click.stop="deletePlaylist(playlist.id)"
            >
              x
            </button>
          </div>
        </div>
      </li>
      <li
        v-if="smartPlaylists.length === 0"
        class="text-gray-500 italic text-sm px-2"
      >
        No smart playlists
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * @file This component displays the list of all available media albums in a tree structure.
 * It provides controls for starting a global slideshow, managing the timer,
 * opening the sources modal, and selecting/deselecting albums for the slideshow.
 * Clicking on an album's name starts a slideshow for that specific album and its sub-albums.
 */
import { nextTick } from 'vue';
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';
import AlbumTree from './AlbumTree.vue';
import { api } from '../api';
import {
  getAlbumAndChildrenNames,
  collectTexturesRecursive,
} from '../utils/albumUtils';
import type {
  Album,
  SmartPlaylist,
  MediaFile,
  MediaLibraryItem,
} from '../../core/types';

const {
  allAlbums,
  albumsSelectedForSlideshow,
  timerDuration,
  isTimerRunning,
  isSourcesModalVisible,
  isSmartPlaylistModalVisible,
  timerProgress,
  smartPlaylists,
  gridMediaFiles,
  viewMode,
  playlistToEdit,
} = useAppState();

const slideshow = useSlideshow();

/**
 * Toggles the selection of an album and all its children. If any child is unselected,
 * it selects all of them. If all are already selected, it deselects all of them.
 * @param album - The album to toggle.
 */
const handleToggleSelection = (album: Album) => {
  const names = getAlbumAndChildrenNames(album);
  // Determine the new state: if any child is unselected, the new state is "selected" (true).
  // Otherwise, if all are selected, the new state is "unselected" (false).
  const newSelectionState = names.some(
    (name) => !albumsSelectedForSlideshow.value[name],
  );

  for (const name of names) {
    slideshow.toggleAlbumSelection(name, newSelectionState);
  }
};

/**
 * Starts a slideshow for a single album and all its sub-albums.
 * @param album - The album to start the slideshow for.
 */
const handleClickAlbum = (album: Album) => {
  const textures = collectTexturesRecursive(album);
  const albumWithAllTextures = { ...album, textures };
  slideshow.startIndividualAlbumSlideshow(albumWithAllTextures);
};

/**
 * Starts the global slideshow.
 */
const handleStartSlideshow = () => {
  slideshow.startSlideshow();
};

/**
 * Toggles the slideshow timer (play/pause).
 */
const handleToggleTimer = () => {
  slideshow.toggleSlideshowTimer();
};

/**
 * Opens the 'Manage Sources' modal.
 */
const openModal = () => {
  isSourcesModalVisible.value = true;
};

const openSmartPlaylistModal = () => {
  isSmartPlaylistModalVisible.value = true;
};

const getMediaForPlaylist = async (
  playlist: SmartPlaylist,
): Promise<MediaFile[]> => {
  // 1. Get all known media files from the loaded albums (Source of Truth for existence)
  const allFiles: MediaFile[] = [];
  const traverse = (albums: Album[]) => {
    for (const album of albums) {
      if (album.textures) allFiles.push(...album.textures);
      if (album.children) traverse(album.children);
    }
  };
  traverse(allAlbums.value);

  // 2. Get metadata/stats from DB (Source of Truth for duration, rating, views)
  const dbItems = await api.getAllMetadataAndStats();

  // Create a quick lookup map by file path
  const statsMap = new Map<string, MediaLibraryItem>();
  for (const item of dbItems) {
    if (item.file_path) {
      statsMap.set(item.file_path, item);
    }
  }

  const criteria = JSON.parse(playlist.criteria);

  // 3. Filter
  const filtered = allFiles.filter((file) => {
    const stats: Partial<MediaLibraryItem> = statsMap.get(file.path) || {};

    const rating = stats.rating || 0;
    const duration = stats.duration || 0;
    const viewCount = stats.view_count || 0;
    const lastViewed = stats.last_viewed;

    let match = true;
    if (criteria.minRating && rating < criteria.minRating) match = false;
    // criteria.minDuration is in SECONDS (as per SmartPlaylistModal: minDurationMinutes * 60)
    // DB duration is in seconds.
    if (criteria.minDuration && duration < criteria.minDuration) match = false;

    if (criteria.minViews !== undefined && viewCount < criteria.minViews)
      match = false;
    if (criteria.maxViews !== undefined && viewCount > criteria.maxViews)
      match = false;

    if (criteria.minDaysSinceView) {
      if (!lastViewed) {
        // Never viewed -> Infinite days -> Matches "Not viewed in X days"
      } else {
        const lastViewDate = new Date(lastViewed).getTime();
        const diffMs = Date.now() - lastViewDate;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays < criteria.minDaysSinceView) match = false;
      }
    }

    return match;
  });

  // 4. Map to view model
  return filtered.map((file) => {
    const stats = statsMap.get(file.path);
    return {
      ...file,
      viewCount: stats?.view_count || 0,
      rating: stats?.rating || 0,
    };
  });
};

const handleSmartPlaylistSlideshow = async (playlist: SmartPlaylist) => {
  try {
    const mediaFiles = await getMediaForPlaylist(playlist);
    if (mediaFiles.length === 0) {
      alert('Playlist is empty');
      return;
    }

    const fakeAlbum: Album = {
      name: playlist.name,
      textures: mediaFiles,
      children: [],
    };
    slideshow.startIndividualAlbumSlideshow(fakeAlbum);
  } catch (error) {
    console.error('Error starting playlist slideshow', error);
  }
};

const handleSmartPlaylistGrid = async (playlist: SmartPlaylist) => {
  try {
    const mediaFiles = await getMediaForPlaylist(playlist);
    gridMediaFiles.value = mediaFiles;
    // Use nextTick to allow event bubbling to complete before potentially unmounting components (fix for happy-dom/tests)
    await nextTick();
    viewMode.value = 'grid';
  } catch (error) {
    console.error('Error opening playlist grid', error);
  }
};

const deletePlaylist = async (id: number) => {
  if (!confirm('Delete this playlist?')) return;
  try {
    await api.deleteSmartPlaylist(id);
    smartPlaylists.value = await api.getSmartPlaylists();
  } catch (e) {
    console.error('Failed to delete playlist', e);
  }
};

const editPlaylist = (playlist: SmartPlaylist) => {
  playlistToEdit.value = playlist;
  isSmartPlaylistModalVisible.value = true;
};
</script>

<style scoped>
/* Scoped styles from the original AlbumsList.vue */
/* .panel removed in favor of utility class */

.header-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.header-controls > * {
  flex-shrink: 0;
}

.timer-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.timer-controls label {
  color: var(--text-muted);
  font-weight: 700;
  font-size: 0.85rem;
}

.timer-input {
  background-color: var(--primary-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  font-weight: 500;
  width: 65px;
  padding: 0.4rem 0.5rem;
  text-align: center;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.timer-input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-color);
}

.checkbox-input {
  accent-color: var(--accent-color);
  width: 16px;
  height: 16px;
}

.albums-list-header {
  font-family: var(--body-font);
  text-transform: uppercase;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 700;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 0.75rem;
}

.albums-list {
  list-style: none;
  padding: 0;
}

.progress-bar-container {
  height: 6px;
  background-color: var(--tertiary-bg);
  border-radius: 3px;
  margin-bottom: 1rem;
  overflow: hidden;
  width: 100%;
}

.progress-bar {
  height: 100%;
  background-color: var(--accent-color);
  border-radius: 3px;
  transition: width 0.05s linear;
}
</style>
