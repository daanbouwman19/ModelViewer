<template>
  <div
    class="file-explorer-container flex flex-col h-full bg-gray-900 text-white rounded-lg overflow-hidden border border-gray-700"
  >
    <!-- Header: Current Path and Up Button -->
    <div
      class="header p-3 bg-gray-800 border-b border-gray-700 flex items-center gap-2"
    >
      <button
        class="p-2 rounded hover:bg-gray-700 disabled:opacity-50"
        :disabled="!parentPath"
        title="Go Up"
        @click="navigateUp"
      >
        ⬆️
      </button>
      <div
        class="current-path flex-grow font-mono text-sm truncate bg-black/30 p-2 rounded"
      >
        {{ currentPath || 'Loading...' }}
      </div>
      <button
        class="p-2 rounded hover:bg-gray-700"
        title="Refresh"
        @click="refresh"
      >
        🔄
      </button>
    </div>

    <!-- File List -->
    <div class="file-list flex-grow overflow-y-auto p-2">
      <div v-if="isLoading" class="text-center p-4 text-gray-400">
        Loading...
      </div>
      <div v-else-if="error" class="text-center p-4 text-red-400">
        {{ error }}
      </div>
      <ul v-else class="space-y-1">
        <li
          v-for="entry in sortedEntries"
          :key="entry.path"
          class="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-800 transition-colors"
          :class="{ 'bg-blue-900/50': entry.path === selectedPath }"
          @click="handleEntryClick(entry)"
          @dblclick="handleEntryDoubleClick(entry)"
        >
          <span class="icon">{{ entry.isDirectory ? '📁' : '📄' }}</span>
          <span class="name flex-grow truncate">{{ entry.name }}</span>
          <span v-if="entry.isDirectory" class="text-xs text-gray-500"
            >DIR</span
          >
        </li>
        <li v-if="entries.length === 0" class="text-gray-500 text-center p-4">
          Empty directory
        </li>
      </ul>
    </div>

    <!-- Footer: Selection Actions -->
    <div
      class="footer p-3 bg-gray-800 border-t border-gray-700 flex justify-end gap-3"
    >
      <button
        class="px-4 py-2 rounded text-gray-300 hover:text-white"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
      <button
        class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!selectedPath"
        @click="confirmSelection"
      >
        Select Directory
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';
import type { FileSystemEntry } from '../../core/file-system';

const props = defineProps<{
  initialPath?: string;
}>();

const emit = defineEmits<{
  (e: 'select', path: string): void;
  (e: 'cancel'): void;
}>();

const currentPath = ref<string>('');
const entries = ref<FileSystemEntry[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const selectedPath = ref<string | null>(null);

const parentPath = ref<string | null>(null);

// Computes parent path string (naive logic, assumes / or \ separator)
// replaced by async call to backend

const sortedEntries = computed(() => {
  return [...entries.value].sort((a, b) => {
    // Directories first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
});

const loadDirectory = async (path: string) => {
  if (!path) return;
  isLoading.value = true;
  error.value = null;
  selectedPath.value = null; // Reset selection on nav
  try {
    const result = await api.listDirectory(path);
    entries.value = result;
    currentPath.value = path;
    // Fetch parent path
    parentPath.value = await api.getParentDirectory(path);
  } catch (err) {
    console.error('Failed to list directory:', err);
    error.value = 'Failed to load directory.';
    // If we failed to load, maybe we shouldn't update currentPath?
    // But we need to know where we are.
    // If it's the initial load, maybe default to root?
  } finally {
    isLoading.value = false;
  }
};

const navigateUp = () => {
  if (parentPath.value) {
    loadDirectory(parentPath.value);
  }
};

const refresh = () => {
  loadDirectory(currentPath.value);
};

const handleEntryClick = (entry: FileSystemEntry) => {
  // In this picker, we only care about directories for selection?
  // The requirement is "FileExplorer".
  // "Add Media Sources" -> implies selecting a directory.
  if (entry.isDirectory) {
    selectedPath.value = entry.path;
  } else {
    selectedPath.value = null;
  }
};

const handleEntryDoubleClick = (entry: FileSystemEntry) => {
  if (entry.isDirectory) {
    loadDirectory(entry.path);
  }
};

const confirmSelection = () => {
  if (selectedPath.value) {
    emit('select', selectedPath.value);
  }
};

onMounted(async () => {
  if (props.initialPath) {
    await loadDirectory(props.initialPath);
  } else {
    // Try to guess a starting path?
    // Maybe root '/'?
    // Or ask backend for "home" dir? API doesn't have `getHomeDir`.
    // We'll try '/' for linux/mac and 'C:/' for windows?
    // We can just try '/' and see.
    await loadDirectory('/');
  }
});
</script>

<style scoped>
.file-explorer-container {
  min-height: 400px;
  max-height: 80vh;
}
</style>
