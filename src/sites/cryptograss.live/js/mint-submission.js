/**
 * Blue Railroad Mint/Upgrade Page
 * Handles wallet connection, IPFS pinning, and token minting or V1→V2 migration
 */

import { createAppKit } from '@reown/appkit';
import { optimism } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { reconnect, getAccount, writeContract, readContract, waitForTransactionReceipt, signMessage, getEnsAddress } from '@wagmi/core';
import { mainnet } from '@reown/appkit/networks';
import { cidToBytes32, validateCidForMinting, ZERO_HASH } from './cid-utils.js';

// Blue Railroad V1 contract config
const BR_V1_CONTRACT = '0xCe09A2d0d0BDE635722D8EF31901b430E651dB52';
const BR_V1_ABI = [
    {
        inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
        name: 'ownerOf',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
        name: 'getApproved',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [
            { internalType: 'address', name: 'to', type: 'address' },
            { internalType: 'uint256', name: 'tokenId', type: 'uint256' }
        ],
        name: 'approve',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];

// Blue Railroad V2 contract config
const BR_V2_CONTRACT = '0x7C3aEBcD477C591EbCde3bC247B3A9531814B4B7';
const BR_V2_ABI = [
    {
        inputs: [
            { internalType: 'address', name: 'recipient', type: 'address' },
            { internalType: 'uint8', name: 'songId', type: 'uint8' },
            { internalType: 'uint256', name: 'blockheight', type: 'uint256' },
            { internalType: 'bytes32', name: 'videoHash', type: 'bytes32' }
        ],
        name: 'issueTony',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        inputs: [
            { internalType: 'uint32', name: 'v1TokenId', type: 'uint32' },
            { internalType: 'uint8', name: 'songId', type: 'uint8' },
            { internalType: 'uint256', name: 'blockheight', type: 'uint256' },
            { internalType: 'bytes32', name: 'videoHash', type: 'bytes32' }
        ],
        name: 'migrateFromV1',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];

// Setup Web3Modal
const projectId = '3e6e7e58a5918c44fa42816d90b735a6';
const metadata = {
    name: 'Blue Railroad Admin',
    description: 'Mint Blue Railroad exercise tokens',
    url: 'https://cryptograss.live',
    icons: ['https://cryptograss.live/favicon.ico']
};

const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [optimism, mainnet]  // mainnet needed for ENS resolution
});

const modal = createAppKit({
    adapters: [wagmiAdapter],
    networks: [optimism],
    metadata,
    projectId,
    features: { analytics: false }
});

const wagmiConfig = wagmiAdapter.wagmiConfig;

// Resolve ENS name to address (returns original if already an address)
async function resolveRecipient(recipient) {
    // If it's already a hex address, return as-is
    if (recipient.startsWith('0x') && recipient.length === 42) {
        return recipient;
    }
    // Otherwise try to resolve as ENS name
    const resolved = await getEnsAddress(wagmiConfig, {
        name: recipient,
        chainId: 1  // ENS is on mainnet
    });
    if (!resolved) {
        throw new Error(`Could not resolve ENS name: ${recipient}`);
    }
    return resolved;
}

