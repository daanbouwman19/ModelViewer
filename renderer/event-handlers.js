/**
 * @file Contains all primary event handler functions for the renderer process.
 * This includes initialization, user interactions like selecting a model,
 * starting slideshows, re-indexing the library, and handling keyboard shortcuts.
 * These handlers orchestrate calls to other modules to update state and UI.
 * @requires ./state.js
 * @requires ./ui-elements.js
 * @requires ./ui-updates.js
 * @requires ./slideshow.js
 */
import { state } from './state.js';
import {
  modelsListElement,
  currentModelTitleElement,
  timerDurationInput,
  reindexLibraryButton,
  prevMediaButton,
  nextMediaButton,
} from './ui-elements.js';
import {
  displayCurrentMedia,
  clearMediaDisplay,
  updateNavButtons,
} from './ui-updates.js';
import {
  stopSlideshowTimer,
  navigateMedia,
  toggleSlideshowTimer,
  prepareMediaListForIndividualView,
  pickAndDisplayNextGlobalMediaItem,
} from './slideshow.js';

/**
 * Creates a toggle control with consistent styling.
 * @param {string} labelText - The text label for the toggle.
 * @returns {{label: HTMLLabelElement, checkbox: HTMLInputElement}} An object containing the label and checkbox elements.
 */
function createToggleControl(labelText) {
  const label = document.createElement('label');
  label.className =
    'flex items-center space-x-1.5 text-xs text-white font-bold cursor-pointer';

  const textSpan = document.createElement('span');
  textSpan.className = 'inline-block w-12';
  textSpan.textContent = labelText;
  label.appendChild(textSpan);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className =
    'h-4 w-4 rounded border-gray-500 bg-gray-700 text-cyan-500 shadow-sm focus:border-cyan-500 focus:ring focus:ring-offset-gray-800 focus:ring-cyan-600 focus:ring-opacity-50';
  label.appendChild(checkbox);

  return { label, checkbox };
}

/**
 * Performs the initial loading of data when the application starts.
 * It fetches the list of models with their view counts from the main process,
 * populates the central state, and then calls the function to build the model list UI.
 * @async
 */
export async function initialLoad() {
  try {
    state.allModels = await window.electronAPI.getModelsWithViewCounts();
    await populateModelsListUI_internal(); // Populates the model list in the UI
  } catch (error) {
    console.error(
      'Error during initial load of models with view counts:',
      error,
    );
    if (modelsListElement)
      modelsListElement.innerHTML =
        '<li>Error loading models. Click Re-index.</li>';
  }
}

/**
 * Selects a model for individual viewing, updating the UI and media display.
 * @param {Object} model - The model object to display.
 */
export function selectModelForIndividualView(model) {
  stopSlideshowTimer();
  state.isGlobalSlideshowActive = false;
  state.currentSelectedModelForIndividualView = model;
  state.originalMediaFilesForIndividualView = model.textures || [];

  prepareMediaListForIndividualView(); // Prepares the playlist for the selected model

  state.currentMediaIndex = -1; // Reset index
  state.currentMediaItem = null;

  // Highlight the selected model in the list
  document.querySelectorAll('#models-list li').forEach((li) => {
    li.classList.remove('active-model-individual');
    if (li.dataset.modelName === model.name)
      li.classList.add('active-model-individual');
  });
  if (currentModelTitleElement)
    currentModelTitleElement.textContent = `Model: ${model.name}`;

  if (state.displayedMediaFiles.length > 0) {
    state.currentMediaIndex = 0; // Start from the first media item
    state.currentMediaItem = state.displayedMediaFiles[state.currentMediaIndex];
    displayCurrentMedia();
  } else {
    clearMediaDisplay('No media files in this model.');
  }
  updateNavButtons();
}

/**
 * Populates the models list in the UI based on the current state.allModels.
 * This is an internal helper function.
 */
