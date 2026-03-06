/**
 * Album Upload Page - Multi-Step Workflow
 *
 * Step 1: Connect wallet
 * Step 2: Upload files → creates draft, server analyzes
 * Step 3: Review & edit track titles, album info
 * Step 4: Finalize → transcode, pin to IPFS
 */

import { reconnect, getAccount, signMessage } from '@wagmi/core';
import { createWalletConnection } from './wallet-utils.js';

// Setup wallet connection with error handling
const wallet = createWalletConnection({
    name: 'Cryptograss Album Upload',
    description: 'Pin albums to IPFS'
});

const { modal, wagmiAdapter, wagmiConfig } = wallet || {};

// Local storage key for draft recovery
const DRAFT_STORAGE_KEY = 'cryptograss-album-draft';

export function initUploadAlbumPage(options) {
    const { pinningService, gateway } = options;

    // Check if wallet connection was successfully initialized
    if (!wallet) {
        console.error('[Upload] Wallet connection failed to initialize');
        const errorDiv = document.getElementById('upload-error');
        if (errorDiv) {
            errorDiv.textContent = 'Wallet connection failed to initialize. Check console for details.';
            errorDiv.style.display = 'block';
        }
        return;
    }

    if (!wagmiConfig) {
        console.error('[Upload] wagmiConfig is undefined - wallet initialization incomplete');
        return;
    }

    // Reconnect existing wallet sessions
    try {
        reconnect(wagmiConfig);
    } catch (err) {
        console.error('[Upload] reconnect() failed:', err);
    }

    // State
    let currentStep = 1;
    let draftId = null;
    let draftExpiresAt = null;
    let trackData = []; // From server analysis: { original_filename, detected_title, format, duration_seconds, ... }

    // DOM Elements - Steps
    const step1 = document.getElementById('step-1-wallet');
    const step2 = document.getElementById('step-2-upload');
    const step3 = document.getElementById('step-3-review');
    const step4 = document.getElementById('step-4-finalize');
    const resultSection = document.getElementById('result-section');

    // DOM Elements - Step indicators
    const stepIndicators = document.querySelectorAll('.step');

    // DOM Elements - Wallet
    const connectBtn = document.getElementById('connect-wallet-btn');
    const notConnectedMsg = document.getElementById('not-connected-msg');
    const connectedAddress = document.getElementById('connected-address');
    const authorizationStatus = document.getElementById('authorization-status');

    // DOM Elements - Upload
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const browseLink = document.getElementById('browse-link');
    const uploadProgress = document.getElementById('upload-progress');
    const uploadProgressText = document.getElementById('upload-progress-text');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const uploadError = document.getElementById('upload-error');

    // DOM Elements - Review
    const albumTitle = document.getElementById('album-title');
    const albumArtist = document.getElementById('album-artist');
    const albumYear = document.getElementById('album-year');
    const albumDescription = document.getElementById('album-description');
    const trackList = document.getElementById('track-list');
    const draftIdDisplay = document.getElementById('draft-id-display');
    const draftExpiresDisplay = document.getElementById('draft-expires-display');
    const draftInfo = document.getElementById('draft-info');
    const backToUploadBtn = document.getElementById('back-to-upload-btn');
    const finalizeBtn = document.getElementById('finalize-btn');

    // DOM Elements - Finalize
    const finalizeProgress = document.getElementById('finalize-progress');
    const finalizeProgressText = document.getElementById('finalize-progress-text');
    const finalizeProgressBar = document.getElementById('finalize-progress-bar');
    const finalizeDetails = document.getElementById('finalize-details');
    const finalizeError = document.getElementById('finalize-error');

    // DOM Elements - Result
    const resultCid = document.getElementById('result-cid');
    const copyCidBtn = document.getElementById('copy-cid-btn');
    const gatewayLink = document.getElementById('gateway-link');
    const resultTrackList = document.getElementById('result-track-list');
    const uploadDetails = document.getElementById('upload-details');
    const uploadAnotherBtn = document.getElementById('upload-another-btn');

    // Step management
    function setStep(step) {
        currentStep = step;

        // Hide all step containers
        [step1, step2, step3, step4].forEach(el => el.style.display = 'none');

        // Show current step
        const stepMap = { 1: step1, 2: step2, 3: step3, 4: step4 };
        if (stepMap[step]) {
            stepMap[step].style.display = 'block';
        }

        // Update step indicators
        stepIndicators.forEach(indicator => {
            const indicatorStep = parseInt(indicator.dataset.step);
            indicator.classList.remove('active', 'completed');
            if (indicatorStep < step) {
                indicator.classList.add('completed');
            } else if (indicatorStep === step) {
                indicator.classList.add('active');
            }
        });
    }

    // Update wallet UI
    async function updateWalletUI() {
        const account = getAccount(wagmiConfig);
        if (account.address) {
            notConnectedMsg.style.display = 'none';
            connectedAddress.style.display = 'block';
            connectedAddress.textContent = account.address;
            connectBtn.textContent = 'Connected';

            authorizationStatus.style.display = 'block';
            authorizationStatus.textContent = 'Wallet connected. Ready to upload.';
            authorizationStatus.className = 'small mt-2 authorized';

            // Auto-advance to upload step if on step 1
            if (currentStep === 1) {
                setStep(2);
            }
        } else {
            notConnectedMsg.style.display = 'block';
            connectedAddress.style.display = 'none';
            authorizationStatus.style.display = 'none';
            connectBtn.textContent = 'Connect Wallet';

            // Go back to step 1 if wallet disconnects
            if (currentStep > 1) {
                setStep(1);
            }
        }
        updateFinalizeButton();
    }

    function updateFinalizeButton() {
        const account = getAccount(wagmiConfig);
        const hasFiles = trackData.length > 0;
        const hasTitle = albumTitle.value.trim().length > 0;
        const hasArtist = albumArtist.value.trim().length > 0;
        finalizeBtn.disabled = !account.address || !hasFiles || !hasTitle || !hasArtist;
    }

    // Connect wallet
    connectBtn.addEventListener('click', () => {
        modal.open();
    });

    // Subscribe to wallet changes
    if (wagmiAdapter && wagmiAdapter.wagmiConfig) {
        wagmiAdapter.wagmiConfig.subscribe(
            (state) => state.current,
            () => updateWalletUI()
        );
    }

    // Update button state on metadata changes
    [albumTitle, albumArtist].forEach(el => {
        el.addEventListener('input', updateFinalizeButton);
    });

    // File selection via browse link
    browseLink.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });

    // Click anywhere in dropzone to browse
    uploadArea.addEventListener('click', (e) => {
        if (e.target !== browseLink) {
            fileInput.click();
        }
    });

    // File input change
    fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await handleFileUpload(Array.from(e.target.files));
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            await handleFileUpload(Array.from(e.dataTransfer.files));
        }
    });

    async function handleFileUpload(files) {
        const account = getAccount(wagmiConfig);
        if (!account.address) {
            uploadError.textContent = 'Please connect your wallet first.';
            uploadError.style.display = 'block';
            return;
        }

        uploadError.style.display = 'none';
        uploadProgress.style.display = 'block';
        uploadProgressText.textContent = 'Signing authorization...';
        uploadProgressBar.style.width = '0%';

        try {
            // Get server time and sign authorization
            let timestamp;
            try {
                const timeResp = await fetch(`${pinningService}/time`);
                const timeData = await timeResp.json();
                timestamp = timeData.time ?? timeData.timestamp ?? Date.now();
            } catch (e) {
                timestamp = Date.now();
            }

            const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;
            const signature = await signMessage(wagmiConfig, { message: authMessage });

            uploadProgressText.textContent = 'Uploading and analyzing files...';
            uploadProgressBar.style.width = '20%';

            // Build form data
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });

            // Send to draft endpoint
            const response = await fetch(`${pinningService}/draft-album`, {
                method: 'POST',
                headers: {
                    'X-Signature': signature,
                    'X-Timestamp': timestamp.toString()
                },
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP ${response.status}`);
            }

            const result = await response.json();

            // Store draft info
            draftId = result.draft_id;
            draftExpiresAt = result.expires_at;
            trackData = result.files.map(f => ({
                ...f,
                title: f.detected_title // User-editable title
            }));

            // Save to localStorage for recovery
            saveDraftToStorage();

            uploadProgress.style.display = 'none';

            // Move to review step
            renderTrackList();
            showDraftInfo();
            setStep(3);

        } catch (err) {
            console.error('[Upload] Error:', err);
            uploadProgress.style.display = 'none';
            uploadError.textContent = err?.message || 'Upload failed';
            uploadError.style.display = 'block';
        }
    }

    function saveDraftToStorage() {
        const data = {
            draftId,
            draftExpiresAt,
            trackData,
            albumTitle: albumTitle.value,
            albumArtist: albumArtist.value,
            albumYear: albumYear.value,
            albumDescription: albumDescription.value
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
    }

    function loadDraftFromStorage() {
        try {
            const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (!stored) return null;
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }

    function clearDraftStorage() {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
    }

    function showDraftInfo() {
        if (draftId) {
            draftIdDisplay.textContent = draftId.substring(0, 8) + '...';
            if (draftExpiresAt) {
                const expires = new Date(draftExpiresAt);
                draftExpiresDisplay.textContent = expires.toLocaleString();
            }
            draftInfo.style.display = 'block';
        }
    }

    function renderTrackList() {
        trackList.innerHTML = '';
        trackData.forEach((track, index) => {
            const tr = document.createElement('tr');
            tr.draggable = true;
            tr.dataset.index = index;

            tr.innerHTML = `
                <td class="text-muted">${index + 1}</td>
                <td>
                    <span class="track-title" contenteditable="true" data-index="${index}">${escapeHtml(track.title)}</span>
                </td>
                <td class="small text-muted">${track.format}</td>
                <td class="small text-muted">${formatDuration(track.duration_seconds)}</td>
                <td class="small text-muted">${formatFileSize(track.size_bytes)}</td>
            `;

            // Track title editing
            const titleSpan = tr.querySelector('.track-title');
            titleSpan.addEventListener('blur', (e) => {
                const idx = parseInt(e.target.dataset.index);
                trackData[idx].title = e.target.textContent.trim() || trackData[idx].detected_title;
                saveDraftToStorage();
            });
            titleSpan.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur();
                }
            });

            // Drag handlers
            tr.addEventListener('dragstart', handleDragStart);
            tr.addEventListener('dragover', handleDragOver);
            tr.addEventListener('drop', handleDrop);
            tr.addEventListener('dragend', handleDragEnd);

            trackList.appendChild(tr);
        });
        updateFinalizeButton();
    }

    let dragSrcIndex = null;

    function handleDragStart(e) {
        dragSrcIndex = parseInt(e.target.dataset.index);
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleDrop(e) {
        e.preventDefault();
        const targetIndex = parseInt(e.target.closest('tr').dataset.index);
        if (dragSrcIndex !== null && dragSrcIndex !== targetIndex) {
            const [moved] = trackData.splice(dragSrcIndex, 1);
            trackData.splice(targetIndex, 0, moved);
            renderTrackList();
            saveDraftToStorage();
        }
    }

    function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        dragSrcIndex = null;
    }

    // Back to upload button
    backToUploadBtn.addEventListener('click', () => {
        setStep(2);
    });

    // Finalize button click
    finalizeBtn.addEventListener('click', async () => {
        if (!draftId) {
            finalizeError.textContent = 'No draft to finalize. Please upload files first.';
            finalizeError.style.display = 'block';
            return;
        }

        const account = getAccount(wagmiConfig);
        if (!account.address) {
            finalizeError.textContent = 'Wallet disconnected. Please reconnect.';
            finalizeError.style.display = 'block';
            return;
        }

        // Save current form values
        saveDraftToStorage();

        setStep(4);
        finalizeError.style.display = 'none';
        finalizeProgressText.textContent = 'Signing authorization...';
        finalizeProgressBar.style.width = '0%';
        finalizeDetails.textContent = '';

        try {
            // Get server time and sign
            let timestamp;
            try {
                const timeResp = await fetch(`${pinningService}/time`);
                const timeData = await timeResp.json();
                timestamp = timeData.time ?? timeData.timestamp ?? Date.now();
            } catch (e) {
                timestamp = Date.now();
            }

            const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;
            const signature = await signMessage(wagmiConfig, { message: authMessage });

            finalizeProgressText.textContent = 'Starting finalization...';
            finalizeProgressBar.style.width = '5%';

            // Build finalize request
            const requestBody = {
                album_title: albumTitle.value.trim(),
                artist: albumArtist.value.trim(),
                year: albumYear.value.trim() || null,
                description: albumDescription.value.trim() || null,
                tracks: trackData.map(t => ({
                    filename: t.original_filename,
                    title: t.title
                }))
            };

            // Send finalize request (returns SSE stream)
            const response = await fetch(`${pinningService}/draft-album/${draftId}/finalize`, {
                method: 'POST',
                headers: {
                    'X-Signature': signature,
                    'X-Timestamp': timestamp.toString(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP ${response.status}`);
            }

            // Read SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6));
                            handleFinalizeEvent(event);
                            if (event.cid) {
                                finalResult = event;
                            }
                        } catch (e) {
                            console.warn('Failed to parse SSE event:', line);
                        }
                    } else if (line.startsWith('event: error')) {
                        // Next data line will have error
                    }
                }
            }

            if (!finalResult) {
                throw new Error('Finalization completed without result');
            }

            // Clear draft storage on success
            clearDraftStorage();
            showResult(finalResult);

        } catch (err) {
            console.error('[Finalize] Error:', err);
            finalizeError.textContent = err?.message || 'Finalization failed';
            finalizeError.style.display = 'block';
        }
    });

    function handleFinalizeEvent(event) {
        if (event.stage) {
            finalizeProgressText.textContent = event.message || event.stage;
        }
        if (event.progress !== undefined) {
            finalizeProgressBar.style.width = event.progress + '%';
        }
        if (event.track) {
            finalizeDetails.textContent = `Processing: ${event.track}`;
        }
        if (event.message && event.stage === 'error') {
            finalizeError.textContent = event.message;
            finalizeError.style.display = 'block';
        }
    }

    function showResult(result) {
        // Hide finalize step
        step4.style.display = 'none';

        // Show result
        resultSection.style.display = 'block';

        resultCid.value = result.cid;
        const gatewayUrl = `${gateway}/${result.cid}`;
        gatewayLink.href = gatewayUrl;
        gatewayLink.textContent = gatewayUrl;

        // Show tracks
        resultTrackList.innerHTML = '';
        if (result.tracks) {
            result.tracks.forEach(track => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between';
                li.innerHTML = `
                    <span>${track.track_number}. ${escapeHtml(track.title)}</span>
                    <a href="${gateway}/${result.cid}/ogg/${track.track_number.toString().padStart(2, '0')}-${encodeURIComponent(track.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().substring(0, 50))}.ogg" target="_blank" class="text-muted">
                        OGG
                    </a>
                `;
                resultTrackList.appendChild(li);
            });
        }

        // Details
        let details = [];
        if (result.pinata) {
            details.push('Pinned to Pinata');
        }
        if (result.album_title) {
            details.push(`Album: ${result.album_title}`);
        }
        if (result.artist) {
            details.push(`Artist: ${result.artist}`);
        }
        uploadDetails.textContent = details.join(' | ');

        // Update step indicator to show completion
        stepIndicators.forEach(indicator => {
            indicator.classList.add('completed');
        });
    }

    // Copy CID button
    copyCidBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultCid.value).then(() => {
            copyCidBtn.textContent = '✓';
            setTimeout(() => {
                copyCidBtn.textContent = '📋';
            }, 2000);
        });
    });

    // Upload another button
    uploadAnotherBtn.addEventListener('click', () => {
        resultSection.style.display = 'none';
        draftId = null;
        draftExpiresAt = null;
        trackData = [];
        trackList.innerHTML = '';
        fileInput.value = '';
        albumTitle.value = '';
        albumArtist.value = '';
        albumYear.value = '';
        albumDescription.value = '';
        draftInfo.style.display = 'none';
        clearDraftStorage();
        setStep(2);
    });

    // Utility functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    function formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Check for existing draft on page load
    async function checkForExistingDraft() {
        const stored = loadDraftFromStorage();
        if (!stored || !stored.draftId) return;

        // Check if draft still exists on server
        const account = getAccount(wagmiConfig);
        if (!account.address) return;

        try {
            // Get auth
            let timestamp;
            try {
                const timeResp = await fetch(`${pinningService}/time`);
                const timeData = await timeResp.json();
                timestamp = timeData.time ?? timeData.timestamp ?? Date.now();
            } catch (e) {
                timestamp = Date.now();
            }

            const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;
            const signature = await signMessage(wagmiConfig, { message: authMessage });

            const response = await fetch(`${pinningService}/draft-album/${stored.draftId}`, {
                headers: {
                    'X-Signature': signature,
                    'X-Timestamp': timestamp.toString()
                }
            });

            if (response.ok) {
                // Restore draft state
                const serverDraft = await response.json();
                draftId = stored.draftId;
                draftExpiresAt = serverDraft.expires_at;
                trackData = serverDraft.files.map((f, i) => ({
                    ...f,
                    title: stored.trackData?.[i]?.title || f.detected_title
                }));

                // Restore form values
                if (stored.albumTitle) albumTitle.value = stored.albumTitle;
                if (stored.albumArtist) albumArtist.value = stored.albumArtist;
                if (stored.albumYear) albumYear.value = stored.albumYear;
                if (stored.albumDescription) albumDescription.value = stored.albumDescription;

                renderTrackList();
                showDraftInfo();
                setStep(3);

                console.log('[Upload] Restored draft from storage:', draftId);
            } else {
                // Draft expired or not found
                clearDraftStorage();
            }
        } catch (e) {
            console.warn('[Upload] Could not restore draft:', e);
            clearDraftStorage();
        }
    }

    // Initial UI update
    updateWalletUI();

    // Try to restore draft after wallet connects
    if (wagmiAdapter && wagmiAdapter.wagmiConfig) {
        wagmiAdapter.wagmiConfig.subscribe(
            (state) => state.current,
            () => {
                const account = getAccount(wagmiConfig);
                if (account.address && !draftId) {
                    checkForExistingDraft();
                }
            }
        );
    }
}

// Make available globally
window.initUploadAlbumPage = initUploadAlbumPage;
