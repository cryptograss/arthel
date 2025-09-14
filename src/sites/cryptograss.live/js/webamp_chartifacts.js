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

        this.init();
    }

    async init() {
        this.renderSimpleUI();
        await this.initWebamp();
        this.setupTimeTracking();
    }

    renderSimpleUI() {
        // Add ensemble display alongside Webamp
        const ensembleDiv = document.createElement('div');
        ensembleDiv.id = 'ensemble-display';
        ensembleDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #dee2e6;
            font-family: Arial, sans-serif;
            font-size: 14px;
            color: #333;
            z-index: 1000;
            min-width: 250px;
        `;

        // Create ensemble list
        const ensembleList = document.createElement('div');
        ensembleList.style.display = 'flex';
        ensembleList.style.flexDirection = 'column';
        ensembleList.innerHTML = '<h4 style="margin: 0 0 10px 0;">Ensemble</h4>';

        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            const musicianDiv = document.createElement('div');
            musicianDiv.id = `musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`;
            musicianDiv.style.cssText = `
                padding: 8px;
                margin: 4px 0;
                border-radius: 4px;
                border: 1px solid #ddd;
                transition: all 0.3s ease;
            `;
            musicianDiv.innerHTML = `
                <div style="font-weight: bold;">${musicianName}</div>
                <div style="font-size: 12px; color: #666;" class="instrument">${musicianData.defaultInstrument}</div>
            `;
            ensembleList.appendChild(musicianDiv);
        });

        ensembleDiv.appendChild(ensembleList);
        document.body.appendChild(ensembleDiv);
    }

    renderTimelineMarkers() {
        const totalWidth = 400; // Fixed width for timeline
        return this.trackData.solos.map(solo => {
            const startPercent = (solo.startTime / this.trackData.duration) * 100;
            const widthPercent = ((solo.endTime - solo.startTime) / this.trackData.duration) * 100;

            return `
                <div class="timeline-marker" 
                     style="left: ${startPercent}%; width: ${widthPercent}%;" 
                     data-start="${solo.startTime}"
                     data-musician="${solo.musician}" 
                     data-instrument="${solo.instrument}"
                     title="${solo.musician} - ${solo.instrument} (${this.formatTime(solo.startTime)} - ${this.formatTime(solo.endTime)})">
                    <span class="marker-label">${solo.musician}</span>
                </div>
            `;
        }).join('');
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
            console.log("rendered webamp!");
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

    getCurrentArrangement(currentTime) {
        const startTimes = Object.keys(this.trackData.timeline).map(Number).sort((a, b) => b - a);
        const currentStartTime = startTimes.find(time => time <= currentTime);
        return this.trackData.timeline[currentStartTime];
    }

    getCurrentInstruments(currentTime) {
        const arrangement = this.getCurrentArrangement(currentTime);
        const instruments = {};

        // Start with default instruments
        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            instruments[musicianName] = musicianData.defaultInstrument;
        });

        // Apply any instrument changes for current timeline segment
        if (arrangement && arrangement.instrumentChanges) {
            arrangement.instrumentChanges.forEach(change => {
                instruments[change.musicianName] = change.instrument;
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

        // Skip normal ensemble updates during flash effects
        if (this.flashInProgress) {
            return;
        }

        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
            if (!musicianDiv) return;

            const instrumentDiv = musicianDiv.querySelector('.instrument');
            instrumentDiv.textContent = currentInstruments[musicianName];

            // Handle different lead types
            if (currentSoloist === musicianName) {
                const leadType = arrangement ? arrangement.type : null;

                if (leadType === 'solo') {
                    // Solo: star, move to top, blue highlight
                    musicianDiv.style.cssText = `
                        padding: 8px;
                        margin: 4px 0;
                        border-radius: 4px;
                        border: 2px solid #007bff;
                        background: #e3f2fd;
                        transition: all 0.3s ease;
                        transform: scale(1.05);
                        order: -1;
                    `;
                    musicianDiv.innerHTML = `
                        <div style="font-weight: bold;">⭐ ${musicianName}</div>
                        <div style="font-size: 12px; color: #0056b3;" class="instrument">${currentInstruments[musicianName]}</div>
                    `;
                } else if (leadType === 'pick up') {
                    // Pickup: bold name, orange highlight, no star
                    musicianDiv.style.cssText = `
                        padding: 8px;
                        margin: 4px 0;
                        border-radius: 4px;
                        border: 2px solid #ff9800;
                        background: #fff3e0;
                        transition: all 0.3s ease;
                        transform: scale(1.02);
                    `;
                    musicianDiv.innerHTML = `
                        <div style="font-weight: bold;">${musicianName}</div>
                        <div style="font-size: 12px; color: #e65100;" class="instrument">${currentInstruments[musicianName]}</div>
                    `;
                } else {
                    // Intro or default: bold name, light blue highlight, no star
                    musicianDiv.style.cssText = `
                        padding: 8px;
                        margin: 4px 0;
                        border-radius: 4px;
                        border: 1px solid #17a2b8;
                        background: #e6f7ff;
                        transition: all 0.3s ease;
                        transform: scale(1.02);
                    `;
                    musicianDiv.innerHTML = `
                        <div style="font-weight: bold;">${musicianName}</div>
                        <div style="font-size: 12px; color: #117a8b;" class="instrument">${currentInstruments[musicianName]}</div>
                    `;
                }
            } else {
                // Not leading: normal styling
                musicianDiv.style.cssText = `
                    padding: 8px;
                    margin: 4px 0;
                    border-radius: 4px;
                    border: 1px solid #ddd;
                    background: #f8f9fa;
                    transition: all 0.3s ease;
                    transform: scale(1);
                    order: 0;
                `;
                musicianDiv.innerHTML = `
                    <div style="font-weight: bold;">${musicianName}</div>
                    <div style="font-size: 12px; color: #666;" class="instrument">${currentInstruments[musicianName]}</div>
                `;
            }
        });
    }

    flashEntireEnsemble() {
        // Set flash in progress to prevent normal updates from interfering
        this.flashInProgress = true;

        // Flash each musician individually with golden highlight
        Object.entries(this.trackData.ensemble).forEach(([musicianName, musicianData]) => {
            const musicianDiv = document.getElementById(`musician-${musicianName.replace(/\s+/g, '-').toLowerCase()}`);
            if (!musicianDiv) return;

            // Apply golden flash styling
            musicianDiv.style.cssText = `
                padding: 8px;
                margin: 4px 0;
                border-radius: 4px;
                border: 2px solid #ffd700;
                background: #fffbf0;
                box-shadow: 0 0 15px #ffd700;
                transition: all 0.3s ease;
                transform: scale(1.05);
            `;

            musicianDiv.innerHTML = `
                <div style="font-weight: bold;">🎵 ${musicianName}</div>
                <div style="font-size: 12px; color: #b8860b;" class="instrument">${musicianData.defaultInstrument}</div>
            `;
        });

        // Fade back to normal after 1.5 seconds
        setTimeout(() => {
            // Reset flash effect, let normal updates resume
            this.flashInProgress = false;
        }, 1500);
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

    displayCurrentSolo() {
        const currentSoloDiv = document.getElementById('currentSolo');
        const chartDisplay = document.getElementById('chartDisplay');

        if (this.currentSolo) {
            currentSoloDiv.innerHTML = `
                <div class="solo-info active-solo">
                    <div class="solo-musician">🎵 ${this.currentSolo.musician}</div>
                    <div class="solo-details">${this.currentSolo.instrument} • ${this.currentSolo.description}</div>
                </div>
            `;

            // Show chart if available
            if (this.currentSolo.chartImage) {
                document.getElementById('chartImage').src = this.currentSolo.chartImage;
                document.getElementById('tokenId').textContent = this.currentSolo.chartifactTokenId;
                chartDisplay.style.display = 'block';

                // Load NFT ownership (mock for now)
                this.loadChartifactOwnership(this.currentSolo.chartifactTokenId);
            }
        } else {
            currentSoloDiv.innerHTML = `
                <div class="solo-info">
                    <div class="solo-musician">Track playing...</div>
                    <div class="solo-details">Background accompaniment</div>
                </div>
            `;
            chartDisplay.style.display = 'none';
        }
    }

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

            musicianDiv.style.cssText = `
                padding: 8px;
                margin: 4px 0;
                border-radius: 4px;
                border: 1px solid #ddd;
                background: #f8f9fa;
                transition: all 0.3s ease;
                transform: scale(1);
            `;
            musicianDiv.innerHTML = `
                <div style="font-weight: bold;">${musicianName}</div>
                <div style="font-size: 12px; color: #666;" class="instrument">${musicianData.defaultInstrument}</div>
            `;
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