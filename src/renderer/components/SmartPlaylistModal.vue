<template>
  <div
    v-if="isSmartPlaylistModalVisible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click.self="close"
  >
    <div
      class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100"
    >
      <div class="flexjustify-between items-center mb-6">
        <h2 class="text-xl font-bold text-gray-100">
          {{ isEditing ? 'Edit' : 'Create' }} Smart Playlist
        </h2>
        <button
          class="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
          @click="close"
        >
          &times;
        </button>
      </div>

      <div class="space-y-4">
        <!-- Name Input -->
        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1"
            >Playlist Name</label
          >
          <input
            v-model="name"
            type="text"
            class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
            placeholder="My Top Rated Videos"
          />
        </div>

        <!-- Rating Criteria -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-400"
            >Minimum Rating (Stars)</label
          >
          <div class="flex items-center gap-2">
            <input
              v-model.number="minRating"
              type="range"
              min="0"
              max="5"
              step="1"
              class="grow h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
            <span class="text-pink-400 font-bold w-6 text-center">{{
              minRating
            }}</span>
          </div>
        </div>

        <!-- Duration Criteria -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-400"
            >Minimum Duration (Minutes)</label
          >
          <input
            v-model.number="minDurationMinutes"
            type="number"
            min="0"
            class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
            placeholder="0"
          />
        </div>

        <!-- View Count Criteria -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-400"
              >Min Views</label
            >
            <input
              v-model.number="minViews"
              type="number"
              min="0"
              class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
              placeholder="0"
            />
          </div>
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-400"
              >Max Views</label
            >
            <input
              v-model.number="maxViews"
              type="number"
              min="0"
              class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
              placeholder="Any"
            />
          </div>
        </div>

        <!-- Recency Criteria -->
        <div>
          <label class="block text-sm font-medium text-gray-400"
            >Not viewed in (days)</label
          >
          <input
            v-model.number="minDaysSinceView"
            type="number"
            min="0"
            class="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
            placeholder="e.g. 90 for 3 months"
          />
        </div>
      </div>

      <div class="mt-8 flex justify-end gap-3">
        <button
          class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors font-medium"
          @click="close"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!name.trim()"
          @click="save"
        >
          {{ isEditing ? 'Save Changes' : 'Create Playlist' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useAppState } from '../composables/useAppState';
import { api } from '../api';

const props = defineProps<{
  playlistToEdit?: {
    id: number;
    name: string;
    criteria: string;
  } | null;
}>();

const emit = defineEmits(['close']);

const { isSmartPlaylistModalVisible, smartPlaylists } = useAppState();

const name = ref('');
const minRating = ref(0);
const minDurationMinutes = ref(0);
const minViews = ref<number | undefined>(undefined);
const maxViews = ref<number | undefined>(undefined);
const minDaysSinceView = ref<number | undefined>(undefined);

const isEditing = computed(() => !!props.playlistToEdit);

// Watch for modal opening to populate/reset form
watch(isSmartPlaylistModalVisible, (visible) => {
  if (visible) {
    if (props.playlistToEdit) {
      name.value = props.playlistToEdit.name;
      try {
        const criteria = JSON.parse(props.playlistToEdit.criteria);
        minRating.value = criteria.minRating || 0;
        minDurationMinutes.value = criteria.minDuration
          ? criteria.minDuration / 60
          : 0;
        minViews.value = criteria.minViews;
        maxViews.value = criteria.maxViews;
        minDaysSinceView.value = criteria.minDaysSinceView;
      } catch (e) {
        console.error('Failed to parse criteria', e);
      }
    }
  } else {
    // Reset form after delay
    setTimeout(() => {
      name.value = '';
      minRating.value = 0;
      minDurationMinutes.value = 0;
      minViews.value = undefined;
      maxViews.value = undefined;
      minDaysSinceView.value = undefined;
      emit('close'); // Notify parent to clear edit selection
    }, 300);
  }
});

const close = () => {
  isSmartPlaylistModalVisible.value = false;
};

const save = async () => {
  if (!name.value.trim()) return;

  const criteria = {
    minRating: minRating.value > 0 ? minRating.value : undefined,
    minDuration:
      minDurationMinutes.value > 0 ? minDurationMinutes.value * 60 : undefined, // Convert to seconds
    minViews: minViews.value,
    maxViews: maxViews.value,
    minDaysSinceView: minDaysSinceView.value,
  };

  try {
    if (isEditing.value && props.playlistToEdit) {
      await api.updateSmartPlaylist(
        props.playlistToEdit.id,
        name.value,
        JSON.stringify(criteria),
      );
    } else {
      await api.createSmartPlaylist(name.value, JSON.stringify(criteria));
    }

    // Optimistically update list or re-fetch
    smartPlaylists.value = await api.getSmartPlaylists();

    close();
  } catch (err) {
    console.error('Failed to save playlist:', err);
  }
};
</script>
