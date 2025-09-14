// /**
//  * Webamp Chartifacts Integration - Prototype
//  * Combines Webamp player with chartifacts solo highlighting and NFT display
//  */

import Webamp from 'webamp';

class WebampChartifacts {
    constructor(containerId, trackData) {
        this.container = document.getElementById(containerId);
        this.trackData = trackData;
        this.webamp = null;
        this.currentSolo = null;
        this.timeUpdateInterval = null;
        this.currentEra = null; // Track current era for state persistence
        this.allMomentTimes = this.extractMomentTimes(); // All moments in the track
        this.upcomingMomentTimes = [...this.allMomentTimes]; // Moments that haven't fired yet
        this.flashInProgress = false; // Track if a flash effect is happening

        // Inject dynamic styles if color scheme is provided
        this.injectDynamicStyles();

        this.init();
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

        const colors = this.trackData.colorScheme;    }

    async init() {
        this.renderSimpleUI();
        await this.initWebamp();
        this.setupTimeTracking();
    }

    renderSimpleUI() {
        // Add ensemble display alongside Webamp
        const ensembleDiv = document.getElementById('ensemble-display');
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

        // Create ensemble list
        const ensembleList = document.createElement('div');
        ensembleList.style.display = 'flex';
        ensembleList.style.flexDirection = 'column';

        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            const musicianDiv = document.createElement('div');
            musicianDiv.id = `musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`;
            musicianDiv.className = 'musician-card';
            musicianDiv.innerHTML = `
                <div class="musician-name">${musicianName} (${musicianData.defaultInstrument})</div>
                <div class="chartifact-line">Chartifact "0x1234ff" owned by cryptograss.eth</div>
            `;
            ensembleList.appendChild(musicianDiv);
        });

        ensembleDiv.appendChild(ensembleList);
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
        this.webamp.renderWhenReady(this.container).then(() => {
            console.log(`rendered webamp in ${this.container}`);
            // Set up event listeners for Webamp
            this.setupWebampListeners();
        }).catch(error => {
            alert(error.message)
        });

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
        // Find all timeline entries that have moment-worthy details
        const momentTimes = [];
        Object.entries(this.trackData.timeline).forEach(([timeStr, arrangement]) => {
            const time = Number(timeStr);
            if (arrangement.detail === "band-in" && time > 0) { // Exclude time 0
                momentTimes.push(time);
            }
            // Add other moment types here as needed
        });
        return momentTimes.sort((a, b) => a - b);
    }

    extractSongParts() {
        // Build chronological sequence of parts from timeline
        const partSequence = [];
        const timelineEntries = Object.entries(this.trackData.timeline)
            .map(([timeStr, arrangement]) => ({ time: Number(timeStr), arrangement }))
            .sort((a, b) => a.time - b.time);

        timelineEntries.forEach(({ arrangement }) => {
            if (arrangement.part) {
                partSequence.push(arrangement.part);
            }
        });

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
        // Find the most recent part change in chronological order
        const currentTime = this.getCurrentTime();
        const timelineEntries = Object.entries(this.trackData.timeline)
            .map(([timeStr, arrangement]) => ({ time: Number(timeStr), arrangement }))
            .filter(({ arrangement }) => arrangement.part) // Only entries with parts
            .sort((a, b) => a.time - b.time);

        // Find the last part change that has occurred
        let activePartIndex = -1;
        timelineEntries.forEach(({ time, arrangement }, chronologicalIndex) => {
            if (time <= currentTime) {
                activePartIndex = chronologicalIndex;
            }
        });

        return activePartIndex;
    }

    updateMusicianCard(musicianDiv, musicianName, instrument, classes = [], showStar = false) {
        // Clear all state classes
        musicianDiv.className = 'musician-card';

        // Add any state classes
        classes.forEach(cls => musicianDiv.classList.add(cls));

        // Update content
        const starPrefix = showStar ? '⭐ ' : '';
        musicianDiv.innerHTML = `
            <div class="musician-name">${starPrefix}${musicianName} (${instrument})</div>
            <div class="chartifact-line">Chartifact "0x1234ff" owned by cryptograss.eth</div>
        `;
    }

    getCurrentArrangement(currentTime) {
        const startTimes = Object.keys(this.trackData.timeline).map(Number).sort((a, b) => b - a);
        const currentStartTime = startTimes.find(time => time <= currentTime);
        return this.trackData.timeline[currentStartTime];
    }

    getCurrentInstruments(currentTime) {
        const arrangement = this.getCurrentArrangement(currentTime);
        const instruments = {};

        // Start with default instruments
        Object.entries(this.trackData.ensemble).forEach(([musician, musicianData]) => {
            instruments[musician] = musicianData.defaultInstrument;
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
        const arrangement = this.getCurrentArrangement(currentTime);
        const currentInstruments = this.getCurrentInstruments(currentTime);
        const currentSoloist = arrangement ? arrangement.soloist : null;

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

        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
            if (!musicianDiv) return;

            const instrument = currentInstruments[musicianName];

            // Handle different lead types
            if (currentSoloist === musicianName) {
                const leadType = arrangement ? arrangement.type : null;

                if (leadType === 'solo') {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['solo'], true);
                } else if (leadType === 'pick up') {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['pickup']);
                } else {
                    // Intro or default
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['intro']);
                }
            } else {
                // Not leading - check if we need to gray out during intro
                const leadType = arrangement ? arrangement.type : null;
                const isIntroScene = currentSoloist && leadType === 'intro';

                if (isIntroScene) {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, ['grayed']);
                } else {
                    this.updateMusicianCard(musicianDiv, musicianName, instrument, []);
                }
            }
        });
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

        // Handle different moment types
            if (arrangement.detail === "band-in") {
                this.flashEntireEnsemble();
            }
        // Add other moment types here as needed
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
        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
            if (!musicianDiv) return;

            // Use helper function to reset to default state
            this.updateMusicianCard(musicianDiv, musicianName, musicianData.defaultInstrument);
        });
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