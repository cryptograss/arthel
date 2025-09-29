// /**
//  * Webamp Chartifacts Integration - Prototype
//  * Combines Webamp player with chartifacts solo highlighting and NFT display
//  */

import Webamp from 'webamp';
import Packery from 'packery';

class WebampChartifacts {
    constructor(containerId, trackData, options = {}) {
        console.log('DEBUG: WebampChartifacts constructor called with container:', containerId);
        console.log('DEBUG: Track data:', trackData);
        console.log('DEBUG: Options:', options);

        this.container = document.getElementById(containerId);
        this.trackData = trackData;
        this.options = options;

        if (!this.container) {
            console.error('DEBUG: Could not find container with ID:', containerId);
            return;
        }

        console.log('DEBUG: Found container, proceeding with initialization');
        this.webamp = null;
        this.currentSolo = null;
        this.timeUpdateInterval = null;
        this.currentEra = null; // Track current era for state persistence
        this.allMomentTimes = this.extractMomentTimes(); // All moments in the track
        this.upcomingMomentTimes = [...this.allMomentTimes]; // Moments that haven't fired yet
        this.flashInProgress = false; // Track if a flash effect is happening

        // Dynamic weighting system
        this.musicianWeights = {}; // Track each musician's dynamic weight
        this.recentSoloists = []; // Track recently finished soloists
        this.initializeMusicianWeights();

        // Inject dynamic styles if color scheme is provided
        this.injectDynamicStyles();

        this.init();
    }

    initializeMusicianWeights() {
        // Initialize all musicians with base weights (order they appear in ensemble)
        let baseWeight = 100;
        Object.keys(this.trackData.ensemble).forEach(musicianName => {
            this.musicianWeights[musicianName] = baseWeight;
            baseWeight += 10;
        });
    }

    injectDynamicStyles() {
        // Only inject styles if a color scheme is provided
        if (!this.trackData.colorScheme) return;

        const styleId = `webamp-chartifacts-dynamic-styles`;
        // Remove existing dynamic styles if they exist
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        const colors = this.trackData.colorScheme;
        // TODO: Implement dynamic color styling based on colors object
    }

    async init() {
        console.log('DEBUG: Starting init() for embed mode');

        // For embed mode, skip the complex UI and focus on Webamp
        if (this.options.embedMode) {
            console.log('DEBUG: In embed mode - initializing Webamp only');
            await this.initWebamp();
            this.setupTimeTracking();
        } else {
            console.log('DEBUG: In full mode - initializing full UI');
            this.renderSimpleUI();
            await this.initWebamp();
            this.setupTimeTracking();
        }
    }

    renderSimpleUI() {
        // Add parts chart (keep this in the external container)
        const partsChart = document.getElementById('parts-chart');

        // Extract song parts from timeline
        const songParts = this.extractSongParts();
        songParts.forEach((part, index) => {
            const partBox = document.createElement('div');
            partBox.id = `part-${index}`;
            partBox.className = 'part-box';
            partBox.textContent = part;
            partsChart.appendChild(partBox);
        });

        // Ensemble will be created after Webamp renders (moved to renderWhenReady)
    }


    renderSolosList() {
        return this.trackData.solos.map(solo => `
            <div class="chartifact-item" data-start="${solo.startTime}">
                <div class="chartifact-header">
                    <strong>${solo.musician}</strong> - ${solo.instrument}
                    <span class="time-range">${this.formatTime(solo.startTime)} - ${this.formatTime(solo.endTime)}</span>
                </div>
                <div class="chartifact-description">${solo.description}</div>
                <div class="chartifact-badge">Chartifact #${solo.chartifactTokenId}</div>
            </div>
        `).join('');
    }

    async initWebamp() {
        // Create Webamp instance with our track
        this.webamp = new Webamp({
            zindex: 9999,
            windowLayout: {
                main: {
                    position: { top: 0, left: 0 },
                    shadeMode: false,
                    closed: false,
                },
            },
            initialTracks: [{
                url: this.trackData.audioFile,
            }],
            enableHotkeys: true,
            volume: 75
        });

        // Render Webamp directly to the main container - no custom HTML
        console.log('DEBUG: Container before rendering:', {
            exists: !!this.container,
            id: this.container.id,
            className: this.container.className,
            children: this.container.children.length,
            style: this.container.style.cssText,
            parentExists: !!this.container.parentElement
        });

        this.webamp.renderWhenReady(this.container).then(() => {
            console.log(`DEBUG: Webamp rendered successfully in container:`, this.container.id);

            console.log('DEBUG: Container after rendering:', {
                exists: !!this.container,
                children: this.container.children.length,
                style: this.container.style.cssText,
                firstChild: this.container.firstChild ? this.container.firstChild.tagName : 'none',
                webampElement: !!document.getElementById('webamp'),
                containerInDOM: document.contains(this.container)
            });

            if (this.options.embedMode) {
                console.log('DEBUG: Embed mode - creating ensemble with simple positioning');
                // In embed mode, create ensemble in the dedicated containers
                this.createEnsembleForEmbed();
                this.setupWebampListeners();
            } else {
                console.log('DEBUG: Full mode - setting up complex positioning');
                // Wait a moment for Webamp to fully initialize before constraining
                setTimeout(() => {
                    // Move the #webamp element into our container to constrain it
                    this.constrainWebampToContainer();

                    // Wait another moment for layout to settle before creating ensemble
                    setTimeout(() => {
                        this.createEnsembleInsideWebamp();
                    }, 100);
                }, 500);  // Give Webamp time to set up its dimensions

                // Set up event listeners for Webamp
                this.setupWebampListeners();
            }
        }).catch(error => {
            console.error('DEBUG: Webamp initialization failed:', error);
            // Don't alert in embed mode - just log the error
            if (!this.options.embedMode) {
                alert(error.message);
            } else {
                console.error('Webamp failed to initialize in embed mode:', error.message);
            }
        });

    }

