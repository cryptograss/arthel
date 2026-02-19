/**
 * Generic IPFS Upload Page
 * Handles wallet connection, authorization check, and file upload to pinning service
 */

import { createAppKit } from '@reown/appkit';
import { optimism } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { reconnect, getAccount, signMessage } from '@wagmi/core';

// Setup Web3Modal
const projectId = 'c4f79cc821d56e59de850c9b35cbbe86';
const metadata = {
    name: 'Cryptograss Upload',
    description: 'Pin files to IPFS',
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

export function initUploadPage(options) {
    const { pinningService, gateway } = options;

    // Reconnect existing wallet sessions
    reconnect(wagmiConfig);

    // State
    let selectedFile = null;
    let isAuthorized = false;

    // DOM elements
    const connectBtn = document.getElementById('connect-wallet-btn');
    const notConnectedMsg = document.getElementById('not-connected-msg');
    const connectedAddress = document.getElementById('connected-address');
    const authorizationStatus = document.getElementById('authorization-status');

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const browseLink = document.getElementById('browse-link');
    const selectedFileText = document.getElementById('selected-file');
    const uploadBtn = document.getElementById('upload-btn');

    const uploadProgress = document.getElementById('upload-progress');
    const uploadProgressText = document.getElementById('upload-progress-text');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const uploadError = document.getElementById('upload-error');

    const resultSection = document.getElementById('result-section');
    const resultCid = document.getElementById('result-cid');
    const copyCidBtn = document.getElementById('copy-cid-btn');
    const gatewayLink = document.getElementById('gateway-link');
    const uploadDetails = document.getElementById('upload-details');
    const uploadAnotherBtn = document.getElementById('upload-another-btn');

    // Update wallet UI and check authorization
    async function updateWalletUI() {
        const account = getAccount(wagmiConfig);
        if (account.address) {
            notConnectedMsg.style.display = 'none';
            connectedAddress.style.display = 'block';
            connectedAddress.textContent = account.address;
            connectBtn.textContent = 'Connected';

            // Check authorization
            authorizationStatus.style.display = 'block';
            authorizationStatus.textContent = 'Checking authorization...';
            authorizationStatus.className = 'small mt-2';

            try {
                // We'll verify authorization when they try to upload
                // For now, assume authorized and let the server reject if not
                isAuthorized = true;
                authorizationStatus.textContent = 'Wallet connected. Authorization will be verified on upload.';
                authorizationStatus.className = 'small mt-2 authorized';
                updateUploadButton();
            } catch (err) {
                console.error('Authorization check failed:', err);
                authorizationStatus.textContent = 'Could not verify authorization';
                authorizationStatus.className = 'small mt-2 not-authorized';
            }
        } else {
            notConnectedMsg.style.display = 'block';
            connectedAddress.style.display = 'none';
            authorizationStatus.style.display = 'none';
            connectBtn.textContent = 'Connect Wallet';
            isAuthorized = false;
            updateUploadButton();
        }
    }

    function updateUploadButton() {
        const account = getAccount(wagmiConfig);
        uploadBtn.disabled = !account.address || !selectedFile;
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
            selectFile(e.target.files[0]);
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
            selectFile(e.dataTransfer.files[0]);
        }
    });

    function selectFile(file) {
        selectedFile = file;
        const sizeStr = formatFileSize(file.size);
        selectedFileText.textContent = `${file.name} (${sizeStr})`;
        updateUploadButton();
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

        if (!selectedFile) {
            uploadError.textContent = 'Please select a file first.';
            uploadError.style.display = 'block';
            return;
        }

        uploadBtn.disabled = true;
        uploadError.style.display = 'none';
        uploadProgress.style.display = 'block';
        uploadProgressText.textContent = 'Signing authorization...';
        uploadProgressBar.style.width = '0%';

        try {
            // Create auth message and sign it
            const timestamp = Date.now();
            const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;

            const signature = await signMessage(wagmiConfig, {
                message: authMessage
            });

            uploadProgressText.textContent = 'Uploading file...';
            uploadProgressBar.style.width = '10%';

            // Create form data
            const formData = new FormData();
            formData.append('file', selectedFile);

            // Use XMLHttpRequest for progress tracking
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 80) + 10; // 10-90%
                    uploadProgressBar.style.width = percent + '%';
                    uploadProgressText.textContent = `Uploading... ${Math.round(e.loaded / e.total * 100)}%`;
                }
            });

            const result = await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(JSON.parse(xhr.responseText));
                        } catch (e) {
                            reject(new Error('Invalid server response'));
                        }
                    } else {
                        try {
                            const errData = JSON.parse(xhr.responseText);
                            reject(new Error(errData.error || `HTTP ${xhr.status}`));
                        } catch {
                            reject(new Error(`HTTP ${xhr.status}`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('Network error'));

                xhr.open('POST', pinningService);
                xhr.setRequestHeader('X-Signature', signature);
                xhr.setRequestHeader('X-Timestamp', timestamp.toString());
                xhr.send(formData);
            });

            uploadProgressBar.style.width = '100%';
            uploadProgressText.textContent = 'Complete!';

            // Show result
            setTimeout(() => {
                uploadProgress.style.display = 'none';
                resultSection.style.display = 'block';

                resultCid.value = result.cid;
                const gatewayUrl = `${gateway}/${result.cid}`;
                gatewayLink.href = gatewayUrl;
                gatewayLink.textContent = gatewayUrl;

                // Build details
                let details = [];
                if (result.size) {
                    details.push(`Size: ${formatFileSize(result.size)}`);
                }
                if (result.pinned) {
                    details.push('Pinned to Pinata');
                }
                if (result.localPinned) {
                    details.push('Pinned locally');
                }
                uploadDetails.textContent = details.join(' | ');
            }, 500);

        } catch (err) {
            console.error('Upload error:', err);
            uploadProgress.style.display = 'none';
            uploadError.textContent = err.message || 'Upload failed';
            uploadError.style.display = 'block';
            uploadBtn.disabled = false;
        }
    });

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
        selectedFile = null;
        selectedFileText.textContent = '';
        fileInput.value = '';
        uploadBtn.disabled = false;
        updateUploadButton();
    });

    // Initial UI update
    updateWalletUI();
}

// Make available globally
window.initUploadPage = initUploadPage;