// Initialize on page load
export function initMintPage(submissionData) {
    const {
        id,
        songId,
        blockHeight,
        videoUrl,
        recipients,
        pinningService,
        pickipediaUrl,
        ipfsCid: preloadedIpfsCid = null,
        // Upgrade-specific fields
        isUpgrade = false,
        v1TokenId = null
    } = submissionData;

    // Convert relative video URLs to absolute (needed for external pinning service)
    const absoluteVideoUrl = videoUrl && videoUrl.startsWith('/')
        ? new URL(videoUrl, window.location.origin).href
        : videoUrl;

    // Current video URI - starts as the original URL, updated if pinned to IPFS
    let currentVideoUri = preloadedIpfsCid ? `ipfs://${preloadedIpfsCid}` : absoluteVideoUrl;
    let currentIpfsCid = preloadedIpfsCid; // Track the CID separately for bytes32 conversion

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
    const pinProgressBar = document.getElementById('pin-progress-bar');
    const pinComplete = document.getElementById('pin-complete');
    const ipfsCid = document.getElementById('ipfs-cid');
    const pinError = document.getElementById('pin-error');

    // If CID is preloaded from PickiPedia, show the already-pinned state
    if (preloadedIpfsCid && pinNotStarted && pinComplete && ipfsCid) {
        pinNotStarted.style.display = 'none';
        pinComplete.style.display = 'block';
        ipfsCid.innerHTML = `<span class="text-success" title="CID loaded from PickiPedia">💾</span> ${preloadedIpfsCid}`;
        if (pinBtn) pinBtn.style.display = 'none';
        console.log('Preloaded IPFS CID from PickiPedia:', preloadedIpfsCid);
    }

    // DOM elements - approval (upgrade only)
    const approvalSection = document.getElementById('approval-section');
    const approveBtn = document.getElementById('approve-btn');
    const approvalNotStarted = document.getElementById('approval-not-started');
    const approvalInProgress = document.getElementById('approval-in-progress');
    const approvalComplete = document.getElementById('approval-complete');
    const approvalError = document.getElementById('approval-error');

    // DOM elements - minting/migration
    const mintBtn = document.getElementById('mint-btn');
    const statusArea = document.getElementById('status-area');
    const pendingMsg = document.getElementById('pending-msg');
    const pendingText = document.getElementById('pending-text');
    const successMsg = document.getElementById('success-msg');
    const successText = document.getElementById('success-text');
    const txLinks = document.getElementById('tx-links');
    const errorMsg = document.getElementById('error-msg');

    // Track approval state for upgrades
    let isApproved = false;

    // Wallet connection UI update
    function updateWalletUI() {
        const account = getAccount(wagmiConfig);
        if (account.address) {
            notConnectedMsg.style.display = 'none';
            connectedAddress.style.display = 'block';
            connectedAddress.textContent = account.address;
            connectBtn.textContent = 'Connected';
            mintBtn.disabled = false;
            // Clear any previous "connect wallet" error when wallet connects
            if (pinError) pinError.style.display = 'none';
        } else {
            notConnectedMsg.style.display = 'block';
            connectedAddress.style.display = 'none';
            connectBtn.textContent = 'Connect Wallet';
            mintBtn.disabled = true;
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

    // Manual CID entry handler (for submissions where video was already pinned externally)
    const manualCidInput = document.getElementById('manual-cid-input');
    const useCidBtn = document.getElementById('use-cid-btn');

    if (useCidBtn && manualCidInput) {
        useCidBtn.addEventListener('click', () => {
            const cid = manualCidInput.value.trim();
            if (!cid) {
                pinError.textContent = 'Please enter a CID';
                pinError.style.display = 'block';
                return;
            }

            // Validate the CID format
            const validation = validateCidForMinting(cid);
            if (!validation.valid) {
                pinError.textContent = validation.error;
                pinError.style.display = 'block';
                return;
            }

            // Set the CID
            currentIpfsCid = cid;
            currentVideoUri = 'ipfs://' + cid;

            // Update UI to show CID is set
            pinNotStarted.style.display = 'none';
            pinComplete.style.display = 'block';
            ipfsCid.textContent = cid;
            pinError.style.display = 'none';

            console.log('Manual CID set:', cid);
        });
    }

    // Pin to IPFS handler (requires wallet auth) - uses SSE streaming for progress
    if (pinBtn && videoUrl) {
        pinBtn.addEventListener('click', async () => {
            const account = getAccount(wagmiConfig);
            if (!account.address) {
                pinError.innerHTML = '<strong>Wallet not connected.</strong> Please connect your wallet first (Step 1 above).';
                pinError.style.display = 'block';
                // Scroll to make sure error is visible
                pinError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            pinBtn.disabled = true;
            pinNotStarted.style.display = 'none';
            pinInProgress.style.display = 'block';
            pinError.style.display = 'none';
            pinProgressText.textContent = 'Signing authorization...';
            if (pinProgressBar) pinProgressBar.style.width = '0%';

            try {
                // Create auth message and sign it
                const timestamp = Date.now();
                const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;

                const signature = await signMessage(wagmiConfig, {
                    message: authMessage
                });

                pinProgressText.textContent = 'Starting upload process...';

                // Use streaming endpoint for real-time progress
                const streamEndpoint = pinningService.replace('/pin-from-url', '/pin-from-url-stream');
                const response = await fetch(streamEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Signature': signature,
                        'X-Timestamp': timestamp.toString()
                    },
                    body: JSON.stringify({ url: absoluteVideoUrl, submissionId: id })
                });

                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
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

                    // Process complete SSE events (data: {...}\n\n)
                    const events = buffer.split('\n\n');
                    buffer = events.pop(); // Keep incomplete event in buffer

                    for (const eventStr of events) {
                        if (!eventStr.startsWith('data: ')) continue;

                        let event;
                        try {
                            event = JSON.parse(eventStr.slice(6));
                        } catch (jsonErr) {
                            console.warn('SSE JSON parse warning:', jsonErr, eventStr);
                            continue;
                        }

                        console.log('Pin progress:', event);

                        // Update UI based on event
                        if (event.stage === 'error') {
                            throw new Error(event.message);
                        } else if (event.stage === 'complete') {
                            finalResult = event;
                            if (pinProgressBar) pinProgressBar.style.width = '100%';
                        } else if (event.stage === 'wiki-update') {
                            // Show wiki update progress
                            pinProgressText.textContent = event.message || 'Saving CID to PickiPedia...';
                            if (event.progress && pinProgressBar) {
                                pinProgressBar.style.width = event.progress + '%';
                            }
                        } else {
                            if (event.message) {
                                pinProgressText.textContent = event.message;
                            }
                            if (event.progress && pinProgressBar) {
                                pinProgressBar.style.width = event.progress + '%';
                            }
                        }
                    }
                }

                if (finalResult && finalResult.cid) {
                    currentVideoUri = 'ipfs://' + finalResult.cid;
                    currentIpfsCid = finalResult.cid;
                    pinInProgress.style.display = 'none';
                    pinComplete.style.display = 'block';

                    // Build status message
                    let statusHtml = '';
                    if (finalResult.alreadyPinned) {
                        statusHtml = `<span class="text-success">Already pinned:</span> `;
                    }
                    if (finalResult.transcoded) {
                        const origMB = (finalResult.originalSize / 1024 / 1024).toFixed(1);
                        const newMB = (finalResult.transcodedSize / 1024 / 1024).toFixed(1);
                        statusHtml += `<span class="text-info" title="Transcoded from ${origMB}MB to ${newMB}MB">📹</span> `;
                    }
                    // Show wiki update status (if CID was saved to PickiPedia)
                    if (finalResult.wikiUpdate) {
                        if (finalResult.wikiUpdate.action === 'updated') {
                            statusHtml += `<span class="text-success" title="CID saved to PickiPedia">💾</span> `;
                        } else if (finalResult.wikiUpdate.action === 'error') {
                            console.warn('Wiki update failed:', finalResult.wikiUpdate.message);
                        }
                    }
                    statusHtml += finalResult.cid;
                    ipfsCid.innerHTML = statusHtml;

                    console.log('Video pinned to IPFS:', finalResult);
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

    // Approval handler (upgrades only)
    if (isUpgrade && approveBtn) {
        approveBtn.addEventListener('click', async () => {
            const account = getAccount(wagmiConfig);
            if (!account.address) {
                approvalError.innerHTML = '<strong>Wallet not connected.</strong> Please connect your wallet first.';
                approvalError.style.display = 'block';
                return;
            }

            approveBtn.disabled = true;
            approvalNotStarted.style.display = 'none';
            approvalInProgress.style.display = 'block';
            approvalError.style.display = 'none';

            try {
                // Check if user owns the V1 token
                const owner = await readContract(wagmiConfig, {
                    address: BR_V1_CONTRACT,
                    abi: BR_V1_ABI,
                    functionName: 'ownerOf',
                    args: [v1TokenId],
                    chainId: 10
                });

                if (owner.toLowerCase() !== account.address.toLowerCase()) {
                    throw new Error(`You don't own V1 Token #${v1TokenId}. Current owner: ${owner.slice(0, 10)}...`);
                }

                // Check if already approved
                const approvedFor = await readContract(wagmiConfig, {
                    address: BR_V1_CONTRACT,
                    abi: BR_V1_ABI,
                    functionName: 'getApproved',
                    args: [v1TokenId],
                    chainId: 10
                });

                if (approvedFor.toLowerCase() === BR_V2_CONTRACT.toLowerCase()) {
                    // Already approved
                    isApproved = true;
                    approvalInProgress.style.display = 'none';
                    approvalComplete.style.display = 'block';
                    approvalComplete.innerHTML = '<span class="badge bg-success">Already Approved</span>';
                    mintBtn.disabled = false;
                    return;
                }

                // Send approval transaction
                const hash = await writeContract(wagmiConfig, {
                    address: BR_V1_CONTRACT,
                    abi: BR_V1_ABI,
                    functionName: 'approve',
                    args: [BR_V2_CONTRACT, v1TokenId],
                    chainId: 10
                });

                await waitForTransactionReceipt(wagmiConfig, {
                    hash,
                    chainId: 10
                });

                isApproved = true;
                approvalInProgress.style.display = 'none';
                approvalComplete.style.display = 'block';
                mintBtn.disabled = false;
            } catch (err) {
                console.error('Approval error:', err);
                approvalInProgress.style.display = 'none';
                approvalNotStarted.style.display = 'block';
                approvalError.textContent = 'Approval failed: ' + err.message;
                approvalError.style.display = 'block';
                approveBtn.disabled = false;
            }
        });
    }

    // Mint/Migrate handler
    mintBtn.addEventListener('click', async () => {
        statusArea.style.display = 'block';
        pendingMsg.style.display = 'block';
        successMsg.style.display = 'none';
        errorMsg.style.display = 'none';
        mintBtn.disabled = true;

        const txResults = [];

        try {
            // Validate CID before minting
            const validation = validateCidForMinting(currentIpfsCid);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            const videoHash = validation.hash;

            // Verify CID is accessible on gateway (optional but recommended)
            try {
                const verifyResponse = await fetch(`https://ipfs.delivery-kid.cryptograss.live/ipfs/${currentIpfsCid}`, {
                    method: 'HEAD'
                });
                if (!verifyResponse.ok) {
                    throw new Error('Video not yet available on IPFS gateway - please wait and retry');
                }
            } catch (verifyErr) {
                // CORS errors are expected for HEAD requests to gateway, continue anyway
                if (verifyErr.message.includes('gateway')) {
                    throw verifyErr;
                }
                console.warn('Could not verify CID on gateway (CORS expected):', verifyErr.message);
            }

            if (isUpgrade) {
                // V1→V2 migration flow
                pendingText.textContent = `Migrating V1 Token #${v1TokenId} to V2...`;

                const hash = await writeContract(wagmiConfig, {
                    address: BR_V2_CONTRACT,
                    abi: BR_V2_ABI,
                    functionName: 'migrateFromV1',
                    args: [v1TokenId, songId, blockHeight, videoHash],
                    chainId: 10
                });

                pendingText.textContent = 'Waiting for confirmation...';

                await waitForTransactionReceipt(wagmiConfig, {
                    hash,
                    chainId: 10
                });

                txResults.push({ tokenId: v1TokenId, hash, success: true });

                pendingMsg.style.display = 'none';
                successMsg.style.display = 'block';
                successText.textContent = `Successfully migrated Token #${v1TokenId} to V2!`;
            } else {
                // Standard minting flow
                for (let i = 0; i < recipients.length; i++) {
                    const recipientInput = recipients[i];
                    pendingText.textContent = `Resolving ${recipientInput}...`;

                    // Resolve ENS name if needed
                    const recipient = await resolveRecipient(recipientInput);
                    pendingText.textContent = `Minting token ${i + 1} of ${recipients.length} for ${recipientInput}...`;

                    const hash = await writeContract(wagmiConfig, {
                        address: BR_V2_CONTRACT,
                        abi: BR_V2_ABI,
                        functionName: 'issueTony',
                        args: [recipient, songId, blockHeight, videoHash],
                        chainId: 10
                    });

                    pendingText.textContent = `Waiting for confirmation (${i + 1}/${recipients.length})...`;

                    await waitForTransactionReceipt(wagmiConfig, {
                        hash,
                        chainId: 10
                    });

                    txResults.push({ recipient: recipientInput, resolvedAddress: recipient, hash, success: true });
                }

                pendingMsg.style.display = 'none';
                successMsg.style.display = 'block';
                successText.textContent = `Successfully minted ${txResults.length} token${txResults.length > 1 ? 's' : ''}!`;
            }

            // Build transaction links
            let linksHtml;
            if (isUpgrade) {
                linksHtml = txResults.map(r =>
                    `<div><a href="https://optimistic.etherscan.io/tx/${r.hash}" target="_blank">Token #${r.tokenId} → View TX</a></div>`
                ).join('');
            } else {
                linksHtml = txResults.map(r =>
                    `<div><a href="https://optimistic.etherscan.io/tx/${r.hash}" target="_blank">${r.recipient.slice(0, 10)}... → View TX</a></div>`
                ).join('');
            }

            // Add reminder to update wiki status
            if (pickipediaUrl) {
                const actionText = isUpgrade ? 'Upgraded' : 'Minted';
                linksHtml += `<div class="mt-3 p-2 border rounded bg-light">
                    <strong>Next step:</strong> Update the submission status to "${actionText}" on PickiPedia<br>
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
