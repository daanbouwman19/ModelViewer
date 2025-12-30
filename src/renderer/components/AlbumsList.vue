<template>
  <!-- Overall Container: Transparent Flexbox to space out 3 glass segments -->
  <div class="h-full flex flex-col relative gap-4">
    <!-- 1. HEADER PANEL: Matched to Top Bar -->
    <div
      class="shrink-0 flex items-center justify-between p-3 glass-panel rounded-lg z-10"
    >
      <!-- Mobile Close Button (only visible on mobile) -->
      <button
        class="md:hidden text-gray-400 hover:text-white mr-2"
        aria-label="Close Sidebar"
        @click="$emit('close')"
      >
        <CloseIcon class="w-5 h-5" />
      </button>

      <h2 class="text-gray-200 font-bold tracking-tight text-sm uppercase">
        Library
      </h2>

      <div class="flex items-center gap-1">
        <button
          class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
          title="Manage Sources"
          aria-label="Manage Sources"
          @click="openModal"
        >
          <SettingsIcon class="w-5 h-5" />
        </button>

        <button
          class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
          title="Add Playlist"
          aria-label="Add Playlist"
          @click="openSmartPlaylistModal"
        >
          <PlaylistAddIcon class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- 2. CONTENT PANEL: Matched to Media Display -->
    <div
      class="grow glass-panel rounded-xl overflow-hidden relative flex flex-col min-h-0"
    >
      <!-- SCROLLABLE LIST -->
      <div class="grow overflow-y-auto px-2 py-4 custom-scrollbar">
        <!-- SECTION: ALBUMS -->
        <div class="mb-6">
          <h3
            class="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
          >
            Albums
          </h3>
          <ul class="space-y-0.5">
            <li
              v-if="allAlbums.length === 0"
              class="px-3 text-sm text-gray-600 italic"
            >
              No albums found. Add sources.
            </li>
            <AlbumTree
              v-for="album in allAlbums"
              :key="album.id"
              :album="album"
              :selection="albumsSelectedForSlideshow"
              @toggle-selection="handleToggleSelection"
              @album-click="handleClickAlbum"
            />
          </ul>
        </div>

        <!-- SECTION: SMART PLAYLISTS -->
        <div class="mb-4">
          <h3
            class="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
          >
            Playlists
          </h3>
          <ul class="space-y-0.5">
            <!-- RECENTLY PLAYED -->
            <li>
              <div
                class="group flex items-center justify-between px-3 py-2 rounded-md hover:bg-white/5 transition-colors"
              >
                <!-- Name (Main Action - Slideshow) -->
                <button
                  class="grow flex items-center gap-2 truncate text-sm text-gray-300 group-hover:text-white text-left focus:outline-none focus:text-white cursor-pointer min-w-0"
                  aria-label="Recently Played Slideshow"
                  @click="handleHistorySlideshow"
                >
                  <span class="text-orange-400 shrink-0">
                    <HistoryIcon class="w-4 h-4" />
                  </span>
                  <span class="truncate">Recently Played</span>
                </button>

                <!-- Controls on Hover -->
                <div
                  class="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-2"
                >
                  <!-- Grid Button for History -->
                  <button
                    class="text-xs text-gray-500 hover:text-white p-1"
                    title="Open in Grid"
                    aria-label="Open History in Grid"
                    @click.stop="handleHistoryGrid"
                  >
                    <GridIcon class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </li>

            <li v-for="playlist in smartPlaylists" :key="playlist.id">
              <div
                class="group flex items-center justify-between px-3 py-2 rounded-md hover:bg-white/5 transition-colors"
              >
                <!-- Name (Main Action) -->
                <button
                  class="grow flex items-center gap-2 truncate text-sm text-gray-300 group-hover:text-white text-left focus:outline-none focus:text-white cursor-pointer min-w-0"
                  :aria-label="'Play ' + playlist.name"
                  @click="handleSmartPlaylistSlideshow(playlist)"
                >
                  <span class="text-indigo-500 shrink-0">
                    <!-- Small Playlist Icon -->
                    <PlaylistIcon class="w-4 h-4" />
                  </span>
                  <span class="truncate">{{ playlist.name }}</span>
                </button>

                <!-- Controls on Hover -->
                <div
                  class="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-2"
                >
                  <!-- Grid Button for Playlist -->
                  <button
                    class="text-xs text-gray-500 hover:text-white p-1"
                    title="Open in Grid"
                    :aria-label="'Open ' + playlist.name + ' in Grid'"
                    @click.stop="handleSmartPlaylistGrid(playlist)"
                  >
                    <GridIcon class="w-4 h-4" />
                  </button>
                  <button
                    class="text-xs text-gray-500 hover:text-blue-400 p-1"
                    title="Edit"
                    :aria-label="'Edit ' + playlist.name"
                    @click.stop="editPlaylist(playlist)"
                  >
                    <EditIcon class="w-3.5 h-3.5" />
                  </button>
                  <button
                    class="text-xs text-gray-500 hover:text-red-400 p-1"
                    title="Delete"
                    :aria-label="'Delete ' + playlist.name"
                    @click.stop="deletePlaylist(playlist.id)"
                  >
                    <DeleteIcon class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </li>
            <li
              v-if="smartPlaylists.length === 0"
              class="px-3 text-sm text-gray-600 italic"
            >
              No playlists created.
            </li>
          </ul>
        </div>
      </div>
      <!-- End of content panel list part -->
    </div>
    <!-- End of second glass pane -->

    <!-- 3. TIMER PANEL: Matched to Top Bar style -->
    <div
      class="shrink-0 p-3 glass-panel rounded-lg flex items-end gap-3 z-20 relative overflow-hidden"
    >
      <div class="flex flex-col gap-1 grow">
        <label
          for="timer-input"
          class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
          >Timer (s)</label
        >
        <input
          id="timer-input"
          v-model.number="timerDuration"
          type="number"
          min="1"
          class="w-full glass-input text-sm px-3 py-2 rounded-lg"
        />
      </div>

      <!-- Primary Play Action -->
      <button
        class="timer-button h-10 w-14 shrink-0 flex items-center justify-center rounded-lg glass-button-primary"
        data-testid="timer-button"
        :title="isTimerRunning ? 'Pause Slideshow' : 'Start/Resume Slideshow'"
        :aria-label="
          isTimerRunning ? 'Pause Slideshow' : 'Start/Resume Slideshow'
        "
        @click="handleToggleTimer"
      >
        <PauseIcon v-if="isTimerRunning" class="w-6 h-6 fill-current" />
        <PlayIcon v-else class="w-6 h-6 fill-current ml-1" />
      </button>

      <!-- Global Progress Bar (if running, inside timer pane bottom) -->
      <div
        v-if="isTimerRunning"
        class="absolute bottom-0 left-0 w-full h-1 bg-gray-800"
        data-testid="slideshow-progress"
      >
        <div
          class="h-full bg-indigo-500 transition-all duration-100 ease-linear"
          :style="{ width: `${timerProgress}%` }"
        ></div>
      </div>
    </div>
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
import CloseIcon from './icons/CloseIcon.vue';
import PlayIcon from './icons/PlayIcon.vue';
import PauseIcon from './icons/PauseIcon.vue';
import SettingsIcon from './icons/SettingsIcon.vue';
import PlaylistAddIcon from './icons/PlaylistAddIcon.vue';
import PlaylistIcon from './icons/PlaylistIcon.vue';
import GridIcon from './icons/GridIcon.vue';
import EditIcon from './icons/EditIcon.vue';
import DeleteIcon from './icons/DeleteIcon.vue';
import HistoryIcon from './icons/HistoryIcon.vue';
import { api } from '../api';
import {
  getAlbumAndChildrenIds,
  collectTexturesRecursive,
} from '../utils/albumUtils';
import type {
  Album,
  SmartPlaylist,
  MediaFile,
  MediaLibraryItem,
} from '../../core/types';
import { RECENTLY_PLAYED_FETCH_LIMIT } from '../../core/constants';
import { useLibraryStore } from '../composables/useLibraryStore';

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
  isSlideshowActive,
} = useAppState();

