/**
 * Blue Railroad Mint Submission Page
 * Handles wallet connection, IPFS pinning, and token minting
 */

import { createAppKit } from '@reown/appkit';
import { optimism } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { reconnect, getAccount, writeContract, waitForTransactionReceipt, signMessage } from '@wagmi/core';

// Blue Railroad contract config
const BR_CONTRACT = '0xCe09A2d0d0BDE635722D8EF31901b430E651dB52';
const BR_ABI = [{
    inputs: [
        { internalType: 'address', name: 'recipient', type: 'address' },
        { internalType: 'uint32', name: 'songId', type: 'uint32' },
        { internalType: 'uint32', name: 'date', type: 'uint32' },
        { internalType: 'string', name: 'uri', type: 'string' }
    ],
    name: 'issueTony',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}];

// Setup Web3Modal
const projectId = 'c4f79cc821d56e59de850c9b35cbbe86';
const metadata = {
    name: 'Blue Railroad Admin',
    description: 'Mint Blue Railroad exercise tokens',
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

// Initialize on page load
export function initMintPage(submissionData) {
    const {
        id,
        songId,
        videoUrl,
        recipients,
        pinningService,
        pickipediaUrl
    } = submissionData;

    // Current video URI - starts as the original URL, updated if pinned to IPFS
    let currentVideoUri = videoUrl;

    // Use today's date for the mint
    const today = new Date();
    const mintDate = parseInt(`${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`, 10);

    // Reconnect any existing wallet sessions
    reconnect(wagmiConfig);

    // DOM elements - wallet
    const connectBtn = document.getElementById('connect-wallet-btn');
    const notConnectedMsg = document.getElementById('not-connected-msg');
    const connectedAddress = document.getElementById('connected-address');

    // DOM elements - pinning
    const pinBtn = document.getElementById('pin-btn');
    const pinNotStarted = document.getElementById('pin-not-started');
    const pinInProgress = document.getElementById('pin-in-progress');
    const pinProgressText = document.getElementById('pin-progress-text');
    const pinComplete = document.getElementById('pin-complete');
    const ipfsCid = document.getElementById('ipfs-cid');
    const pinError = document.getElementById('pin-error');

    // DOM elements - minting
    const mintBtn = document.getElementById('mint-btn');
    const statusArea = document.getElementById('status-area');
    const pendingMsg = document.getElementById('pending-msg');
    const pendingText = document.getElementById('pending-text');
    const successMsg = document.getElementById('success-msg');
    const successText = document.getElementById('success-text');
    const txLinks = document.getElementById('tx-links');
    const errorMsg = document.getElementById('error-msg');

    // Wallet connection UI update
    function updateWalletUI() {
        const account = getAccount(wagmiConfig);
        if (account.address) {
            notConnectedMsg.style.display = 'none';
            connectedAddress.style.display = 'block';
            connectedAddress.textContent = account.address;
            connectBtn.textContent = 'Connected';
            mintBtn.disabled = false;
            if (pinBtn) pinBtn.disabled = false;
        } else {
            notConnectedMsg.style.display = 'block';
            connectedAddress.style.display = 'none';
            connectBtn.textContent = 'Connect Wallet';
            mintBtn.disabled = true;
            if (pinBtn) pinBtn.disabled = true;
        }
    }

    // Connect wallet button
    connectBtn.addEventListener('click', () => {
        modal.open();
    });

    // Subscribe to wallet state changes
    wagmiAdapter.wagmiConfig.subscribe(
        (state) => state.current,
        () => updateWalletUI()
    );

    // Pin to IPFS handler (requires wallet auth)
    if (pinBtn && videoUrl) {
        pinBtn.addEventListener('click', async () => {
            const account = getAccount(wagmiConfig);
            if (!account.address) {
                pinError.textContent = 'Please connect your wallet first';
                pinError.style.display = 'block';
                return;
            }

            pinBtn.disabled = true;
            pinNotStarted.style.display = 'none';
            pinInProgress.style.display = 'block';
            pinError.style.display = 'none';
            pinProgressText.textContent = 'Signing authorization...';

            try {
                // Create auth message and sign it
                const timestamp = Date.now();
                const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;

                const signature = await signMessage(wagmiConfig, {
                    message: authMessage
                });

                pinProgressText.textContent = 'Downloading video from source...';

                // Show progress updates while waiting
                let progressTimer = setTimeout(() => {
                    pinProgressText.textContent = 'Uploading to IPFS (this may take a minute for large videos)...';
                }, 5000);

                const response = await fetch(pinningService, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Signature': signature,
                        'X-Timestamp': timestamp.toString()
                    },
                    body: JSON.stringify({ url: videoUrl })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'HTTP ' + response.status);
                }

                clearTimeout(progressTimer);
                const data = await response.json();

                if (data.cid) {
                    currentVideoUri = 'ipfs://' + data.cid;
                    pinInProgress.style.display = 'none';
                    pinComplete.style.display = 'block';
                    ipfsCid.textContent = data.cid;
                    console.log('Video pinned to IPFS:', data.cid);
                } else {
                    throw new Error('No CID returned from pinning service');
                }
            } catch (err) {
                console.error('Pinning error:', err);
                pinInProgress.style.display = 'none';
                pinNotStarted.style.display = 'block';
                pinError.textContent = 'Pinning failed: ' + err.message;
                pinError.style.display = 'block';
                pinBtn.disabled = false;
            }
        });
    }

    // Mint handler
    mintBtn.addEventListener('click', async () => {
        statusArea.style.display = 'block';
        pendingMsg.style.display = 'block';
        successMsg.style.display = 'none';
        errorMsg.style.display = 'none';
        mintBtn.disabled = true;

        const txResults = [];

        try {
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];
                pendingText.textContent = `Minting token ${i + 1} of ${recipients.length} for ${recipient.slice(0, 10)}...`;

                const hash = await writeContract(wagmiConfig, {
                    address: BR_CONTRACT,
                    abi: BR_ABI,
                    functionName: 'issueTony',
                    args: [recipient, songId, mintDate, currentVideoUri],
                    chainId: 10
                });

                pendingText.textContent = `Waiting for confirmation (${i + 1}/${recipients.length})...`;

                await waitForTransactionReceipt(wagmiConfig, {
                    hash,
                    chainId: 10
                });

                txResults.push({ recipient, hash, success: true });
            }

            pendingMsg.style.display = 'none';
            successMsg.style.display = 'block';
            successText.textContent = `Successfully minted ${txResults.length} token${txResults.length > 1 ? 's' : ''}!`;

            // Build transaction links
            let linksHtml = txResults.map(r =>
                `<div><a href="https://optimistic.etherscan.io/tx/${r.hash}" target="_blank">${r.recipient.slice(0, 10)}... → View TX</a></div>`
            ).join('');

            // Add reminder to update wiki status
            if (pickipediaUrl) {
                linksHtml += `<div class="mt-3 p-2 border rounded bg-light">
                    <strong>Next step:</strong> Update the submission status to "Minted" on PickiPedia<br>
                    <a href="${pickipediaUrl}?action=edit" target="_blank" class="btn btn-sm btn-outline-primary mt-1">Edit Submission Page</a>
                </div>`;
            }

            txLinks.innerHTML = linksHtml;

        } catch (err) {
            console.error('Mint error:', err);
            pendingMsg.style.display = 'none';

            if (txResults.length > 0) {
                successMsg.style.display = 'block';
                successText.textContent = `Minted ${txResults.length} token${txResults.length > 1 ? 's' : ''} before error:`;
                txLinks.innerHTML = txResults.map(r =>
                    `<div><a href="https://optimistic.etherscan.io/tx/${r.hash}" target="_blank">${r.recipient.slice(0, 10)}... → View TX</a></div>`
                ).join('');
            }

            errorMsg.textContent = err.message || 'Transaction failed';
            errorMsg.style.display = 'block';
        } finally {
            mintBtn.disabled = false;
        }
    });

    // Initial UI update
    updateWalletUI();
}

// Make it available globally for the template to call
window.initMintPage = initMintPage;
