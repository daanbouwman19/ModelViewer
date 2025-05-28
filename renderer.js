// ModelViewer-App/renderer.js

document.addEventListener('DOMContentLoaded', async () => {
    // --- UI Elements ---
    const modelsListElement = document.getElementById('models-list');
    const currentModelTitleElement = document.getElementById('current-model-title');
    const mediaDisplayArea = document.getElementById('media-display-area');
    const mediaPlaceholder = document.getElementById('media-placeholder');
    const fileNameInfoElement = document.getElementById('file-name-info');
    const fileCountInfoElement = document.getElementById('file-count-info');
    const prevMediaButton = document.getElementById('prev-media-button');
    const nextMediaButton = document.getElementById('next-media-button');
    const startGlobalSlideshowButton = document.getElementById('start-global-slideshow-button');
    const timerDurationInput = document.getElementById('timer-duration');
    const playPauseTimerButton = document.getElementById('play-pause-timer-button');
    const reindexLibraryButton = document.getElementById('reindex-library-button');
    const reindexSpinner = document.getElementById('reindex-spinner');
    const selectMediaDirButton = document.getElementById('select-media-dir-button');
    const currentMediaDirDisplay = document.getElementById('current-media-dir-display');

    // --- Application State ---
    let allModels = []; 
    let currentSelectedModelForIndividualView = null; 
    let originalMediaFilesForIndividualView = [];
    
    let globalMediaPoolForSelection = []; 
    
    let displayedMediaFiles = []; 
    let currentMediaItem = null; 
    
    let currentMediaIndex = -1; 
    const modelRandomModeSettings = {}; 
    const modelsSelectedForGlobal = {}; 
    let isGlobalSlideshowActive = false;
    let slideshowTimerId = null;
    let isTimerPlaying = false;

    // --- Initial Checks ---
    const criticalElements = [modelsListElement, currentModelTitleElement, mediaDisplayArea, mediaPlaceholder, fileNameInfoElement, fileCountInfoElement, prevMediaButton, nextMediaButton, startGlobalSlideshowButton, timerDurationInput, playPauseTimerButton, reindexLibraryButton];
    if (criticalElements.some(el => !el)) {
        console.error('CRITICAL ERROR: One or more UI elements are missing. App cannot function fully.');
        if (currentModelTitleElement) currentModelTitleElement.textContent = 'Error: UI missing elements.';
        return;
    }

    // --- Event Listeners ---
    prevMediaButton.addEventListener('click', () => navigateMedia(-1));
    nextMediaButton.addEventListener('click', () => navigateMedia(1));
    startGlobalSlideshowButton.addEventListener('click', activateGlobalSlideshow);
    playPauseTimerButton.addEventListener('click', toggleSlideshowTimer);
    reindexLibraryButton.addEventListener('click', handleReindex);
    selectMediaDirButton.addEventListener('click', handleSelectMediaDirectory);

    document.addEventListener('keydown', (event) => {
        if (document.activeElement === timerDurationInput || document.activeElement.tagName === 'BUTTON') {
            return; 
        }
        switch (event.key) {
            case 'ArrowLeft': if (!prevMediaButton.disabled) navigateMedia(-1); break;
            case 'ArrowRight': if (!nextMediaButton.disabled) navigateMedia(1); break;
            case ' ': event.preventDefault(); toggleSlideshowTimer(); break;
        }
    });

    // --- Slideshow Timer Functions ---
    function startSlideshowTimer() { 
        stopSlideshowTimer(); 
        const durationSeconds = parseInt(timerDurationInput.value, 10);
        if (isNaN(durationSeconds) || durationSeconds < 1) {
            timerDurationInput.value = 5; 
            if (isTimerPlaying) { 
                isTimerPlaying = false; 
                toggleSlideshowTimer(); 
            }
            return; 
        }
        isTimerPlaying = true;
        playPauseTimerButton.textContent = 'Pause';
        slideshowTimerId = setInterval(() => { navigateMedia(1); }, durationSeconds * 1000);
        console.log(`Slideshow timer started for ${durationSeconds}s interval.`);
    }
    function stopSlideshowTimer() { 
        if (slideshowTimerId) clearInterval(slideshowTimerId);
        slideshowTimerId = null;
        isTimerPlaying = false;
        playPauseTimerButton.textContent = 'Play';
        console.log("Slideshow timer stopped.");
    }
    function toggleSlideshowTimer() { 
        const currentPool = isGlobalSlideshowActive ? globalMediaPoolForSelection : displayedMediaFiles;
        if (currentPool.length === 0 && !currentMediaItem) {
             console.log("Cannot start timer: No media loaded or pool is empty."); return;
        }
        if (isGlobalSlideshowActive && globalMediaPoolForSelection.length === 0){
            console.log("Cannot start timer: Global slideshow active but pool is empty."); return;
        }
        if (!isGlobalSlideshowActive && currentSelectedModelForIndividualView && displayedMediaFiles.length === 0){
            console.log("Cannot start timer: Individual model selected but has no media."); return;
        }

        if (isTimerPlaying) stopSlideshowTimer();
        else {
            startSlideshowTimer();
            if (!currentMediaItem && (isGlobalSlideshowActive || currentSelectedModelForIndividualView)) {
                 navigateMedia(0); 
            }
        }
    }

    // --- Core Logic Functions ---
    function shuffleArray(array) { 
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    function selectWeightedRandom(items, excludePaths = []) {
        if (!items || items.length === 0) return null;
        let eligibleItems = items.filter(item => !excludePaths.includes(item.path));
        if (eligibleItems.length === 0) {
            console.warn("Weighted random: All items were in excludePaths or pool is small, picking from original list (excluding only current if applicable).");
            eligibleItems = items; 
        }
        if (eligibleItems.length === 0) return null;

        const weightedItems = eligibleItems.map(item => ({
            ...item,
            weight: 1 / ((item.viewCount || 0) + 1) 
        }));
        const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
        if (totalWeight < 1e-9 && eligibleItems.length > 0) {
            console.warn("Weighted random: Total weight is near zero, using uniform random selection from eligible items.");
            return eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
        }
        if (totalWeight === 0) return null; 
        
        let random = Math.random() * totalWeight;
        for (const item of weightedItems) {
            random -= item.weight;
            if (random <= 0) return item;
        }
        return eligibleItems.length > 0 ? eligibleItems[eligibleItems.length - 1] : null;
    }
    
    function generatePlaylistForIndividualModel(mediaPool, isRandom) {
        if (!mediaPool || mediaPool.length === 0) return [];
        if (isRandom) {
            return shuffleArray(mediaPool);
        } else { 
            return [...mediaPool];
        }
    }
    
    async function populateModelsListUI() { 
        modelsListElement.innerHTML = ''; 
        if (!allModels || allModels.length === 0) {
            modelsListElement.innerHTML = '<li>No models found. Click "Re-index Library".</li>';
            return;
        }
        allModels.forEach(model => {
            const listItem = document.createElement('li'); 
            listItem.dataset.modelName = model.name;

            const modelNameSpan = document.createElement('span'); 
            modelNameSpan.className = 'model-name-clickable';
            // --- MODIFICATION START: Display file count ---
            const fileCount = model.textures ? model.textures.length : 0;
            modelNameSpan.textContent = `${model.name} (${fileCount} files)`;
            // --- MODIFICATION END ---
            modelNameSpan.addEventListener('click', () => selectModelForIndividualView(model)); 
            listItem.appendChild(modelNameSpan);

            const controlsDiv = document.createElement('div'); 
            controlsDiv.className = 'model-controls';
            const randomToggleLabel = document.createElement('label'); 
            randomToggleLabel.className = 'toggle-label'; 
            randomToggleLabel.textContent = 'Rand: ';
            const randomToggleCheckbox = document.createElement('input'); 
            randomToggleCheckbox.type = 'checkbox';
            // NEW WAY - Initialize from model data
            modelRandomModeSettings[model.name] = model.isRandom; 
            randomToggleCheckbox.checked = model.isRandom;
            randomToggleCheckbox.title = `Play media from ${model.name} in random order`;
            randomToggleCheckbox.addEventListener('change', async (e) => { // Made async
                e.stopPropagation(); 
                modelRandomModeSettings[model.name] = e.target.checked;
                try {
                    await window.electronAPI.updateModelSettings({
                        modelName: model.name,
                        isRandom: modelRandomModeSettings[model.name],
                        isSelectedForGlobal: modelsSelectedForGlobal[model.name] 
                    });
                } catch (err) {
                    console.error('Failed to save random toggle setting:', err);
                    // Optionally revert UI or notify user
                }
                if (currentSelectedModelForIndividualView && currentSelectedModelForIndividualView.name === model.name && !isGlobalSlideshowActive) {
                    prepareMediaListForIndividualView();
                    if (displayedMediaFiles.length > 0) { 
                        currentMediaIndex = 0; 
                        currentMediaItem = displayedMediaFiles[0]; 
                        displayCurrentMedia(); 
                    } else { 
                        clearMediaDisplay("No media files for this model with current settings."); 
                    }
                }
            });
            randomToggleLabel.appendChild(randomToggleCheckbox); 
            controlsDiv.appendChild(randomToggleLabel);

            const globalToggleLabel = document.createElement('label'); 
            globalToggleLabel.className = 'toggle-label'; 
            globalToggleLabel.textContent = 'Global: ';
            const globalToggleCheckbox = document.createElement('input'); 
            globalToggleCheckbox.type = 'checkbox';
            // NEW WAY - Initialize from model data
            modelsSelectedForGlobal[model.name] = model.isSelectedForGlobal; 
            globalToggleCheckbox.checked = model.isSelectedForGlobal;
            listItem.classList.toggle('selected-for-global', model.isSelectedForGlobal);
            globalToggleCheckbox.title = `Include ${model.name} in Global Slideshow`;
            globalToggleCheckbox.addEventListener('change', async (e) => { // Made async
                e.stopPropagation(); 
                modelsSelectedForGlobal[model.name] = e.target.checked;
                listItem.classList.toggle('selected-for-global', e.target.checked);
                try {
                    await window.electronAPI.updateModelSettings({
                        modelName: model.name,
                        isRandom: modelRandomModeSettings[model.name], 
                        isSelectedForGlobal: modelsSelectedForGlobal[model.name]
                    });
                } catch (err) {
                    console.error('Failed to save global toggle setting:', err);
                     // Optionally revert UI or notify user
                }
                if (isGlobalSlideshowActive) {
                    // If global slideshow is active, rebuild the pool and restart or update
                    activateGlobalSlideshow(); 
                }
            });
            globalToggleLabel.appendChild(globalToggleCheckbox); 
            controlsDiv.appendChild(globalToggleLabel);
            listItem.appendChild(controlsDiv); 
            modelsListElement.appendChild(listItem);
        });
    }

    async function initialLoad() {
        try {
            await loadAndDisplayCurrentDirectory(); // Load and display current directory first
            allModels = await window.electronAPI.getModelsWithViewCounts();
            populateModelsListUI();
        } catch (error) {
            console.error('Error during initial load of models with view counts:', error);
            modelsListElement.innerHTML = '<li>Error loading models. Click Re-index.</li>';
        }
    }

    async function loadAndDisplayCurrentDirectory() {
        try {
            const currentDir = await window.electronAPI.getCurrentBaseMediaDirectory();
            if (currentDir) {
                currentMediaDirDisplay.textContent = `Current: ${currentDir}`;
            } else {
                currentMediaDirDisplay.textContent = 'Current: Not Set';
                // Optionally, prompt user to select a directory if none is set
                modelsListElement.innerHTML = '<li>Base media directory not set. Please select one.</li>';
                disableControlsOnNoDirectory();
            }
        } catch (error) {
            console.error('Error loading current media directory:', error);
            currentMediaDirDisplay.textContent = 'Current: Error loading';
            disableControlsOnNoDirectory();
        }
    }

    function disableControlsOnNoDirectory() {
        startGlobalSlideshowButton.disabled = true;
        reindexLibraryButton.disabled = true;
        playPauseTimerButton.disabled = true;
        // Potentially other controls too
    }

    function enableControlsAfterDirectorySet() {
        startGlobalSlideshowButton.disabled = false;
        reindexLibraryButton.disabled = false;
        // playPauseTimerButton might still depend on media loaded
        // updateNavButtons() will handle playPauseTimerButton and prev/next correctly
    }
    
    function prepareMediaListForIndividualView() { 
        if (!currentSelectedModelForIndividualView) return;
        const isRandom = modelRandomModeSettings[currentSelectedModelForIndividualView.name] || false;
        displayedMediaFiles = generatePlaylistForIndividualModel(originalMediaFilesForIndividualView, isRandom);
    }

    function selectModelForIndividualView(model) { 
        stopSlideshowTimer(); 
        isGlobalSlideshowActive = false;
        currentSelectedModelForIndividualView = model;
        originalMediaFilesForIndividualView = model.textures || []; 
        prepareMediaListForIndividualView(); 
        currentMediaIndex = -1; 
        currentMediaItem = null;

        document.querySelectorAll('#models-list li').forEach(li => {
            li.classList.remove('active-model-individual');
            if (li.dataset.modelName === model.name) li.classList.add('active-model-individual');
        });
        currentModelTitleElement.textContent = `Model: ${model.name}`;
        if (displayedMediaFiles.length > 0) { 
            currentMediaIndex = 0; 
            currentMediaItem = displayedMediaFiles[currentMediaIndex];
            displayCurrentMedia(); 
        } else { 
            clearMediaDisplay("No media files in this model.");
        }
        updateNavButtons();
    }

    function activateGlobalSlideshow() {
        stopSlideshowTimer(); 
        isGlobalSlideshowActive = true;
        currentSelectedModelForIndividualView = null; 
        document.querySelectorAll('#models-list li').forEach(li => li.classList.remove('active-model-individual'));

        globalMediaPoolForSelection = []; 
        allModels.forEach(model => {
            if (modelsSelectedForGlobal[model.name]) {
                globalMediaPoolForSelection.push(...(model.textures || []));
            }
        });

        if (globalMediaPoolForSelection.length === 0) {
            clearMediaDisplay("No models selected or no media for Global Slideshow.");
            currentModelTitleElement.textContent = "Global Slideshow (No Media)";
            displayedMediaFiles = []; 
            currentMediaItem = null;
            currentMediaIndex = -1; 
            updateNavButtons();
            return;
        }
        
        currentModelTitleElement.textContent = "Global Slideshow (Weighted Random)";
        displayedMediaFiles = []; 
        currentMediaIndex = -1;   
        pickAndDisplayNextGlobalMediaItem(); 
    }

    function pickAndDisplayNextGlobalMediaItem() {
        if (globalMediaPoolForSelection.length === 0) {
            clearMediaDisplay("Global media pool is empty.");
            updateNavButtons();
            return;
        }
        
        const historyPaths = displayedMediaFiles.slice(-Math.min(5, displayedMediaFiles.length)).map(item => item.path); 
        const newItem = selectWeightedRandom(globalMediaPoolForSelection, historyPaths);
        
        if (newItem) {
            displayedMediaFiles.push(newItem); 
            currentMediaIndex = displayedMediaFiles.length - 1; 
            currentMediaItem = newItem;
            displayCurrentMedia();
        } else {
            console.warn("Could not select a new distinct global media item. Pool might be exhausted or too small for history avoidance. Trying any item.");
            if (globalMediaPoolForSelection.length > 0) {
                 currentMediaItem = globalMediaPoolForSelection[Math.floor(Math.random() * globalMediaPoolForSelection.length)];
                 displayedMediaFiles.push(currentMediaItem); 
                 currentMediaIndex = displayedMediaFiles.length - 1;
                 displayCurrentMedia();
            } else {
                clearMediaDisplay("Global media pool exhausted.");
            }
        }
        updateNavButtons();
    }


    async function displayCurrentMedia() {
        const mediaFileToDisplay = currentMediaItem; 

        if (!mediaFileToDisplay) {
            const message = isGlobalSlideshowActive ? "No media item selected for global display." : (currentSelectedModelForIndividualView ? "No media to display for this model." : "No media selected.");
            clearMediaDisplay(message);
            if (isTimerPlaying && isGlobalSlideshowActive && globalMediaPoolForSelection.length > 0) {
                pickAndDisplayNextGlobalMediaItem();
            } else {
                stopSlideshowTimer();
            }
            updateNavButtons();
            return;
        }

        mediaDisplayArea.innerHTML = ''; 
        mediaPlaceholder.style.display = 'none';
        const loadingText = document.createElement('p'); 
        loadingText.textContent = `Loading ${mediaFileToDisplay.name}...`;
        loadingText.className = 'text-gray-400 absolute';
        mediaDisplayArea.appendChild(loadingText);

        try {
            if (mediaFileToDisplay && mediaFileToDisplay.path) {
                await window.electronAPI.recordMediaView(mediaFileToDisplay.path);
                mediaFileToDisplay.viewCount = (mediaFileToDisplay.viewCount || 0) + 1; 
            }

            const loadResult = await window.electronAPI.loadFileAsDataURL(mediaFileToDisplay.path);
            if (loadingText.parentNode === mediaDisplayArea) mediaDisplayArea.removeChild(loadingText);
            if (!loadResult) throw new Error('Failed to get load result');
            
            let mediaElement; 
            const fileExtension = mediaFileToDisplay.path.split('.').pop().toLowerCase();
            const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
            const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];

            if (imageExtensions.includes(fileExtension)) { mediaElement = document.createElement('img'); mediaElement.alt = mediaFileToDisplay.name; }
            else if (videoExtensions.includes(fileExtension)) { 
                mediaElement = document.createElement('video'); 
                mediaElement.controls = true; mediaElement.autoplay = true; mediaElement.muted = true;    
                mediaElement.loop = !isTimerPlaying; 
                mediaElement.preload = 'auto';
                if (isTimerPlaying) { 
                    mediaElement.onended = () => { if (isTimerPlaying) navigateMedia(1); }; 
                }
            }
            else { mediaElement = document.createElement('p'); mediaElement.textContent = `Unsupported: ${mediaFileToDisplay.name}`; mediaElement.className = 'text-red-400 absolute'; }
            
            if (loadResult.type === 'data-url') mediaElement.src = loadResult.url;
            else if (loadResult.type === 'custom-protocol') {
                const encodedPath = encodeURIComponent(loadResult.path);
                mediaElement.src = `${loadResult.protocolScheme}://${encodedPath}?t=${Date.now()}`;
            } else throw new Error('Unknown load result type');
            
            if (mediaElement.tagName === 'VIDEO' || mediaElement.tagName === 'IMG') {
                 mediaElement.onerror = (e) => { 
                    const errorSource = e.target;
                    let errorMessage = `Error loading ${mediaFileToDisplay.name}.`;
                    if(errorSource.error) { 
                        errorMessage += ` Code: ${errorSource.error.code}, Message: ${errorSource.error.message || 'No specific message.'}`;
                        switch (errorSource.error.code) {
                            case 1: errorMessage += " (Aborted)"; break;
                            case 2: errorMessage += " (Network error)"; break;
                            case 3: errorMessage += " (Decode error)"; break;
                            case 4: errorMessage += " (Format/Codec not supported)"; break;
                            default: errorMessage += " (Unknown error)";
                        }
                     }
                    console.error(errorMessage, e); 
                    if(mediaDisplayArea.contains(loadingText)) mediaDisplayArea.removeChild(loadingText);
                    mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute">${errorMessage}. Check console.</p>`;
                 };
            }
            if (mediaElement.tagName === 'VIDEO') mediaElement.onloadedmetadata = () => console.log(`Video metadata loaded: ${mediaFileToDisplay.name}`);

            if (!mediaDisplayArea.querySelector('.text-red-400')) mediaDisplayArea.appendChild(mediaElement);
        } catch (error) { 
            console.error(`Error displaying media ${mediaFileToDisplay.name} (Path: ${mediaFileToDisplay.path}):`, error);
            if(mediaDisplayArea.contains(loadingText)) mediaDisplayArea.removeChild(loadingText);
            mediaDisplayArea.innerHTML = `<p class="text-red-400 absolute">Error loading: ${mediaFileToDisplay.name}. Check console.</p>`;
        }

        fileNameInfoElement.textContent = `${mediaFileToDisplay.name} (Viewed: ${mediaFileToDisplay.viewCount || 0} times)`;
        if (isGlobalSlideshowActive) {
            fileCountInfoElement.textContent = `Global Slideshow - Item ${currentMediaIndex + 1} of ${displayedMediaFiles.length} (Pool: ${globalMediaPoolForSelection.length} items)`;
        } else {
            fileCountInfoElement.textContent = `File ${currentMediaIndex + 1} of ${displayedMediaFiles.length}`;
        }
        updateNavButtons();
    }

    function clearMediaDisplay(message = "Select a model or start Global Slideshow.") { 
        mediaDisplayArea.innerHTML = '';
        mediaPlaceholder.textContent = message;
        mediaPlaceholder.style.display = 'block';
        fileNameInfoElement.textContent = '\u00A0'; 
        fileCountInfoElement.textContent = '\u00A0'; 
        currentMediaItem = null; 
        if (isTimerPlaying && (!isGlobalSlideshowActive || globalMediaPoolForSelection.length === 0)) {
            stopSlideshowTimer();
        }
    }

    function updateNavButtons() { 
        if (isGlobalSlideshowActive) {
            prevMediaButton.disabled = currentMediaIndex <= 0; 
            nextMediaButton.disabled = globalMediaPoolForSelection.length === 0; 
            playPauseTimerButton.disabled = globalMediaPoolForSelection.length === 0;
        } else { 
            prevMediaButton.disabled = currentMediaIndex <= 0;
            nextMediaButton.disabled = (currentMediaIndex >= displayedMediaFiles.length - 1 || displayedMediaFiles.length === 0);
            playPauseTimerButton.disabled = displayedMediaFiles.length === 0;
        }
    }

    function navigateMedia(direction) {
        if (isGlobalSlideshowActive) {
            if (direction === 1) { // Next
                if (currentMediaIndex < displayedMediaFiles.length - 1) {
                    currentMediaIndex++;
                    currentMediaItem = displayedMediaFiles[currentMediaIndex];
                    displayCurrentMedia();
                } else {
                    pickAndDisplayNextGlobalMediaItem();
                }
            } else if (direction === -1) { // Previous
                if (currentMediaIndex > 0) {
                    currentMediaIndex--;
                    currentMediaItem = displayedMediaFiles[currentMediaIndex];
                    displayCurrentMedia();
                } else {
                    console.log("At the beginning of global slideshow history.");
                }
            } else if (direction === 0 && currentMediaItem) { 
                 displayCurrentMedia();
            } else if (direction === 0 && !currentMediaItem && globalMediaPoolForSelection.length > 0) { 
                 pickAndDisplayNextGlobalMediaItem();
            }
        } else { // Individual model slideshow
            if (displayedMediaFiles.length === 0 && direction === 0 && currentSelectedModelForIndividualView && originalMediaFilesForIndividualView.length > 0) {
                currentMediaIndex = 0;
                currentMediaItem = displayedMediaFiles[0]; 
                displayCurrentMedia();
                return;
            }
            if (displayedMediaFiles.length === 0) return;

            let newIndex = currentMediaIndex + direction;
            if (newIndex >= displayedMediaFiles.length) { 
                if (currentSelectedModelForIndividualView && modelRandomModeSettings[currentSelectedModelForIndividualView.name]) {
                    prepareMediaListForIndividualView(); 
                    newIndex = displayedMediaFiles.length > 0 ? 0 : -1;
                } else { 
                    newIndex = displayedMediaFiles.length - 1; 
                    if (isTimerPlaying) stopSlideshowTimer(); 
                }
            } else if (newIndex < 0) { 
                 if (currentSelectedModelForIndividualView && modelRandomModeSettings[currentSelectedModelForIndividualView.name]) {
                    prepareMediaListForIndividualView(); 
                    newIndex = displayedMediaFiles.length > 0 ? 0 : -1; 
                } else { 
                    newIndex = 0; 
                }
            }

            if (newIndex !== -1 && newIndex < displayedMediaFiles.length) { 
                currentMediaIndex = newIndex;
                currentMediaItem = displayedMediaFiles[currentMediaIndex];
                displayCurrentMedia();
            } else if (displayedMediaFiles.length > 0 && direction === 0 && currentMediaIndex !== -1 && currentMediaIndex < displayedMediaFiles.length) {
                 currentMediaItem = displayedMediaFiles[currentMediaIndex];
                 displayCurrentMedia();
            }
             else {
                 clearMediaDisplay("No media to display or index out of bounds.");
            }
        }
        updateNavButtons(); 
    }
    
    async function handleReindex() { 
        console.log("Re-index library button clicked.");
        reindexSpinner.style.display = 'block'; // Show spinner
        reindexLibraryButton.textContent = 'Re-indexing...'; reindexLibraryButton.disabled = true;
        stopSlideshowTimer(); clearMediaDisplay("Re-indexing library, please wait...");
        currentModelTitleElement.textContent = "Re-indexing...";
        try {
            const newModels = await window.electronAPI.reindexMediaLibrary();
            allModels = newModels; populateModelsListUI(); 
            currentSelectedModelForIndividualView = null; isGlobalSlideshowActive = false;
            displayedMediaFiles = []; currentMediaIndex = -1; currentMediaItem = null;
            globalMediaPoolForSelection = []; 
            clearMediaDisplay("Library re-indexed. Select a model or start global slideshow.");
            currentModelTitleElement.textContent = "Select a model or start Global Slideshow";
        } catch (error) {
            console.error("Error during re-indexing:", error);
            clearMediaDisplay("Error during re-indexing. Check console.");
            currentModelTitleElement.textContent = "Error Re-indexing";
        } finally {
            reindexSpinner.style.display = 'none'; // Hide spinner
            reindexLibraryButton.textContent = 'Re-index Library'; reindexLibraryButton.disabled = false;
            updateNavButtons();
        }
    }

    async function handleSelectMediaDirectory() {
        console.log('Select media directory button clicked.');
        try {
            const result = await window.electronAPI.setBaseMediaDirectory();
            if (result && result.status === 'success' && result.path) {
                currentMediaDirDisplay.textContent = `Current: ${result.path}`;
                enableControlsAfterDirectorySet();
                alert('Media directory changed. Please re-index for changes to apply.');
                // Automatically trigger re-index or clear current view
                allModels = [];
                globalMediaPoolForSelection = [];
                displayedMediaFiles = [];
                currentSelectedModelForIndividualView = null;
                currentMediaItem = null;
                populateModelsListUI(); // Will show "No models found" or similar
                clearMediaDisplay("Media directory changed. Please re-index.");
                currentModelTitleElement.textContent = "Select a model or start Global Slideshow";
                updateNavButtons(); 
                // Consider calling handleReindex() automatically if desired
            } else if (result && result.status === 'canceled') {
                console.log('Directory selection canceled by user.');
            } else {
                console.error('Failed to set media directory. Result:', result);
                alert('Failed to set media directory. Check console for details.');
            }
        } catch (error) {
            console.error('Error setting media directory:', error);
            alert(`Error setting media directory: ${error.message}`);
        }
    }

    // --- Initialization ---
    initialLoad(); 
    updateNavButtons(); 
});