defineEmits(['close']);

const slideshow = useSlideshow();
const libraryStore = useLibraryStore();

/**
 * Toggles the selection of an album. Can be recursive (children included) or single.
 * @param payload - The event payload containing the album and recursive flag.
 */
const handleToggleSelection = ({
  album,
  recursive,
}: {
  album: Album;
  recursive: boolean;
}) => {
  if (recursive) {
    const ids = getAlbumAndChildrenIds(album);
    // Determine the new state: if any child is unselected, the new state is "selected" (true).
    // Otherwise, if all are selected, the new state is "unselected" (false).
    const newSelectionState = ids.some(
      (id) => !albumsSelectedForSlideshow.value[id],
    );

    for (const id of ids) {
      slideshow.toggleAlbumSelection(id, newSelectionState);
    }
  } else {
    // Single mode: Toggle only this album
    const current = albumsSelectedForSlideshow.value[album.id];
    slideshow.toggleAlbumSelection(album.id, !current);
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
 * Toggles the slideshow timer (play/pause).
 */
const handleToggleTimer = () => {
  if (!isSlideshowActive.value) {
    slideshow.startSlideshow();
  }
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
      id: `playlist-${playlist.id}`,
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

// History Handling
const loadHistory = async () => {
  await libraryStore.fetchHistory(RECENTLY_PLAYED_FETCH_LIMIT);
  // Ensure we have actual media files
  if (libraryStore.state.historyMedia.length === 0) {
    throw new Error('No history items found');
  }
};

const handleHistoryGrid = async () => {
  try {
    await loadHistory();
    gridMediaFiles.value = libraryStore.state.historyMedia;
    await nextTick();
    viewMode.value = 'grid';
  } catch (e) {
    console.error('Error opening history grid', e);
    // Optional: show user feedback
  }
};

const handleHistorySlideshow = async () => {
  try {
    await loadHistory();
    const fakeAlbum: Album = {
      id: 'history-playlist',
      name: 'Recently Played',
      textures: libraryStore.state.historyMedia,
      children: [],
    };
    slideshow.startIndividualAlbumSlideshow(fakeAlbum);
  } catch (e) {
    console.error('Error starting history slideshow', e);
    // Optional: show user feedback
  }
};
</script>
