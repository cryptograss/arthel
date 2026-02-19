/**
 * Video Upload Page
 * Handles wallet connection, video upload, HLS transcoding, and IPFS pinning
 */

import { createAppKit } from '@reown/appkit';
import { optimism } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { reconnect, getAccount, signMessage } from '@wagmi/core';

// Setup Web3Modal
const projectId = 'c4f79cc821d56e59de850c9b35cbbe86';
const metadata = {
    name: 'Cryptograss Video Upload',
    description: 'Transcode and pin video to IPFS',
    url: 'https://cryptograss.live',
    icons: ['https://cryptograss.live/favicon.ico']
};

const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [optimism]
});

const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [optimism],
    metadata,
    projectId,
    features: { analytics: false }
});

const wagmiConfig = wagmiAdapter.wagmiConfig;

export function initVideoUploadPage(options) {
    const { pinningService, gateway } = options;

    // Reconnect existing wallet sessions
    reconnect(wagmiConfig);

    // State
    let selectedVideo = null;
    let selectedSubtitle = null;

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
    const subtitleInput = document.getElementById('subtitle-input');
    const subtitleSelected = document.getElementById('subtitle-selected');

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

    connectBtn.addEventListener('click', () => modal.open());

    wagmiAdapter.wagmiConfig.subscribe(
        (state) => state.current,
        () => updateWalletUI()
    );

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

    // Subtitle selection
    subtitleInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedSubtitle = e.target.files[0];
            subtitleSelected.textContent = `Selected: ${selectedSubtitle.name}`;
            subtitleSelected.style.display = 'block';
        } else {
            selectedSubtitle = null;
            subtitleSelected.style.display = 'none';
        }
    });

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
            // Sign auth message
            const timestamp = Date.now();
            const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;
            const signature = await signMessage(wagmiConfig, { message: authMessage });

            progressText.textContent = 'Uploading video...';
            progressBar.style.width = '5%';

            // Build form data
            const formData = new FormData();
            formData.append('video', selectedVideo);
            formData.append('qualities', JSON.stringify(qualities));
            formData.append('keepOriginal', keepOriginal.checked ? 'true' : 'false');
            if (selectedSubtitle) {
                formData.append('subtitle', selectedSubtitle);
            }

            // Upload with SSE progress
            const response = await fetch(`${pinningService}/transcode-video`, {
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

            // Process SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events
                const events = buffer.split('\n\n');
                buffer = events.pop();

                for (const eventStr of events) {
                    if (!eventStr.startsWith('data: ')) continue;

                    let event;
                    try {
                        event = JSON.parse(eventStr.slice(6));
                    } catch (e) {
                        continue;
                    }

                    console.log('Progress:', event);

                    if (event.stage === 'error') {
                        throw new Error(event.message);
                    } else if (event.stage === 'complete') {
                        finalResult = event;
                        progressBar.style.width = '100%';
                        progressText.textContent = 'Complete!';
                    } else {
                        if (event.message) progressText.textContent = event.message;
                        if (event.progress) progressBar.style.width = event.progress + '%';
                        if (event.details) progressDetails.textContent = event.details;
                    }
                }
            }

            if (!finalResult || !finalResult.cid) {
                throw new Error('No result returned from server');
            }

            // Show result
            setTimeout(() => {
                uploadProgress.style.display = 'none';
                resultSection.style.display = 'block';

                resultCid.value = finalResult.cid;
                const playlistUrl = `${gateway}/${finalResult.cid}/master.m3u8`;
                masterPlaylistLink.href = playlistUrl;
                masterPlaylistLink.textContent = playlistUrl;

                if (finalResult.originalCid) {
                    originalCidSection.style.display = 'block';
                    originalCid.textContent = finalResult.originalCid;
                }

                // Build details
                const details = [];
                if (finalResult.qualities) {
                    details.push(`Qualities: ${finalResult.qualities.join(', ')}p`);
                }
                if (finalResult.totalSize) {
                    details.push(`Total size: ${formatFileSize(finalResult.totalSize)}`);
                }
                if (finalResult.hasSubtitles) {
                    details.push('Includes subtitles');
                }
                resultDetails.textContent = details.join(' | ');

                // Setup HLS player
                setupHlsPlayer(playlistUrl);

            }, 500);

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
        resultSection.style.display = 'none';
        selectedVideo = null;
        selectedSubtitle = null;
        selectedFileText.textContent = '';
        videoInput.value = '';
        subtitleInput.value = '';
        subtitleSelected.style.display = 'none';
        videoPreview.style.display = 'none';
        previewPlayer.src = '';
        originalCidSection.style.display = 'none';
        updateProcessButton();
    });

    // Initial UI
    updateWalletUI();
}

window.initVideoUploadPage = initVideoUploadPage;