async function populateModelsListUI_internal() {
  if (!modelsListElement) return;
  modelsListElement.innerHTML = ''; // Clear existing list

  if (!state.allModels || state.allModels.length === 0) {
    modelsListElement.innerHTML =
      '<li>No models found. Click "Re-index Library".</li>';
    return;
  }

  state.allModels.forEach((model) => {
    const listItem = document.createElement('li');
    listItem.dataset.modelName = model.name; // Store model name for identification
    listItem.className =
      'flex justify-between items-center px-4 py-2.5 rounded-md transition-all duration-200 ease-in-out border border-transparent mb-1.5 cursor-pointer';

    const modelNameSpan = document.createElement('span');
    modelNameSpan.className = 'flex-grow text-sm font-medium text-white mr-2.5';
    const fileCount = model.textures ? model.textures.length : 0;
    modelNameSpan.textContent = `${model.name} (${fileCount} files)`;

    // Attach click handler to the entire list item for better UX
    listItem.addEventListener('click', (e) => {
      // The controls div is the second child of the list item.
      // If the click is inside the controls, do not select the model.
      const controlsContainer = e.currentTarget.children[1];
      if (controlsContainer && controlsContainer.contains(e.target)) {
        return;
      }
      selectModelForIndividualView(model);
    });

    listItem.appendChild(modelNameSpan);

    // Controls for random mode and global slideshow inclusion
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex flex-col items-start gap-1 ml-2.5';

    // Random toggle
    const { label: randomToggleLabel, checkbox: randomToggleCheckbox } =
      createToggleControl('Rand:');
    // Initialize or use existing random mode setting for this model
    state.modelRandomModeSettings[model.name] =
      state.modelRandomModeSettings[model.name] || false;
    randomToggleCheckbox.checked = state.modelRandomModeSettings[model.name];
    randomToggleCheckbox.title = `Play media from ${model.name} in random order`;
    randomToggleCheckbox.addEventListener('change', (e) => {
      state.modelRandomModeSettings[model.name] = e.target.checked;
      // If this model is currently selected for individual view, update its playlist
      if (
        state.currentSelectedModelForIndividualView &&
        state.currentSelectedModelForIndividualView.name === model.name &&
        !state.isGlobalSlideshowActive
      ) {
        prepareMediaListForIndividualView();
        if (state.displayedMediaFiles.length > 0) {
          state.currentMediaIndex = 0;
          state.currentMediaItem = state.displayedMediaFiles[0];
          displayCurrentMedia();
        } else {
          clearMediaDisplay(
            'No media files for this model with current settings.',
          );
        }
      }
    });
    controlsDiv.appendChild(randomToggleLabel);

    // Global slideshow toggle
    const { label: globalToggleLabel, checkbox: globalToggleCheckbox } =
      createToggleControl('Global:');
    // Initialize or use existing global selection setting (default to true)
    state.modelsSelectedForGlobal[model.name] =
      state.modelsSelectedForGlobal[model.name] === undefined
        ? true
        : state.modelsSelectedForGlobal[model.name];
    globalToggleCheckbox.checked = state.modelsSelectedForGlobal[model.name];
    listItem.classList.toggle(
      'selected-for-global',
      globalToggleCheckbox.checked,
    );
    globalToggleCheckbox.title = `Include ${model.name} in Global Slideshow`;
    globalToggleCheckbox.addEventListener('change', (e) => {
      state.modelsSelectedForGlobal[model.name] = e.target.checked;
      listItem.classList.toggle('selected-for-global', e.target.checked);
      // If global slideshow is active, refresh it to reflect changes
      if (state.isGlobalSlideshowActive) {
        activateGlobalSlideshowHandler();
      }
    });
    controlsDiv.appendChild(globalToggleLabel);

    listItem.appendChild(controlsDiv);
    modelsListElement.appendChild(listItem);
  });
}

/**
 * Activates the global slideshow mode.
 */
export function activateGlobalSlideshowHandler() {
  stopSlideshowTimer();
  state.isGlobalSlideshowActive = true;
  state.currentSelectedModelForIndividualView = null; // Deselect any individual model
  document
    .querySelectorAll('#models-list li')
    .forEach((li) => li.classList.remove('active-model-individual'));

  // Build the pool of media for global slideshow from selected models
  state.globalMediaPoolForSelection = [];
  state.allModels.forEach((model) => {
    if (state.modelsSelectedForGlobal[model.name]) {
      state.globalMediaPoolForSelection.push(...(model.textures || []));
    }
  });

  if (state.globalMediaPoolForSelection.length === 0) {
    clearMediaDisplay('No models selected or no media for Global Slideshow.');
    if (currentModelTitleElement)
      currentModelTitleElement.textContent = 'Global Slideshow (No Media)';
    state.displayedMediaFiles.length = 0;
    state.currentMediaItem = null;
    state.currentMediaIndex = -1;
    updateNavButtons();
    return;
  }

  if (currentModelTitleElement)
    currentModelTitleElement.textContent = 'Global Slideshow (Weighted Random)';
  state.displayedMediaFiles.length = 0; // Clear history of displayed files for global mode
  state.currentMediaIndex = -1;
  pickAndDisplayNextGlobalMediaItem(); // Display the first item
}

/**
 * Handles the re-indexing of the media library.
 */
export async function handleReindex() {
  console.log('Re-index library button clicked.');
  if (reindexLibraryButton) {
    reindexLibraryButton.textContent = 'Re-indexing...';
    reindexLibraryButton.disabled = true;
  }
  stopSlideshowTimer();
  clearMediaDisplay('Re-indexing library, please wait...');
  if (currentModelTitleElement)
    currentModelTitleElement.textContent = 'Re-indexing...';

  try {
    const newModels = await window.electronAPI.reindexMediaLibrary();
    state.allModels = newModels;
    await populateModelsListUI_internal(); // Refresh the models list UI

    // Reset application state related to current display
    state.currentSelectedModelForIndividualView = null;
    state.isGlobalSlideshowActive = false;
    state.displayedMediaFiles.length = 0;
    state.currentMediaIndex = -1;
    state.currentMediaItem = null;
    state.globalMediaPoolForSelection.length = 0;

    clearMediaDisplay(
      'Library re-indexed. Select a model or start global slideshow.',
    );
    if (currentModelTitleElement)
      currentModelTitleElement.textContent =
        'Select a model or start Global Slideshow';
  } catch (error) {
    console.error('Error during re-indexing:', error);
    clearMediaDisplay('Error during re-indexing. Check console.');
    if (currentModelTitleElement)
      currentModelTitleElement.textContent = 'Error Re-indexing';
  } finally {
    if (reindexLibraryButton) {
      reindexLibraryButton.textContent = 'Re-index Library';
      reindexLibraryButton.disabled = false;
    }
    updateNavButtons();
  }
}

/**
 * Handles global keydown events for navigation and timer control.
 * @param {KeyboardEvent} event - The keydown event.
 */
export function handleKeydown(event) {
  // Ignore key events if an input field or button has focus
  if (
    document.activeElement === timerDurationInput ||
    document.activeElement.tagName === 'BUTTON'
  ) {
    return;
  }
  switch (event.key) {
    case 'ArrowLeft':
      if (prevMediaButton && !prevMediaButton.disabled) navigateMedia(-1);
      break;
    case 'ArrowRight':
      if (nextMediaButton && !nextMediaButton.disabled) navigateMedia(1);
      break;
    case ' ': // Space bar
      event.preventDefault(); // Prevent page scroll
      toggleSlideshowTimer();
      break;
  }
}