    createEnsembleForEmbed() {
        console.log('DEBUG: Creating ensemble for embed mode');

        // Use the existing dedicated containers in the embed template
        const ensembleContainer = document.getElementById('ensemble-display');
        const partsContainer = document.getElementById('parts-chart');

        if (!ensembleContainer || !partsContainer) {
            console.error('DEBUG: Missing ensemble or parts containers for embed mode');
            return;
        }

        // Create ensemble display
        this.populateEnsembleContainer(ensembleContainer);

        // Create parts chart
        this.populatePartsContainer(partsContainer);

        console.log('DEBUG: Embed ensemble and parts created successfully');
    }

    populateEnsembleContainer(container) {
        // Clear existing content
        container.innerHTML = '';

        // Create musician cards for each ensemble member
        Object.entries(this.trackData.ensemble).forEach(([musicianName, instruments]) => {
            const musicianDiv = document.createElement('div');
            musicianDiv.id = `musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`;
            musicianDiv.className = 'musician-item musician-card';
            musicianDiv.dataset.musician = musicianName;

            const primaryInstrument = Array.isArray(instruments) ? instruments[0] : instruments;

            musicianDiv.innerHTML = `
                <div class="musician-name">${musicianName} (${primaryInstrument})</div>
                <div class="chartifact-line">Chartifact "0x1234ff" owned by cryptograss.eth</div>
            `;

            container.appendChild(musicianDiv);
        });

        // Make musician names clickable if the function exists (embed mode)
        if (typeof makeMusiciansClickable === 'function') {
            makeMusiciansClickable();
        }
    }

    populatePartsContainer(container) {
        // Clear existing content
        container.innerHTML = '';

        // Extract song parts from timeline
        const songParts = this.extractSongParts();
        songParts.forEach((part, index) => {
            const partBox = document.createElement('div');
            partBox.id = `part-${index}`;
            partBox.className = 'part-box';
            partBox.textContent = part;
            container.appendChild(partBox);
        });
    }

    constrainWebampToContainer() {
        const webampElement = document.getElementById('webamp');
        console.log('DEBUG: constrainWebampToContainer - webamp element:', {
            exists: !!webampElement,
            parentBefore: webampElement ? webampElement.parentElement.tagName + '#' + webampElement.parentElement.id : 'none',
            containerExists: !!this.container,
            containerInDOM: this.container ? document.contains(this.container) : false
        });

        if (!webampElement) {
            console.error('Could not find #webamp element to constrain');
            return;
        }

        // Move the #webamp element into our container
        console.log('DEBUG: Moving webamp element into container...');
        this.container.appendChild(webampElement);

        // Ensure Webamp is visible
        webampElement.style.display = 'block';
        webampElement.style.visibility = 'visible';
        webampElement.style.opacity = '1';

        console.log('DEBUG: After moving webamp:', {
            webampParent: webampElement.parentElement.tagName + '#' + webampElement.parentElement.id,
            containerChildren: this.container.children.length,
            webampRect: webampElement.getBoundingClientRect(),
            webampStyle: webampElement.style.cssText,
            webampVisible: webampElement.offsetHeight > 0 && webampElement.offsetWidth > 0
        });

        // Set the container to relative positioning so Webamp can position within it
        this.container.style.position = 'relative';

        console.log('Webamp constrained to container');
    }

    createEnsembleInsideWebamp() {
        console.log('DEBUG: createEnsembleInsideWebamp called');

        // Wait for #main-window to exist
        const waitForMainWindow = () => {
            const mainWindow = document.querySelector('#main-window');
            if (mainWindow) {
                console.log('DEBUG: Found #main-window, creating ensemble after it');
                this.createEnsembleAfterMainWindow(mainWindow);
            } else {
                console.log('DEBUG: #main-window not found yet, waiting...');
                setTimeout(waitForMainWindow, 100);
            }
        };

        waitForMainWindow();
    }

