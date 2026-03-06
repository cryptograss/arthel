/**
 * Video Upload Page
 * Handles wallet connection, video upload to Coconut.co for AV1 HLS transcoding
 */

import { reconnect, getAccount, signMessage } from '@wagmi/core';
import { createWalletConnection } from './wallet-utils.js';

// Setup wallet connection with error handling
const wallet = createWalletConnection({
    name: 'Cryptograss Video Upload',
    description: 'Transcode and pin video to IPFS'
});

const { modal, wagmiAdapter, wagmiConfig } = wallet || {};

export function initVideoUploadPage(options) {
    const { pinningService, gateway } = options;

    // Check if wallet connection was successfully initialized
    if (!wallet) {
        console.error('[VideoUpload] Wallet connection failed to initialize');
        console.error('[VideoUpload] Check earlier [Reown] errors in console for details');
        const errorDiv = document.getElementById('upload-error');
        if (errorDiv) {
            errorDiv.textContent = 'Wallet connection failed to initialize. Check console for details.';
            errorDiv.style.display = 'block';
        }
        return;
    }

    // Reconnect existing wallet sessions
    try {
        reconnect(wagmiConfig);
    } catch (err) {
        console.error('[VideoUpload] reconnect() failed:', err);
    }

    // State
    let selectedVideo = null;
    let currentJobId = null;
    let pollInterval = null;

    // DOM elements - wallet
    const connectBtn = document.getElementById('connect-wallet-btn');
    const notConnectedMsg = document.getElementById('not-connected-msg');
    const connectedAddress = document.getElementById('connected-address');

    // DOM elements - video selection
    const videoDropzone = document.getElementById('video-dropzone');
    const videoInput = document.getElementById('video-input');
    const browseLink = document.getElementById('browse-link');
    const selectedFileText = document.getElementById('selected-file');
    const videoPreview = document.getElementById('video-preview');
    const previewPlayer = document.getElementById('preview-player');

    // DOM elements - options
    const quality1080 = document.getElementById('quality-1080');
    const quality720 = document.getElementById('quality-720');
    const quality480 = document.getElementById('quality-480');
    const keepOriginal = document.getElementById('keep-original');

    // DOM elements - progress
    const processBtn = document.getElementById('process-btn');
    const uploadProgress = document.getElementById('upload-progress');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const progressDetails = document.getElementById('progress-details');
    const uploadError = document.getElementById('upload-error');

    // DOM elements - result
    const resultSection = document.getElementById('result-section');
    const resultCid = document.getElementById('result-cid');
    const copyCidBtn = document.getElementById('copy-cid-btn');
    const masterPlaylistLink = document.getElementById('master-playlist-link');
    const originalCidSection = document.getElementById('original-cid-section');
    const originalCid = document.getElementById('original-cid');
    const resultDetails = document.getElementById('result-details');
    const resultPlayer = document.getElementById('result-player');
    const uploadAnotherBtn = document.getElementById('upload-another-btn');

    // Wallet UI
    function updateWalletUI() {
        const account = getAccount(wagmiConfig);
        if (account.address) {
            notConnectedMsg.style.display = 'none';
            connectedAddress.style.display = 'block';
            connectedAddress.textContent = account.address;
            connectBtn.textContent = 'Connected';
            updateProcessButton();
        } else {
            notConnectedMsg.style.display = 'block';
            connectedAddress.style.display = 'none';
            connectBtn.textContent = 'Connect Wallet';
            updateProcessButton();
        }
    }

    function updateProcessButton() {
        const account = getAccount(wagmiConfig);
        const hasQuality = quality1080.checked || quality720.checked || quality480.checked;
        processBtn.disabled = !account.address || !selectedVideo || !hasQuality;
    }

    connectBtn.addEventListener('click', () => modal && modal.open());

    if (wagmiAdapter && wagmiAdapter.wagmiConfig) {
        wagmiAdapter.wagmiConfig.subscribe(
            (state) => state.current,
            () => updateWalletUI()
        );
    }

    // Video selection
    browseLink.addEventListener('click', (e) => {
        e.preventDefault();
        videoInput.click();
    });

    videoDropzone.addEventListener('click', (e) => {
        if (e.target !== browseLink) {
            videoInput.click();
        }
    });

    videoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectVideo(e.target.files[0]);
        }
    });

    videoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        videoDropzone.classList.add('dragover');
    });

    videoDropzone.addEventListener('dragleave', () => {
        videoDropzone.classList.remove('dragover');
    });

    videoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        videoDropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('video/')) {
                selectVideo(file);
            } else {
                uploadError.textContent = 'Please select a video file';
                uploadError.style.display = 'block';
            }
        }
    });

    function selectVideo(file) {
        selectedVideo = file;
        const sizeStr = formatFileSize(file.size);
        selectedFileText.textContent = `${file.name} (${sizeStr})`;
        uploadError.style.display = 'none';

        // Show preview
        const url = URL.createObjectURL(file);
        previewPlayer.src = url;
        videoPreview.style.display = 'block';

        updateProcessButton();
    }

    // Quality checkboxes
    [quality1080, quality720, quality480].forEach(cb => {
        cb.addEventListener('change', updateProcessButton);
    });

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    // Poll for job status
    async function pollJobStatus(jobId) {
        try {
            const response = await fetch(`${pinningService}/job/${jobId}`);
            if (!response.ok) {
                throw new Error(`Failed to check job status: ${response.status}`);
            }

            const job = await response.json();
            console.log('Job status:', job);

            if (job.status === 'complete') {
                // Success!
                clearInterval(pollInterval);
                pollInterval = null;

                progressBar.style.width = '100%';
                progressText.textContent = 'Complete!';

                setTimeout(() => {
                    uploadProgress.style.display = 'none';
                    resultSection.style.display = 'block';

                    resultCid.value = job.hlsCid;
                    const playlistUrl = `${gateway}/ipfs/${job.hlsCid}/master.m3u8`;
                    masterPlaylistLink.href = playlistUrl;
                    masterPlaylistLink.textContent = playlistUrl;

                    if (job.sourceCid && keepOriginal.checked) {
                        originalCidSection.style.display = 'block';
                        originalCid.textContent = job.sourceCid;
                    }

                    // Build details
                    const details = [];
                    if (job.qualities) {
                        details.push(`Qualities: ${job.qualities.join(', ')}p (AV1)`);
                    }
                    resultDetails.textContent = details.join(' | ');

                    // Setup HLS player
                    setupHlsPlayer(playlistUrl);
                }, 500);

            } else if (job.status === 'failed') {
                clearInterval(pollInterval);
                pollInterval = null;
                throw new Error(job.error || 'Transcoding failed');

            } else {
                // Still processing - update UI
                progressText.textContent = `Transcoding in progress... (${job.status})`;
                // Animate progress bar between 20-80% while waiting
                const currentWidth = parseInt(progressBar.style.width) || 20;
                const newWidth = Math.min(80, currentWidth + 2);
                progressBar.style.width = newWidth + '%';
            }

        } catch (error) {
            clearInterval(pollInterval);
            pollInterval = null;
            console.error('Poll error:', error);
            uploadProgress.style.display = 'none';
            uploadError.textContent = error.message || 'Failed to check job status';
            uploadError.style.display = 'block';
            processBtn.disabled = false;
        }
    }

    // Process button
    processBtn.addEventListener('click', async () => {
        const account = getAccount(wagmiConfig);
        if (!account.address || !selectedVideo) return;

        // Gather options
        const qualities = [];
        if (quality1080.checked) qualities.push(1080);
        if (quality720.checked) qualities.push(720);
        if (quality480.checked) qualities.push(480);

        if (qualities.length === 0) {
            uploadError.textContent = 'Please select at least one quality tier';
            uploadError.style.display = 'block';
            return;
        }

        processBtn.disabled = true;
        uploadError.style.display = 'none';
        uploadProgress.style.display = 'block';
        progressText.textContent = 'Signing authorization...';
        progressBar.style.width = '0%';
        progressDetails.textContent = '';

        try {
            // Get server time to avoid clock drift issues
            let timestamp;
            try {
                const timeResp = await fetch(`${pinningService}/time`);
                const timeData = await timeResp.json();
                timestamp = timeData.timestamp;
            } catch (e) {
                console.warn('Could not fetch server time, using local:', e);
                timestamp = Date.now();
            }

            // Sign auth message
            const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;
            const signature = await signMessage(wagmiConfig, { message: authMessage });

            progressText.textContent = 'Uploading video...';
            progressBar.style.width = '5%';

            // Build form data
            const formData = new FormData();
            formData.append('video', selectedVideo);
            formData.append('qualities', JSON.stringify(qualities));
            formData.append('keepOriginal', keepOriginal.checked ? 'true' : 'false');

            // Submit to Coconut endpoint
            const response = await fetch(`${pinningService}/transcode-coconut`, {
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

            const result = await response.json();
            console.log('Job submitted:', result);

            currentJobId = result.jobId;
            progressText.textContent = 'Video uploaded, transcoding with Coconut (AV1)...';
            progressBar.style.width = '20%';
            progressDetails.textContent = `Job ID: ${result.jobId}`;

            // Start polling for job status
            pollInterval = setInterval(() => pollJobStatus(currentJobId), 5000);

            // Also poll immediately
            setTimeout(() => pollJobStatus(currentJobId), 1000);

        } catch (err) {
            console.error('Upload error:', err);
            uploadProgress.style.display = 'none';
            uploadError.textContent = err.message || 'Upload failed';
            uploadError.style.display = 'block';
            processBtn.disabled = false;
        }
    });

    // HLS player setup
    async function setupHlsPlayer(url) {
        // Try native HLS first (Safari)
        if (resultPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            resultPlayer.src = url;
            return;
        }

        // Load hls.js dynamically
        try {
            const Hls = (await import('hls.js')).default;
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(resultPlayer);
            } else {
                console.warn('HLS not supported in this browser');
            }
        } catch (e) {
            console.warn('Could not load hls.js:', e);
        }
    }

    // Copy CID
    copyCidBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultCid.value).then(() => {
            copyCidBtn.textContent = '✓';
            setTimeout(() => copyCidBtn.textContent = '📋', 2000);
        });
    });

    // Upload another
    uploadAnotherBtn.addEventListener('click', () => {
        // Clean up any running poll
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        currentJobId = null;

        resultSection.style.display = 'none';
        selectedVideo = null;
        selectedFileText.textContent = '';
        videoInput.value = '';
        videoPreview.style.display = 'none';
        previewPlayer.src = '';
        originalCidSection.style.display = 'none';
        updateProcessButton();
    });

    // Initial UI
    updateWalletUI();
}

window.initVideoUploadPage = initVideoUploadPage;
