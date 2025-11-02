<template>
  <div
    class="w-full md:w-1/3 bg-gray-800 shadow-lg rounded-lg p-4 flex flex-col overflow-y-auto panel"
  >
    <div class="header-controls">
      <button @click="handleGlobalSlideshow" class="action-button">
        Global Slideshow
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
          'active-model-individual':
            currentSelectedModelForIndividualView?.name === model.name &&
            !isGlobalSlideshowActive,
          'selected-for-global': modelsSelectedForGlobal[model.name],
        }"
        @click="handleSelectModel(model)"
      >
        <span class="model-name-clickable">
          {{ model.name }} ({{ model.textures.length }})
        </span>
        <div class="model-controls" @click.stop>
          <label class="toggle-label">
            <span>Random</span>
            <input
              type="checkbox"
              :checked="modelRandomModeSettings[model.name]"
              @change="handleToggleRandom(model.name)"
            />
          </label>
          <label class="toggle-label">
            <span>Global</span>
            <input
              type="checkbox"
              :checked="modelsSelectedForGlobal[model.name]"
              @change="handleToggleGlobal(model.name)"
            />
          </label>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAppState } from '../composables/useAppState';
import { useSlideshow } from '../composables/useSlideshow';

const {
  allModels,
  currentSelectedModelForIndividualView,
  isGlobalSlideshowActive,
  modelRandomModeSettings,
  modelsSelectedForGlobal,
  timerDuration,
  isTimerRunning,
  isSourcesModalVisible,
} = useAppState();

const {
  selectModel,
  toggleRandomMode,
  toggleGlobalSelection,
  activateGlobalSlideshow,
  toggleSlideshowTimer,
} = useSlideshow();

const handleSelectModel = (model) => {
  selectModel(model);
};

const handleToggleRandom = (modelName) => {
  toggleRandomMode(modelName);
};

const handleToggleGlobal = (modelName) => {
  toggleGlobalSelection(modelName);
};

const handleGlobalSlideshow = () => {
  activateGlobalSlideshow();
};

const handleToggleTimer = () => {
  toggleSlideshowTimer();
};

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
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  border-radius: 8px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  margin-bottom: 6px;
  cursor: pointer;
}

.model-item:hover {
  background-color: var(--selection-color);
  border-color: var(--accent-color);
  transform: translateX(3px);
}

.model-item.active-model-individual {
  background-color: var(--accent-color);
  border-color: var(--accent-hover);
  color: var(--button-text-color);
  box-shadow: 0 0 8px var(--accent-color);
  font-weight: 700;
}

.model-item.active-model-individual .model-name-clickable {
  color: var(--button-text-color);
}

.model-item.selected-for-global {
  position: relative;
}

.model-item.selected-for-global::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  background-color: var(--accent-hover);
  border-radius: 50%;
}

.model-name-clickable {
  flex-grow: 1;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-color);
  margin-right: 10px;
}

.model-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-left: 10px;
}

.toggle-label {
  font-size: 0.8rem;
  display: grid;
  grid-template-columns: 50px auto;
  align-items: center;
  color: var(--text-color);
  font-weight: 700;
  cursor: pointer;
  gap: 5px;
}

.toggle-label input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--primary-bg);
  cursor: pointer;
  position: relative;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
  flex-shrink: 0;
  justify-self: start;
}

.toggle-label input[type='checkbox']:hover {
  border-color: var(--accent-color);
}

.toggle-label input[type='checkbox']:checked {
  background-color: var(--accent-color);
  border-color: var(--accent-hover);
}

.toggle-label input[type='checkbox']:checked::after {
  content: '✔';
  color: var(--button-text-color);
  font-size: 14px;
  font-weight: bold;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
