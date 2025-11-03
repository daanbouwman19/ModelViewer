<template>
  <div
    v-if="isSourcesModalVisible"
    class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 modal-overlay"
    @click.self="closeModal"
  >
    <div
      class="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-2xl max-h-full overflow-y-auto modal-content"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-semibold">Manage Media Sources</h2>
        <button
          @click="closeModal"
          class="text-gray-400 hover:text-white text-3xl close-button"
        >
          &times;
        </button>
      </div>

      <div class="modal-body">
        <div class="mb-4">
          <ul class="space-y-1 mt-2 sources-list">
            <li v-if="mediaDirectories.length === 0" class="text-gray-400">
              No media sources configured.
            </li>
            <li
              v-for="(dir, index) in mediaDirectories"
              :key="index"
              class="flex items-center justify-between p-1 source-item"
            >
              <input
                type="checkbox"
                :checked="dir.isActive"
                @change="handleToggleActive(dir.path, $event.target.checked)"
                class="source-checkbox"
              />
              <span class="ml-2 flex-grow source-path">{{ dir.path }}</span>
              <button
                @click="handleRemove(dir.path)"
                class="ml-2 action-button remove-button"
              >
                Remove
              </button>
            </li>
          </ul>
        </div>

        <div class="flex gap-4 mt-4 modal-actions">
          <button @click="handleAddDirectory" class="action-button">
            Add Media Directory
          </button>
          <button @click="handleReindex" class="action-button">
            Apply Changes & Re-index
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file This component provides a modal dialog for managing media source directories.
 * Users can add, remove, and toggle the active state of directories.
 * Changes that affect the media library (add, remove, re-index) will reset the current slideshow.
 */
import { useAppState } from '../composables/useAppState';

const { isSourcesModalVisible, mediaDirectories, state } = useAppState();

/**
 * Closes the modal.
 */
const closeModal = () => {
  isSourcesModalVisible.value = false;
};

/**
 * Resets the current slideshow state. This is called after any major change
 * to the media library to prevent a broken state.
 */
const resetSlideshowState = () => {
  state.isSlideshowActive = false;
  state.displayedMediaFiles = [];
  state.currentMediaIndex = -1;
  state.currentMediaItem = null;
  state.globalMediaPoolForSelection = [];
};

/**
 * Toggles the active state of a media directory.
 * @param {string} path - The path of the directory.
 * @param {boolean} isActive - The new active state.
 */
const handleToggleActive = async (path, isActive) => {
  try {
    await window.electronAPI.setDirectoryActiveState(path, isActive);
    const dir = mediaDirectories.value.find((d) => d.path === path);
    if (dir) {
      dir.isActive = isActive;
    }
  } catch (error) {
    console.error('Error toggling directory active state:', error);
  }
};

/**
 * Removes a media directory from the application.
 * @param {string} path - The path of the directory to remove.
 */
const handleRemove = async (path) => {
  try {
    await window.electronAPI.removeMediaDirectory(path);
    const index = mediaDirectories.value.findIndex((d) => d.path === path);
    if (index !== -1) {
      mediaDirectories.value.splice(index, 1);
    }
  } catch (error) {
    console.error('Error removing directory:', error);
  }
};

/**
 * Opens a dialog to add a new media directory.
 */
const handleAddDirectory = async () => {
  try {
    const updatedModels = await window.electronAPI.addMediaDirectory();
    if (updatedModels !== null) {
      state.allModels = updatedModels;
      state.mediaDirectories = await window.electronAPI.getMediaDirectories();
      resetSlideshowState();
    }
  } catch (error) {
    console.error('Error adding media directory:', error);
  }
};

/**
 * Triggers a full re-scan and re-index of the media library.
 */
const handleReindex = async () => {
  try {
    const updatedModels = await window.electronAPI.reindexMediaLibrary();
    state.allModels = updatedModels;
    state.mediaDirectories = await window.electronAPI.getMediaDirectories();
    resetSlideshowState();
  } catch (error) {
    console.error('Error re-indexing library:', error);
  }
};
</script>

<style scoped>
.modal-overlay {
  z-index: 1000;
}

.modal-content {
  background-color: var(--secondary-bg);
  border: 1px solid var(--border-color);
}

.close-button {
  cursor: pointer;
  transition: color 0.2s ease;
}

.sources-list {
  list-style: none;
  padding: 0;
}

.source-item {
  background-color: var(--primary-bg);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
}

.source-checkbox {
  cursor: pointer;
}

.source-path {
  font-size: 0.9rem;
  color: var(--text-color);
}

.remove-button {
  padding: 0.4rem 0.8rem;
  font-size: 0.75rem;
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
}
</style>
