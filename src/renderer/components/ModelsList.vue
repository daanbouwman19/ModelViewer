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
.panel {
  background-color: var(--secondary-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
}

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

.models-list-header {
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

.models-list {
  list-style: none;
  padding: 0;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 15px;
  border-radius: 12px;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  margin-bottom: 8px;
  cursor: pointer;
}

.model-item:hover {
  background-color: rgba(255, 182, 193, 0.1);
  border-color: #ffb6c1;
  transform: translateX(3px);
  box-shadow: 0 4px 12px rgba(255, 182, 193, 0.2);
}

.model-item.selected-for-slideshow {
  background-color: rgba(255, 192, 203, 0.15);
  border-color: #ffb6c1;
}

.model-name-clickable {
  flex-grow: 1;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-color);
  transition: color 0.2s ease;
  pointer-events: none; /* Let the parent handle clicks */
}

.model-item:hover .model-name-clickable {
  color: #ff69b4;
}

.model-controls {
  display: flex;
  align-items: center;
}

/* Custom checkbox styling */
.checkbox-container {
  display: inline-block;
  position: relative;
  cursor: pointer;
  user-select: none;
}

.checkbox-container input[type='checkbox'] {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  position: relative;
  display: inline-block;
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #ffeef8 0%, #ffe0f0 100%);
  border: 2px solid #ffb6c1;
  border-radius: 8px;
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  box-shadow: 0 2px 6px rgba(255, 105, 180, 0.15);
}

.checkbox-container:hover .checkmark {
  border-color: #ff69b4;
  box-shadow: 0 4px 12px rgba(255, 105, 180, 0.3);
  transform: scale(1.1);
}

.checkbox-container input[type='checkbox']:checked ~ .checkmark {
  background: linear-gradient(135deg, #ff69b4 0%, #ff1493 100%);
  border-color: #ff1493;
  box-shadow: 0 4px 16px rgba(255, 20, 147, 0.4);
}

.checkmark::after {
  content: '';
  position: absolute;
  display: none;
  left: 7px;
  top: 3px;
  width: 6px;
  height: 11px;
  border: solid white;
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}

.checkbox-container input[type='checkbox']:checked ~ .checkmark::after {
  display: block;
  animation: checkmark-pop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes checkmark-pop {
  0% {
    transform: rotate(45deg) scale(0);
  }
  50% {
    transform: rotate(45deg) scale(1.2);
  }
  100% {
    transform: rotate(45deg) scale(1);
  }
}
</style>