    createEnsembleAfterMainWindow(mainWindow) {
        // Debug Webamp positioning - especially the parent with transform
        const webampContainer = document.getElementById('webamp');
        const mainWindowParent = mainWindow.parentElement;

        console.log('DEBUG: Webamp positioning analysis:', {
            webampContainer: {
                exists: !!webampContainer,
                style: webampContainer ? webampContainer.style.cssText : 'N/A',
                boundingRect: webampContainer ? webampContainer.getBoundingClientRect() : 'N/A'
            },
            mainWindowParent: {
                tagName: mainWindowParent.tagName,
                className: mainWindowParent.className,
                style: mainWindowParent.style.cssText,
                transform: mainWindowParent.style.transform,
                boundingRect: mainWindowParent.getBoundingClientRect()
            },
            mainWindow: {
                id: mainWindow.id,
                style: mainWindow.style.cssText,
                boundingRect: mainWindow.getBoundingClientRect()
            }
        });

        // Try to intercept and override the transform
        if (mainWindowParent.style.transform) {
            console.log('DEBUG: Found transform on parent:', mainWindowParent.style.transform);
            console.log('DEBUG: Attempting to override transform...');

            // Override the transform to position at top-left
            mainWindowParent.style.transform = 'translate(10px, 10px)';
            console.log('DEBUG: Override applied, new transform:', mainWindowParent.style.transform);
        }

        // Create ensemble display
        const ensembleDiv = document.createElement('div');
        ensembleDiv.id = 'ensemble-display-in-webamp';
        ensembleDiv.className = 'ensemble-display-in-webamp';

        // Position ensemble below main window and parts chart
        ensembleDiv.style.position = 'absolute';
        ensembleDiv.style.left = '0px';
        ensembleDiv.style.top = '130px'; // Below main window (120px height + 10px gap)
        ensembleDiv.style.width = '400px';
        // Remove margin since we're using absolute positioning
        // ensembleDiv.style.margin = '10px';

        // Create Packery grid for smooth repositioning
        const ensembleGrid = document.createElement('div');
        ensembleGrid.className = 'ensemble-grid';

        Object.entries(this.trackData.ensemble).forEach(([musicianName, instruments]) => {
            const musicianDiv = document.createElement('div');
            musicianDiv.id = `musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`;
            musicianDiv.className = 'musician-item musician-card';
            musicianDiv.dataset.musician = musicianName;
            musicianDiv.dataset.sortOrder = '100'; // Default sort order

            // Handle instrument display - instruments is an array in YAML
            const primaryInstrument = Array.isArray(instruments) ? instruments[0] : instruments;
            console.log(`DEBUG: Creating musician card for ${musicianName}, instruments:`, instruments, 'primary:', primaryInstrument);

            musicianDiv.innerHTML = `
                <div class="musician-name">${musicianName} (${primaryInstrument})</div>
                <div class="chartifact-line">Chartifact "0x1234ff" owned by cryptograss.eth</div>
            `;
            ensembleGrid.appendChild(musicianDiv);
        });

        ensembleDiv.appendChild(ensembleGrid);

        // Also grab the parts chart and move it in as a sibling
        const partsChart = document.getElementById('parts-chart');

        if (partsChart) {
            // Create a container div to hold parts chart positioned to the right
            const partsContainer = document.createElement('div');
            partsContainer.id = 'parts-chart-in-webamp';
            partsContainer.style.position = 'absolute';
            partsContainer.style.left = '285px'; // Just to the right of main window (275px wide + 10px gap)
            partsContainer.style.top = '0px';
            partsContainer.style.width = '120px';

            // Move the parts chart content into our container
            partsContainer.appendChild(partsChart);

            // Insert the parts container as a sibling of main-window
            mainWindow.parentNode.appendChild(partsContainer);
            console.log('DEBUG: Moved parts chart to be sibling of main-window');
        }

        // Insert ensemble right after #main-window (or after parts if it exists)
        const insertionPoint = partsChart ? partsChart.parentNode : mainWindow.nextSibling;
        if (insertionPoint && insertionPoint !== mainWindow.parentNode) {
            mainWindow.parentNode.insertBefore(ensembleDiv, insertionPoint);
            console.log('DEBUG: Inserted ensemble before:', insertionPoint);
        } else {
            mainWindow.parentNode.appendChild(ensembleDiv);
            console.log('DEBUG: Appended ensemble as last child');
        }

        // Debug where the ensemble actually ended up
        setTimeout(() => {
            console.log('DEBUG: Final ensemble position:', {
                ensembleRect: ensembleDiv.getBoundingClientRect(),
                ensembleParent: ensembleDiv.parentElement.tagName + (ensembleDiv.parentElement.id ? '#' + ensembleDiv.parentElement.id : ''),
                mainWindowRect: mainWindow.getBoundingClientRect(),
                relativePosition: {
                    x: ensembleDiv.getBoundingClientRect().left - mainWindow.getBoundingClientRect().left,
                    y: ensembleDiv.getBoundingClientRect().top - mainWindow.getBoundingClientRect().top
                }
            });
        }, 100);

        // Watch for Webamp positioning changes and intercept them
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    // Check if this is the parent element with transform
                    if (mutation.target === mainWindowParent &&
                        mutation.target.style.transform &&
                        !mutation.target.style.transform.includes('translate(10px, 10px)')) {

                        console.log('DEBUG: Webamp trying to move parent! Old transform:', mutation.target.style.transform);
                        // Override it back to our position
                        mutation.target.style.transform = 'translate(10px, 10px)';
                        console.log('DEBUG: Blocked Webamp transform, keeping at translate(10px, 10px)');
                    }

                    // Also log window changes
                    if (mutation.target.classList.contains('window')) {
                        console.log('DEBUG: Webamp window style changed:', {
                            target: mutation.target.id,
                            style: mutation.target.style.cssText
                        });
                    }
                }
            });
        });

        // Watch the main window
        observer.observe(mainWindow, {
            attributes: true,
            attributeFilter: ['style']
        });

        // Most importantly, watch the parent element for transform changes
        observer.observe(mainWindowParent, {
            attributes: true,
            attributeFilter: ['style']
        });

        // Also watch for other Webamp windows that might appear
        if (webampContainer) {
            const allWindows = webampContainer.querySelectorAll('.window');
            allWindows.forEach(window => {
                observer.observe(window, {
                    attributes: true,
                    attributeFilter: ['style']
                });
            });
        }

        // Initialize Packery for smooth repositioning
        this.initEnsembleGrid(ensembleGrid);

        console.log('DEBUG: Ensemble display created after #main-window');
    }

    setupWebampListeners() {
        // Listen for play/pause events
        this.webamp.onWillClose(() => {
            console.log('Webamp closing');
            this.cleanup();
        });

        // Access Webamp's Redux store to monitor playback state
        const unsubscribe = this.webamp.store.subscribe(() => {
            const state = this.webamp.store.getState();
            const { timeElapsed, status } = state.media;

            if (status === 'PLAYING') {
                if (!this.timeUpdateInterval) {
                    this.startTimeTracking();
                }
            } else {
                this.stopTimeTracking();
                // Reset ensemble display when not playing
                this.resetEnsembleDisplay();
            }
        });

        this.unsubscribeWebamp = unsubscribe;
    }

    setupTimeTracking() {
        // Simple time tracking for status updates
        console.log('Webamp ready for interaction');
    }

    startTimeTracking() {
        this.timeUpdateInterval = setInterval(() => {
            if (this.webamp && this.webamp.store) {
                const state = this.webamp.store.getState();
                const timeElapsed = state.media.timeElapsed;

                if (timeElapsed !== undefined) {
                    this.updateStatusDisplay(timeElapsed);
                }
                else {
                    // What here?  Throw an error?
                    console.error("Time wasn't defined.  Weird.")
                }
            }
        }, 100); // Update every 100ms for smooth updates
    }

    updateStatusDisplay(currentTime) {
        this.updateEnsembleDisplay(currentTime);
    }

    extractMomentTimes() {
        // Find all timeline entries that have moment-worthy musician changes
        const momentTimes = [];
        Object.entries(this.trackData.timeline).forEach(([timeStr, arrangement]) => {
            const time = Number(timeStr);

            // New musicians system - check for band-in or individual musician changes
            if (arrangement.musicians && time > 0) { // Exclude time 0
                const musicians = arrangement.musicians;

                // Check if band-in shortcut is used
                if (musicians.band === "in" || musicians.band === "out") {
                    momentTimes.push(time);
                } else {
                    // Check if any individual musicians are changing
                    const hasMusiciansChanging = Object.values(musicians).some(status => status === "in" || status === "out");
                    if (hasMusiciansChanging) {
                        momentTimes.push(time);
                    }
                }
            }

            // Legacy support for old "band-in" detail system
            if (arrangement.detail === "band-in" && time > 0) { // Exclude time 0
                momentTimes.push(time);
            }
        });
        return momentTimes.sort((a, b) => a - b);
    }

    extractSongParts() {
        // Build chronological sequence of parts from PROCESSED timeline
        const partSequence = [];
        const processedTimeline = this.processTimelineKeys();

        const timelineEntries = Object.entries(processedTimeline)
            .map(([timeStr, arrangement]) => ({ time: Number(timeStr), arrangement }))
            .sort((a, b) => a.time - b.time);

        console.log('extractSongParts - processed timeline entries:', timelineEntries);

        timelineEntries.forEach(({ arrangement }) => {
            if (arrangement.part) {
                partSequence.push(arrangement.part);
            }
        });

        console.log('extractSongParts - final part sequence:', partSequence);
        return partSequence;
    }

    updatePartsChart(arrangement) {
        const currentPart = arrangement ? arrangement.part : null;
        const currentPartIndex = this.getCurrentPartIndex();
        const songParts = this.extractSongParts();

        songParts.forEach((part, index) => {
            const partBox = document.getElementById(`part-${index}`);
            if (!partBox) return;

            const isActivePartIndex = index === currentPartIndex;

            if (isActivePartIndex) {
                partBox.classList.add('active');
            } else {
                partBox.classList.remove('active');
            }
        });
    }

    getCurrentPartIndex() {
        // Find the most recent part change in chronological order using PROCESSED timeline
        const currentTime = this.getCurrentTime();
        const processedTimeline = this.processTimelineKeys();

        const timelineEntries = Object.entries(processedTimeline)
            .map(([timeStr, arrangement]) => ({ time: Number(timeStr), arrangement }))
            .filter(({ arrangement }) => arrangement.part) // Only entries with parts
            .sort((a, b) => a.time - b.time);

        console.log('getCurrentPartIndex - timeline entries with parts:', timelineEntries);

        // Find the last part change that has occurred
        let activePartIndex = -1;
        timelineEntries.forEach(({ time, arrangement }, chronologicalIndex) => {
            if (time <= currentTime) {
                activePartIndex = chronologicalIndex;
                console.log(`Part index ${chronologicalIndex} (${arrangement.part}) active at time ${time}`);
            }
        });

        console.log(`Final active part index: ${activePartIndex}`);
        return activePartIndex;
    }

    calculateDynamicWeight(musicianName, currentTime, arrangement) {
        const baseWeight = this.musicianWeights[musicianName];
        const features = arrangement ? arrangement.feature : null;
        const musicianScene = features ? features[musicianName] : null;

        // Active featured musicians get priority based on their scene
        if (musicianScene) {
            switch (musicianScene) {
                case 'lead':
                    return 1; // Lead musicians always at top
                case 'pickup':
                    return this.calculatePickupWeight(musicianName, currentTime);
                case 'cooldown':
                    return 5; // Cooldown gets moderate priority
                case 'harmony':
                    return 7; // Harmony gets lower priority
                case 'rhythm':
                    return 8; // Rhythm gets even lower
                default:
                    return 6; // Unknown scenes get middle priority
            }
        }

        // Legacy support: check for old soloist/type structure
        const currentSoloist = arrangement ? arrangement.soloist : null;
        const leadType = arrangement ? arrangement.type : null;

        if (currentSoloist === musicianName) {
            if (leadType === 'solo') {
                return 1;
            } else if (leadType === 'pick up') {
                return this.calculatePickupWeight(musicianName, currentTime);
            } else if (leadType === 'intro') {
                return 3;
            }
        }

        // Recently finished featured musicians stay near the top
        const recentSoloistIndex = this.recentSoloists.indexOf(musicianName);
        if (recentSoloistIndex !== -1) {
            return 10 + recentSoloistIndex; // Second priority, stacked by recency
        }

        // Everyone else gets their base weight, pushed down by recent featured musicians
        return baseWeight + this.recentSoloists.length * 5;
    }

    calculatePickupWeight(musicianName, currentTime) {
        // Find the start of this pickup using processed timeline
        const processedTimeline = this.processTimelineKeys();
        const timelineEntries = Object.entries(processedTimeline)
            .map(([timeStr, arr]) => ({ time: Number(timeStr), arrangement: arr }))
            .sort((a, b) => b.time - a.time);

        const pickupStart = timelineEntries.find(entry =>
            entry.time <= currentTime &&
            entry.arrangement.soloist === musicianName &&
            entry.arrangement.type === 'pick up'
        );

        if (!pickupStart) return 5;

        // Calculate how far into the pickup we are
        const pickupDuration = currentTime - pickupStart.time;
        const maxPickupTime = 5; // Assume pickups last ~5 seconds max
        const progressRatio = Math.min(pickupDuration / maxPickupTime, 1);

        // Gradually approach weight 2 during pickup (between solo=1 and intro=3)
        return 5 - (progressRatio * 3); // 5 -> 2 over pickup duration
    }

    updateMusicianCard(musicianDiv, musicianName, instrument, classes = [], showStar = false) {
        // Check if this update is actually necessary
        const newClassString = ['musician-item', 'musician-card', ...classes].sort().join(' ');
        const currentClassString = Array.from(musicianDiv.classList).sort().join(' ');

        // Also check if instrument display needs updating
        const nameDiv = musicianDiv.querySelector('.musician-name');
        const expectedName = `${musicianName} (${instrument})`;
        const currentName = nameDiv ? nameDiv.textContent : '';

        // Skip update if nothing changed
        if (newClassString === currentClassString && expectedName === currentName) {
            return;
        }

        // Log excessive updates for debugging
        if (!this.updateCounts) this.updateCounts = {};
        if (!this.updateCounts[musicianName]) this.updateCounts[musicianName] = 0;
        this.updateCounts[musicianName]++;

        if (this.updateCounts[musicianName] % 20 === 0) {
            console.log(`DEBUG: ${musicianName} updated ${this.updateCounts[musicianName]} times - classes: ${newClassString}, name: ${expectedName}`);
        }

        // Clear all state classes but keep base classes
        musicianDiv.className = 'musician-item musician-card';

        // Add any state classes
        classes.forEach(cls => musicianDiv.classList.add(cls));

        // Update name if it changed
        if (nameDiv && expectedName !== currentName) {
            nameDiv.textContent = expectedName;
        }

        // Calculate dynamic weight for this musician
        const currentTime = this.getCurrentTime();
        const arrangement = this.getCurrentArrangement(currentTime);
        const dynamicWeight = this.calculateDynamicWeight(musicianName, currentTime, arrangement);

        // Debug logging for troublesome musicians
        if (musicianName === 'Cory Walker' && classes.includes('pickup')) {
            console.log(`Cory pickup weight: ${dynamicWeight}, time: ${currentTime}, arrangement:`, arrangement);
        }

        musicianDiv.dataset.sortOrder = dynamicWeight;

        // Update content
        const starPrefix = showStar ? '⭐ ' : '';
        musicianDiv.innerHTML = `
            <div class="musician-name">${starPrefix}${musicianName} (${instrument})</div>
            <div class="chartifact-line">Chartifact "0x1234ff" owned by cryptograss.eth</div>
        `;
    }

    initEnsembleGrid(gridElement) {
        // Initialize Packery for ensemble (better for smooth repositioning)
        this.packery = new Packery(gridElement, {
            itemSelector: '.musician-item',
            columnWidth: gridElement.offsetWidth,  // Use actual grid width
            gutter: 2,            // Small gap between items (matches CSS)
            transitionDuration: '0.4s'
        });
    }


    addRecentSoloist(musicianName) {
        // Add to front of recent soloists list
        this.recentSoloists = this.recentSoloists.filter(name => name !== musicianName); // Remove if already present
        this.recentSoloists.unshift(musicianName); // Add to front

        // Keep only the 3 most recent soloists
        this.recentSoloists = this.recentSoloists.slice(0, 3);
    }

    sortEnsemble() {
        // Use Packery's reordering approach
        if (this.packery) {
            // Get all musician items and sort them by weight
            const items = Array.from(this.packery.element.children);
            const sortedItems = items.sort((a, b) => {
                const weightA = parseInt(a.dataset.sortOrder || '999');
                const weightB = parseInt(b.dataset.sortOrder || '999');
                return weightA - weightB;
            });

            console.log('Sorting ensemble - weights:',
                sortedItems.map(el => `${el.dataset.musician}: ${el.dataset.sortOrder}`)
            );

            // Reorder DOM elements (Packery will animate automatically)
            sortedItems.forEach(item => {
                this.packery.element.appendChild(item);
            });

            // Trigger Packery layout update
            this.packery.layout();
        }
    }

    getCurrentArrangement(currentTime) {
        // Convert section-based keys to actual times
        const processedTimeline = this.processTimelineKeys();
        const startTimes = Object.keys(processedTimeline).map(Number).sort((a, b) => b - a);
        const currentStartTime = startTimes.find(time => time <= currentTime);
        return processedTimeline[currentStartTime];
    }

    processTimelineKeys() {
        if (this._processedTimeline) {
            return this._processedTimeline;
        }

        console.log('Processing timeline keys. Raw timeline:', this.trackData.timeline);
        console.log('Standard section length:', this.trackData.standardSectionLength);

        if (!this.trackData.standardSectionLength) {
            // No section processing needed, just return the timeline as-is
            this._processedTimeline = this.trackData.timeline;
            return this._processedTimeline;
        }

        const processed = {};
        let accumulatedTime = 0;

        // Process in the order: 0, section1, section2, section3, section4, section5, then exact times
        // Start with time 0
        if (this.trackData.timeline['0']) {
            processed[0] = this.trackData.timeline['0'];
            console.log(`Exact time 0 -> time 0:`, this.trackData.timeline['0']);
        }

        // Process sections in order
        for (let i = 1; i <= 20; i++) { // Assume max 20 sections
            const sectionKey = `section${i}`;
            if (this.trackData.timeline[sectionKey]) {
                accumulatedTime += this.trackData.standardSectionLength;
                processed[accumulatedTime] = this.trackData.timeline[sectionKey];
                console.log(`Section ${sectionKey} -> time ${accumulatedTime}:`, this.trackData.timeline[sectionKey]);
            }
        }

        // Process exact time keys (skip 0 since we already did it)
        Object.entries(this.trackData.timeline).forEach(([key, value]) => {
            if (!key.startsWith('section') && key !== '0') {
                const exactTime = parseFloat(key);
                processed[exactTime] = value;
                console.log(`Exact time ${key} -> time ${exactTime}:`, value);
            }
        });

        console.log('Final processed timeline:', processed);
        this._processedTimeline = processed;
        return processed;
    }

    getCurrentInstruments(currentTime) {
        const arrangement = this.getCurrentArrangement(currentTime);
        const instruments = {};

        // Start with default instruments
        Object.entries(this.trackData.ensemble).forEach(([musician, musicianInstruments]) => {
            const primaryInstrument = Array.isArray(musicianInstruments) ? musicianInstruments[0] : musicianInstruments;
            instruments[musician] = primaryInstrument;
        });

        // Apply any instrument changes for current timeline segment
        if (arrangement && arrangement.instrumentChanges) {
            Object.entries(arrangement.instrumentChanges).forEach(([musician, instrument]) => {
                instruments[musician] = instrument;
            });
        }

        return instruments;
    }

    updateEnsembleDisplay(currentTime) {
        ////
        /// This is the big thing that happens every 100ms
        ////

        // Throttle logging to avoid spam but catch runaway issues
        if (!this.lastLogTime || Date.now() - this.lastLogTime > 2000) {
            console.log(`DEBUG updateEnsembleDisplay: Running at time=${currentTime}`);
            this.lastLogTime = Date.now();
        }

        const arrangement = this.getCurrentArrangement(currentTime);
        const currentInstruments = this.getCurrentInstruments(currentTime);
        const currentSoloist = arrangement ? arrangement.soloist : null;

        // Log major changes (only when arrangement actually changes)
        if (arrangement !== this.currentEra) {
            console.log(`Time ${currentTime}: NEW arrangement =`, arrangement);
        }

        // Track soloist changes for animation and weight updates
        const soloistChanged = this.currentSoloist !== currentSoloist;
        const previousSoloist = this.currentSoloist;

        // When a soloist finishes, add them to recent soloists list
        if (previousSoloist && currentSoloist !== previousSoloist && this.currentEra && this.currentEra.type === 'solo') {
            this.addRecentSoloist(previousSoloist);
        }

        this.currentSoloist = currentSoloist;

        // Handle moments (one-time triggers)
        this.checkForMoments(currentTime);

        // Track current era for state persistence
        if (arrangement !== this.currentEra) {
            this.currentEra = arrangement;
        }

        // Update parts chart
        this.updatePartsChart(arrangement);

        // Skip normal ensemble updates during flash effects
        if (this.flashInProgress) {
            return;
        }

        // Capture card positions BEFORE any DOM changes for animation
        let oldPositions = null;
        if (soloistChanged) {
            const ensembleContainer = document.getElementById('ensemble-display').querySelector('div');
            if (ensembleContainer) {
                const cards = Array.from(ensembleContainer.querySelectorAll('.musician-card'));
                oldPositions = new Map();
                cards.forEach(card => {
                    const rect = card.getBoundingClientRect();
                    oldPositions.set(card, { x: rect.left, y: rect.top });
                });
            }
        }

        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
            if (!musicianDiv) return;

            const instrument = currentInstruments[musicianName];

            // Handle new feature system or legacy soloist/type
            const features = arrangement ? arrangement.feature : null;
            const musicianScene = features ? features[musicianName] : null;

            if (musicianScene) {
                // New feature system
                const classes = [musicianScene]; // Use scene as CSS class
                const showStar = musicianScene === 'lead';
                this.updateMusicianCard(musicianDiv, musicianName, instrument, classes, showStar);
            } else if (currentSoloist === musicianName) {
                // Legacy soloist/type system
                const leadType = arrangement ? arrangement.type : null;

                if (leadType === 'solo') {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['solo'], true);
                } else if (leadType === 'pick up') {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['pickup']);
                } else {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['intro']);
                }
            } else {
                // Not featured - check if we need to gray out during intro
                const leadType = arrangement ? arrangement.type : null;
                const isIntroScene = currentSoloist && leadType === 'intro';

                if (isIntroScene) {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['grayed']);
                } else {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, []);
                }
            }
        });

        // Trigger Packery reordering for various conditions
        const shouldResort = soloistChanged ||
                           (currentSoloist && arrangement && arrangement.type === 'pick up'); // Resort during pickups for gradual movement

        if (shouldResort) {
            this.sortEnsemble();
        }
    }

    flashEntireEnsemble() {
        // Set flash in progress to prevent normal updates from interfering
        this.flashInProgress = true;

        // Flash each musician individually with golden highlight
        Object.entries(this.trackData.ensemble).forEach(([musicianName]) => {
            const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
            if (!musicianDiv) return;

            // Apply flash class
            musicianDiv.classList.add('flash');
        });

        // Fade back to normal after 1.5 seconds
        setTimeout(() => {
            // Remove flash class from all musicians
            Object.entries(this.trackData.ensemble).forEach(([musicianName]) => {
                const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
                if (!musicianDiv) return;
                musicianDiv.classList.remove('flash');
            });

            // Reset flash effect, let normal updates resume
            this.flashInProgress = false;
        }, 300);
    }

    flashSpecificMusician(musicianName) {
        const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
        if (!musicianDiv) return;

        console.log(`Flashing specific musician: ${musicianName}`);

        // Apply flash class
        musicianDiv.classList.add('flash');

        // Remove flash class after brief flash
        setTimeout(() => {
            musicianDiv.classList.remove('flash');
        }, 300);
    }

    checkForMoments(currentTime) {
        // Sort all upcoming moments into three buckets
        const momentsNotYetReached = [];
        const momentsToTrigger = [];
        const momentsMissedAndNeedCulling = [];

        this.upcomingMomentTimes.forEach(momentTime => {
            const secondsSinceMoment = currentTime - momentTime;

            if (secondsSinceMoment < 0) {
                // Future moment
                momentsNotYetReached.push(momentTime);
            } else if (secondsSinceMoment <= 1) {
                // Recent enough to trigger
                momentsToTrigger.push(momentTime);
            } else {
                // Too old, cull it
                momentsMissedAndNeedCulling.push(momentTime);
            }
        });

        // Trigger the ready moments
        momentsToTrigger.forEach(momentTime => {
            this.triggerMoment(momentTime);
        });

        // Update upcoming list to only include future moments
        this.upcomingMomentTimes = momentsNotYetReached;
    }

    triggerMoment(momentTime) {
        const arrangement = this.trackData.timeline[momentTime];
        if (!arrangement) return;

        console.log(`Triggering moment at ${momentTime}:`, arrangement);

        // New musicians system
        if (arrangement.musicians) {
            const musicians = arrangement.musicians;

            // Handle "band" shortcut
            if (musicians.band === "in") {
                this.flashEntireEnsemble();
            } else if (musicians.band === "out") {
                this.flashEntireEnsemble(); // Could be a different effect for "out"
            } else {
                // Handle individual musician changes
                Object.entries(musicians).forEach(([musicianName, status]) => {
                    if (status === "in") {
                        this.flashSpecificMusician(musicianName);
                    } else if (status === "out") {
                        this.flashSpecificMusician(musicianName); // Could be different effect
                    }
                });
            }
        }

        // Legacy support: Handle different moment types
        if (arrangement.detail === "band-in") {
            this.flashEntireEnsemble();
        }
    }

    // Remove showPickupEffect since pickup is now an era, not a moment

    getCurrentTime() {
        if (this.webamp && this.webamp.store) {
            const state = this.webamp.store.getState();
            return state.media.timeElapsed || 0;
        }
        return 0;
    }

    stopTimeTracking() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    updateCurrentSolo(currentTime) {
        const currentSolo = this.trackData.solos.find(solo =>
            currentTime >= solo.startTime && currentTime <= solo.endTime
        );

        if (currentSolo !== this.currentSolo) {
            this.currentSolo = currentSolo;
            this.displayCurrentSolo();
            this.highlightTimelineMarker();
        }
    }

    // displayCurrentSolo() {
    //     const currentSoloDiv = document.getElementById('currentSolo');
    //     const chartDisplay = document.getElementById('chartDisplay');

    //     if (this.currentSolo) {
    //         currentSoloDiv.innerHTML = `
    //             <div class="solo-info active-solo">
    //                 <div class="solo-musician">🎵 ${this.currentSolo.musician}</div>
    //                 <div class="solo-details">${this.currentSolo.instrument} • ${this.currentSolo.description}</div>
    //             </div>
    //         `;

    //         // Show chart if available
    //         if (this.currentSolo.chartImage) {
    //             document.getElementById('chartImage').src = this.currentSolo.chartImage;
    //             document.getElementById('tokenId').textContent = this.currentSolo.chartifactTokenId;
    //             chartDisplay.style.display = 'block';

    //             // Load NFT ownership (mock for now)
    //             this.loadChartifactOwnership(this.currentSolo.chartifactTokenId);
    //         }
    //     } else {
    //         currentSoloDiv.innerHTML = `
    //             <div class="solo-info">
    //                 <div class="solo-musician">Track playing...</div>
    //                 <div class="solo-details">Background accompaniment</div>
    //             </div>
    //         `;
    //         chartDisplay.style.display = 'none';
    //     }
    // }

    highlightTimelineMarker() {
        // Remove previous highlighting
        document.querySelectorAll('.timeline-marker').forEach(marker => {
            marker.classList.remove('active');
        });

        // Add highlighting to current solo marker
        if (this.currentSolo) {
            const activeMarker = document.querySelector(`[data-musician="${this.currentSolo.musician}"][data-instrument="${this.currentSolo.instrument}"]`);
            if (activeMarker) {
                activeMarker.classList.add('active');
            }
        }
    }

    seekTo(timeSeconds) {
        if (this.webamp && this.webamp.store) {
            // Use Webamp's action to seek
            const timeMs = timeSeconds * 1000;
            this.webamp.store.dispatch({
                type: 'SEEK_TO_PERCENT_COMPLETE',
                percent: (timeSeconds / this.trackData.duration) * 100
            });
        }
    }

    async loadChartifactOwnership(tokenId) {
        // Mock ownership data - in production this would query the blockchain
        const mockOwners = {
            100: "0x1234...5678",
            101: "0xabcd...ef01",
            102: "0x9876...5432",
            103: "0xdef0...1234"
        };

        const ownerAddress = mockOwners[tokenId] || "Unclaimed";
        document.getElementById('ownerAddress').textContent = ownerAddress;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    resetEnsembleDisplay() {
        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianInstruments]) => {
            const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
            if (!musicianDiv) return;

            // Use helper function to reset to default state
            const primaryInstrument = Array.isArray(musicianInstruments) ? musicianInstruments[0] : musicianInstruments;
            this.updateMusicianCard(musicianDiv, musicianName, primaryInstrument);
        });
    }

    loadNewSong(newTrackData) {
        console.log('DEBUG: Loading new song:', newTrackData.title);

        // Stop current tracking
        this.stopTimeTracking();

        // Update track data
        this.trackData = newTrackData;

        // Reset state
        this.currentSolo = null;
        this.currentEra = null;
        this.allMomentTimes = this.extractMomentTimes();
        this.upcomingMomentTimes = [...this.allMomentTimes];
        this.initializeMusicianWeights();

        // Update Webamp with new track
        if (this.webamp && this.webamp.getMediaStatus) {
            // Stop current playback
            this.webamp.stop();

            // Load new track
            this.webamp.setTracksToPlay([{
                url: newTrackData.audioFile,
                defaultName: newTrackData.title
            }]);
        }

        // Update ensemble display
        if (this.options.embedMode) {
            this.createEnsembleForEmbed();
        } else {
            // For full mode, recreate the ensemble
            const ensembleContainer = document.getElementById('ensemble-display-in-webamp');
            if (ensembleContainer) {
                ensembleContainer.remove();
            }
            setTimeout(() => {
                this.createEnsembleInsideWebamp();
            }, 100);
        }

        // Restart time tracking
        this.setupTimeTracking();

        console.log('DEBUG: New song loaded successfully');
    }

    cleanup() {
        this.stopTimeTracking();
        if (this.unsubscribeWebamp) {
            this.unsubscribeWebamp();
        }
    }
}

// Export for use in pages
window.WebampChartifacts = WebampChartifacts;