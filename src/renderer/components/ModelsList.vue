<template>
  <div
    class="w-full md:w-1/3 bg-gray-800 shadow-lg rounded-lg p-4 flex flex-col overflow-y-auto panel"
  >
    <div class="header-controls">
      <button @click="handleStartSlideshow" class="action-button">
        Start Slideshow
      </button>
      <div class="timer-controls">
        <label for="timer-duration">Timer (s):</label>
        <input
          type="number"
          id="timer-duration"
          v-model.number="timerDuration"
          min="1"
          class="timer-input"
        />
        <button @click="handleToggleTimer" class="timer-button">
          {{ isTimerRunning ? 'Pause' : 'Play' }}
        </button>
      </div>
      <button @click="openModal" class="action-button">Manage Sources</button>
    </div>

    <h2 class="models-list-header">Models</h2>
    <ul class="space-y-1 flex-grow pr-2 models-list">
      <li v-if="allModels.length === 0" class="text-gray-400">
        Loading models...
      </li>
      <li
        v-for="model in allModels"
        :key="model.name"
        class="model-item"
        :class="{
          'selected-for-slideshow': modelsSelectedForSlideshow[model.name],
        }"
        @click="handleClickModel(model)"
      >
        <div class="model-controls" @click.stop>
          <label class="checkbox-container">
            <input
              type="checkbox"
              :checked="!!modelsSelectedForSlideshow[model.name]"
              @change="handleToggleSelection(model.name)"
            />
            <span class="checkmark"></span>
          </label>
        </div>
        <span class="model-name-clickable">
          {{ model.name }} ({{ model.textures.length }})
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
/**
 * @file This component displays the list of all available media models.
 * It provides controls for starting a global slideshow, managing the timer,
 * opening the sources modal, and selecting/deselecting models for the slideshow.
 * Clicking on a model's name starts a slideshow for that specific model.
 */
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';

const {
  allModels,
  modelsSelectedForSlideshow,
  timerDuration,
  isTimerRunning,
  isSourcesModalVisible,
} = useAppState();

const {
  toggleModelSelection,
  startSlideshow,
  startIndividualModelSlideshow,
  toggleSlideshowTimer,
} = useSlideshow();

/**
 * Toggles the selection of a model for the global slideshow.
 * @param {string} modelName - The name of the model to toggle.
 */
const handleToggleSelection = (modelName) => {
  toggleModelSelection(modelName);
};

/**
 * Starts the global slideshow with all selected models.
 */
const handleStartSlideshow = () => {
  startSlideshow();
};

/**
 * Starts a slideshow for a single, specific model.
 * @param {import('../../main/media-scanner.js').Model} model - The model to start the slideshow for.
 */
const handleClickModel = (model) => {
  startIndividualModelSlideshow(model);
};

/**
 * Toggles the slideshow timer (play/pause).
 */
const handleToggleTimer = () => {
  toggleSlideshowTimer();
};

/**
 * Opens the 'Manage Sources' modal.
 */
const openModal = () => {
  isSourcesModalVisible.value = true;
};
</script>

<style scoped>
/* ... styles remain unchanged ... */
</style>
