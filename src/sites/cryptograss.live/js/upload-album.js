/**
 * Album Upload Page
 * Handles wallet connection, metadata entry, multi-file upload with transcoding
 */

import { reconnect, getAccount, signMessage } from '@wagmi/core';
import { createWalletConnection } from './wallet-utils.js';

// Setup wallet connection with error handling
const wallet = createWalletConnection({
    name: 'Cryptograss Album Upload',
    description: 'Pin albums to IPFS'
});

const { modal, wagmiAdapter, wagmiConfig } = wallet || {};

export function initUploadAlbumPage(options) {
    const { pinningService, gateway } = options;

    // Reconnect existing wallet sessions
    reconnect(wagmiConfig);

    // State
    let selectedFiles = [];
    let trackData = []; // { file, title, trackNumber }

    // DOM elements
    const connectBtn = document.getElementById('connect-wallet-btn');
    const notConnectedMsg = document.getElementById('not-connected-msg');
    const connectedAddress = document.getElementById('connected-address');
    const authorizationStatus = document.getElementById('authorization-status');

    const albumTitle = document.getElementById('album-title');
    const albumArtist = document.getElementById('album-artist');
    const albumVersion = document.getElementById('album-version');
    const albumYear = document.getElementById('album-year');
    const albumDescription = document.getElementById('album-description');

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const browseLink = document.getElementById('browse-link');
    const trackListSection = document.getElementById('track-list-section');
    const trackList = document.getElementById('track-list');
    const uploadBtn = document.getElementById('upload-btn');

    const uploadProgress = document.getElementById('upload-progress');
    const uploadProgressText = document.getElementById('upload-progress-text');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const progressDetails = document.getElementById('progress-details');
    const uploadError = document.getElementById('upload-error');

    const resultSection = document.getElementById('result-section');
    const resultCid = document.getElementById('result-cid');
    const copyCidBtn = document.getElementById('copy-cid-btn');
    const gatewayLink = document.getElementById('gateway-link');
    const resultTrackList = document.getElementById('result-track-list');
    const uploadDetails = document.getElementById('upload-details');
    const uploadAnotherBtn = document.getElementById('upload-another-btn');

    // Update wallet UI
    async function updateWalletUI() {
        const account = getAccount(wagmiConfig);
        if (account.address) {
            notConnectedMsg.style.display = 'none';
            connectedAddress.style.display = 'block';
            connectedAddress.textContent = account.address;
            connectBtn.textContent = 'Connected';

            authorizationStatus.style.display = 'block';
            authorizationStatus.textContent = 'Wallet connected. Authorization will be verified on upload.';
            authorizationStatus.className = 'small mt-2 authorized';
            updateUploadButton();
        } else {
            notConnectedMsg.style.display = 'block';
            connectedAddress.style.display = 'none';
            authorizationStatus.style.display = 'none';
            connectBtn.textContent = 'Connect Wallet';
            updateUploadButton();
        }
    }

    function updateUploadButton() {
        const account = getAccount(wagmiConfig);
        const hasFiles = trackData.length > 0;
        const hasTitle = albumTitle.value.trim().length > 0;
        const hasArtist = albumArtist.value.trim().length > 0;
        uploadBtn.disabled = !account.address || !hasFiles || !hasTitle || !hasArtist;
    }

    // Connect wallet
    connectBtn.addEventListener('click', () => {
        modal.open();
    });

    // Subscribe to wallet changes
    wagmiAdapter.wagmiConfig.subscribe(
        (state) => state.current,
        () => updateWalletUI()
    );

    // Update button state on metadata changes
    [albumTitle, albumArtist].forEach(el => {
        el.addEventListener('input', updateUploadButton);
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
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            addFiles(Array.from(e.target.files));
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

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            addFiles(Array.from(e.dataTransfer.files));
        }
    });

    function addFiles(files) {
        // Filter to audio files
        const audioFiles = files.filter(f =>
            /\.(flac|wav|mp3|ogg|m4a)$/i.test(f.name)
        );

        if (audioFiles.length === 0) {
            uploadError.textContent = 'No supported audio files found. Use FLAC, WAV, MP3, OGG, or M4A.';
            uploadError.style.display = 'block';
            return;
        }

        uploadError.style.display = 'none';

        // Sort by filename to get natural track order
        audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        // Create track data
        trackData = audioFiles.map((file, index) => ({
            file,
            title: extractTrackTitle(file.name),
            trackNumber: index + 1
        }));

        renderTrackList();
        trackListSection.style.display = 'block';
        updateUploadButton();
    }

    function extractTrackTitle(filename) {
        // Remove extension
        let name = filename.replace(/\.(flac|wav|mp3|ogg|m4a)$/i, '');
        // Remove common prefixes like "01 - " or "01. "
        name = name.replace(/^\d+[\s._-]+/, '');
        // Replace underscores with spaces
        name = name.replace(/_/g, ' ');
        return name.trim() || filename;
    }

    function renderTrackList() {
        trackList.innerHTML = '';
        trackData.forEach((track, index) => {
            const tr = document.createElement('tr');
            tr.draggable = true;
            tr.dataset.index = index;

            tr.innerHTML = `
                <td class="text-muted">${track.trackNumber}</td>
                <td>
                    <span class="track-title" contenteditable="true" data-index="${index}">${escapeHtml(track.title)}</span>
                </td>
                <td class="small text-muted">${truncateFilename(track.file.name, 15)}</td>
                <td class="small text-muted">${formatFileSize(track.file.size)}</td>
            `;

            // Track title editing
            const titleSpan = tr.querySelector('.track-title');
            titleSpan.addEventListener('blur', (e) => {
                const idx = parseInt(e.target.dataset.index);
                trackData[idx].title = e.target.textContent.trim() || trackData[idx].file.name;
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
            // Reorder
            const [moved] = trackData.splice(dragSrcIndex, 1);
            trackData.splice(targetIndex, 0, moved);
            // Renumber
            trackData.forEach((t, i) => t.trackNumber = i + 1);
            renderTrackList();
        }
    }

    function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        dragSrcIndex = null;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function truncateFilename(name, maxLen) {
        if (name.length <= maxLen) return name;
        const ext = name.split('.').pop();
        const base = name.slice(0, -(ext.length + 1));
        const truncated = base.slice(0, maxLen - ext.length - 4) + '...';
        return truncated + '.' + ext;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    // Upload button click
    uploadBtn.addEventListener('click', async () => {
        const account = getAccount(wagmiConfig);
        if (!account.address) {
            uploadError.textContent = 'Please connect your wallet first.';
            uploadError.style.display = 'block';
            return;
        }

        if (trackData.length === 0) {
            uploadError.textContent = 'Please add audio files first.';
            uploadError.style.display = 'block';
            return;
        }

        uploadBtn.disabled = true;
        uploadError.style.display = 'none';
        uploadProgress.style.display = 'block';
        uploadProgressText.textContent = 'Signing authorization...';
        uploadProgressBar.style.width = '0%';
        progressDetails.textContent = '';

        try {
            // Get server time
            let timestamp;
            try {
                const timeResp = await fetch(`${pinningService}/time`);
                const timeData = await timeResp.json();
                timestamp = timeData.timestamp;
            } catch (e) {
                console.warn('Could not fetch server time, using local:', e);
                timestamp = Date.now();
            }

            // Create auth message and sign it
            const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;
            const signature = await signMessage(wagmiConfig, { message: authMessage });

            uploadProgressText.textContent = 'Uploading files...';
            uploadProgressBar.style.width = '5%';

            // Build form data
            const formData = new FormData();
            formData.append('title', albumTitle.value.trim());
            formData.append('artist', albumArtist.value.trim());
            formData.append('version', albumVersion.value.trim() || 'master');
            formData.append('year', albumYear.value.trim() || new Date().getFullYear().toString());
            formData.append('description', albumDescription.value.trim());

            // Add track metadata as JSON
            const trackMeta = trackData.map(t => ({
                trackNumber: t.trackNumber,
                title: t.title,
                filename: t.file.name
            }));
            formData.append('tracks', JSON.stringify(trackMeta));

            // Add files
            trackData.forEach((track, index) => {
                formData.append('files', track.file);
            });

            // Use SSE for progress
            const response = await fetch(`${pinningService}/pin-album-direct`, {
                method: 'POST',
                headers: {
                    'X-Signature': signature,
                    'X-Timestamp': timestamp.toString()
                },
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
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
                buffer = lines.pop(); // Keep incomplete line

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6));
                            handleProgressEvent(event);
                            if (event.stage === 'complete') {
                                finalResult = event;
                            }
                        } catch (e) {
                            console.warn('Failed to parse SSE event:', line);
                        }
                    }
                }
            }

            if (!finalResult) {
                throw new Error('Upload completed without final result');
            }

            showResult(finalResult);

        } catch (err) {
            console.error('Upload error:', err);
            uploadProgress.style.display = 'none';
            uploadError.textContent = err.message || 'Upload failed';
            uploadError.style.display = 'block';
            uploadBtn.disabled = false;
        }
    });

    function handleProgressEvent(event) {
        const { stage, message, progress, track } = event;

        if (progress !== undefined) {
            uploadProgressBar.style.width = progress + '%';
        }

        uploadProgressText.textContent = message || stage;

        if (track) {
            progressDetails.textContent = `Processing: ${track}`;
        }
    }

    function showResult(result) {
        uploadProgress.style.display = 'none';
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
                    <span>${track.trackNumber}. ${escapeHtml(track.title)}</span>
                    <a href="${gateway}/${result.cid}/${track.filename}" target="_blank" class="text-muted">
                        ${track.filename}
                    </a>
                `;
                resultTrackList.appendChild(li);
            });
        }

        // Details
        let details = [];
        if (result.totalSize) {
            details.push(`Total: ${formatFileSize(result.totalSize)}`);
        }
        if (result.pinnedToPinata) {
            details.push('Pinned to Pinata');
        }
        if (result.releasePageTitle) {
            details.push(`Release: ${result.releasePageTitle}`);
        }
        uploadDetails.textContent = details.join(' | ');
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
        trackListSection.style.display = 'none';
        trackData = [];
        trackList.innerHTML = '';
        fileInput.value = '';
        albumTitle.value = '';
        albumArtist.value = '';
        albumVersion.value = '';
        albumYear.value = '';
        albumDescription.value = '';
        uploadBtn.disabled = true;
        updateUploadButton();
    });

    // Initial UI update
    updateWalletUI();
}

// Make available globally
window.initUploadAlbumPage = initUploadAlbumPage;
