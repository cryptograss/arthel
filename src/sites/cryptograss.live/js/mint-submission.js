/**
 * Blue Railroad Mint/Upgrade Page
 * Handles wallet connection, IPFS pinning, and token minting or V1→V2 migration
 */

import { createAppKit } from '@reown/appkit';
import { optimism } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { reconnect, getAccount, writeContract, readContract, waitForTransactionReceipt, signMessage, getEnsAddress } from '@wagmi/core';
import { mainnet } from '@reown/appkit/networks';

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

// Base58 alphabet for CIDv0 decoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Base32 alphabet for CIDv1 decoding (RFC 4648, lowercase)
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base58Decode(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const index = BASE58_ALPHABET.indexOf(char);
        if (index === -1) throw new Error(`Invalid base58 character: ${char}`);

        let carry = index;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    // Handle leading zeros
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
        bytes.push(0);
    }

    return new Uint8Array(bytes.reverse());
}

function base32Decode(str) {
    // Remove padding if present
    str = str.replace(/=+$/, '').toLowerCase();

    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) throw new Error(`Invalid base32 character: ${char}`);

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }

    return new Uint8Array(output);
}

// Read a varint from bytes at given offset, return [value, bytesRead]
function readVarint(bytes, offset) {
    let value = 0;
    let shift = 0;
    let bytesRead = 0;

    while (offset + bytesRead < bytes.length) {
        const byte = bytes[offset + bytesRead];
        value |= (byte & 0x7f) << shift;
        bytesRead++;
        if ((byte & 0x80) === 0) break;
        shift += 7;
    }

    return [value, bytesRead];
}

// Convert IPFS CID to bytes32 hash
// Supports both CIDv0 (Qm...) and CIDv1 (bafy...)
function cidToBytes32(cid) {
    if (!cid) return '0x0000000000000000000000000000000000000000000000000000000000000000';

    // If it's already a hex string (0x...), validate and return
    if (cid.startsWith('0x')) {
        if (cid.length === 66) return cid;
        throw new Error('Invalid bytes32 hex string');
    }

    let hashBytes;

    // CIDv0 starts with Qm (base58btc encoded)
    if (cid.startsWith('Qm')) {
        const decoded = base58Decode(cid);

        // CIDv0 structure: 0x12 (sha256) + 0x20 (32 bytes) + 32 bytes hash
        if (decoded.length !== 34) {
            throw new Error(`Invalid CIDv0 length: expected 34 bytes, got ${decoded.length}`);
        }
        if (decoded[0] !== 0x12 || decoded[1] !== 0x20) {
            throw new Error('Invalid CIDv0 prefix: expected sha256 multihash');
        }

        hashBytes = decoded.slice(2);
    }
    // CIDv1 starts with 'b' (base32lower) - common format is bafy... or bafybei...
    else if (cid.startsWith('b')) {
        // Remove the 'b' multibase prefix and decode base32
        const decoded = base32Decode(cid.slice(1));

        let offset = 0;

        // Read CID version (should be 1)
        const [version, versionBytes] = readVarint(decoded, offset);
        offset += versionBytes;
        if (version !== 1) {
            throw new Error(`Unexpected CID version: ${version}`);
        }

        // Read codec (0x70 = dag-pb, 0x55 = raw, 0x71 = dag-cbor)
        const [codec, codecBytes] = readVarint(decoded, offset);
        offset += codecBytes;
        // We don't need the codec value, just skip it

        // Read multihash: hash function code
        const [hashFn, hashFnBytes] = readVarint(decoded, offset);
        offset += hashFnBytes;
        if (hashFn !== 0x12) {
            throw new Error(`Unsupported hash function: 0x${hashFn.toString(16)} (expected sha256 0x12)`);
        }

        // Read multihash: digest length
        const [digestLen, digestLenBytes] = readVarint(decoded, offset);
        offset += digestLenBytes;
        if (digestLen !== 32) {
            throw new Error(`Unexpected digest length: ${digestLen} (expected 32)`);
        }

        // Extract the 32-byte hash
        hashBytes = decoded.slice(offset, offset + 32);
        if (hashBytes.length !== 32) {
            throw new Error(`Could not extract 32-byte hash from CIDv1`);
        }
    }
    else {
        throw new Error('Unsupported CID format. Expected CIDv0 (Qm...) or CIDv1 (b...)');
    }

    return '0x' + Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
        // Upgrade-specific fields
        isUpgrade = false,
        v1TokenId = null
    } = submissionData;

    // Convert relative video URLs to absolute (needed for external pinning service)
    const absoluteVideoUrl = videoUrl && videoUrl.startsWith('/')
        ? new URL(videoUrl, window.location.origin).href
        : videoUrl;

    // Current video URI - starts as the original URL, updated if pinned to IPFS
    let currentVideoUri = absoluteVideoUrl;
    let currentIpfsCid = null; // Track the CID separately for bytes32 conversion

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

    // Pin to IPFS handler (requires wallet auth)
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

            try {
                // Create auth message and sign it
                const timestamp = Date.now();
                const authMessage = `Authorize Blue Railroad pinning\nTimestamp: ${timestamp}`;

                const signature = await signMessage(wagmiConfig, {
                    message: authMessage
                });

                pinProgressText.textContent = 'Downloading video and checking IPFS...';

                // Show progress updates while waiting
                let progressTimer = setTimeout(() => {
                    pinProgressText.textContent = 'Uploading to IPFS (this may take a minute for large videos)...';
                }, 10000); // Give 10s for download + check before showing upload message

                const response = await fetch(pinningService, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Signature': signature,
                        'X-Timestamp': timestamp.toString()
                    },
                    body: JSON.stringify({ url: absoluteVideoUrl })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'HTTP ' + response.status);
                }

                clearTimeout(progressTimer);
                const data = await response.json();

                if (data.cid) {
                    currentVideoUri = 'ipfs://' + data.cid;
                    currentIpfsCid = data.cid;
                    pinInProgress.style.display = 'none';
                    pinComplete.style.display = 'block';

                    if (data.alreadyPinned) {
                        ipfsCid.innerHTML = `<span class="text-success">Already pinned:</span> ${data.cid}`;
                        console.log('Video already pinned to IPFS:', data.cid);
                    } else {
                        ipfsCid.textContent = data.cid;
                        console.log('Video pinned to IPFS:', data.cid);
                    }
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
            // Convert IPFS CID to bytes32 for V2 contract
            const videoHash = cidToBytes32(currentIpfsCid);

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
