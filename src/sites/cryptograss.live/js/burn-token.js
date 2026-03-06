/**
 * Blue Railroad Token Burn Page
 * Handles wallet connection and token burning (transfer to 0x...dEaD)
 */

import { reconnect, getAccount, writeContract, readContract, waitForTransactionReceipt } from '@wagmi/core';
import { createWalletConnection } from './wallet-utils.js';

// Burn address - the standard "dead" address
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

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
        inputs: [
            { internalType: 'address', name: 'from', type: 'address' },
            { internalType: 'address', name: 'to', type: 'address' },
            { internalType: 'uint256', name: 'tokenId', type: 'uint256' }
        ],
        name: 'transferFrom',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];

// Blue Railroad V2 contract config
const BR_V2_CONTRACT = '0x7C3aEBcD477C591EbCde3bC247B3A9531814B4B7';
const BR_V2_ABI = [
    {
        inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
        name: 'ownerOf',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [
            { internalType: 'address', name: 'from', type: 'address' },
            { internalType: 'address', name: 'to', type: 'address' },
            { internalType: 'uint256', name: 'tokenId', type: 'uint256' }
        ],
        name: 'transferFrom',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
];

// Setup wallet connection with error handling
const wallet = createWalletConnection({
    name: 'Blue Railroad Admin',
    description: 'Burn Blue Railroad tokens'
});

const { modal, wagmiAdapter, wagmiConfig } = wallet || {};

// Get contract config based on version
function getContractConfig(version) {
    if (version === 'v1') {
        return { address: BR_V1_CONTRACT, abi: BR_V1_ABI };
    }
    return { address: BR_V2_CONTRACT, abi: BR_V2_ABI };
}

// Initialize on page load
export function initBurnPage() {
    // Check if wallet connection was successfully initialized
    if (!wallet) {
        console.error('[Burn] Wallet connection failed to initialize');
        console.error('[Burn] Check earlier [Reown] errors in console for details');
        const errorDiv = document.getElementById('error-msg');
        if (errorDiv) {
            errorDiv.textContent = 'Wallet connection failed to initialize. Check console for details.';
            errorDiv.style.display = 'block';
        }
        return;
    }

    // Reconnect any existing wallet sessions
    try {
        reconnect(wagmiConfig);
    } catch (err) {
        console.error('[Burn] reconnect() failed:', err);
    }

    // DOM elements
    const tokenIdInput = document.getElementById('token-id');
    const contractSelect = document.getElementById('contract-select');
    const checkTokenBtn = document.getElementById('check-token-btn');
    const tokenInfo = document.getElementById('token-info');
    const tokenOwner = document.getElementById('token-owner');
    const tokenError = document.getElementById('token-error');

    const connectBtn = document.getElementById('connect-wallet-btn');
    const notConnectedMsg = document.getElementById('not-connected-msg');
    const connectedAddress = document.getElementById('connected-address');

    const burnBtn = document.getElementById('burn-btn');
    const statusArea = document.getElementById('status-area');
    const pendingMsg = document.getElementById('pending-msg');
    const pendingText = document.getElementById('pending-text');
    const successMsg = document.getElementById('success-msg');
    const successText = document.getElementById('success-text');
    const txLink = document.getElementById('tx-link');
    const errorMsg = document.getElementById('error-msg');

    let currentTokenOwner = null;

    // Wallet connection UI update
    function updateWalletUI() {
        const account = getAccount(wagmiConfig);
        if (account.address) {
            notConnectedMsg.style.display = 'none';
            connectedAddress.style.display = 'block';
            connectedAddress.textContent = `Connected: ${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
            connectBtn.textContent = 'Connected';
            updateBurnButtonState();
        } else {
            notConnectedMsg.style.display = 'block';
            connectedAddress.style.display = 'none';
            connectBtn.textContent = 'Connect Wallet';
            burnBtn.disabled = true;
        }
    }

    // Update burn button state based on ownership
    function updateBurnButtonState() {
        const account = getAccount(wagmiConfig);
        if (!account.address || !currentTokenOwner) {
            burnBtn.disabled = true;
            return;
        }

        const userOwnsToken = account.address.toLowerCase() === currentTokenOwner.toLowerCase();
        burnBtn.disabled = !userOwnsToken;

        if (!userOwnsToken && currentTokenOwner) {
            tokenError.textContent = 'You do not own this token. Only the owner can burn it.';
            tokenError.style.display = 'block';
        }
    }

    // Connect wallet button
    connectBtn.addEventListener('click', () => {
        modal && modal.open();
    });

    // Subscribe to wallet state changes
    if (wagmiAdapter && wagmiAdapter.wagmiConfig) {
        wagmiAdapter.wagmiConfig.subscribe(
            (state) => state.current,
            () => updateWalletUI()
        );
    }

    // Check token ownership
    checkTokenBtn.addEventListener('click', async () => {
        const tokenId = tokenIdInput.value.trim();
        const version = contractSelect.value;

        if (!tokenId) {
            tokenError.textContent = 'Please enter a token ID';
            tokenError.style.display = 'block';
            tokenInfo.style.display = 'none';
            return;
        }

        tokenError.style.display = 'none';
        tokenInfo.style.display = 'none';
        checkTokenBtn.disabled = true;
        checkTokenBtn.textContent = 'Checking...';

        try {
            const { address, abi } = getContractConfig(version);

            const owner = await readContract(wagmiConfig, {
                address,
                abi,
                functionName: 'ownerOf',
                args: [BigInt(tokenId)],
                chainId: 10
            });

            currentTokenOwner = owner;
            tokenOwner.textContent = `${owner.slice(0, 6)}...${owner.slice(-4)}`;
            tokenInfo.style.display = 'block';

            // Check if this is already the burn address
            if (owner.toLowerCase() === BURN_ADDRESS.toLowerCase()) {
                tokenError.textContent = 'This token has already been burned!';
                tokenError.style.display = 'block';
                burnBtn.disabled = true;
            } else {
                updateBurnButtonState();
            }

        } catch (err) {
            console.error('Token check error:', err);
            currentTokenOwner = null;

            if (err.message?.includes('ERC721NonexistentToken') ||
                err.message?.includes('owner query for nonexistent token')) {
                tokenError.textContent = `Token #${tokenId} does not exist on the ${version.toUpperCase()} contract`;
            } else {
                tokenError.textContent = 'Error checking token: ' + (err.shortMessage || err.message);
            }
            tokenError.style.display = 'block';
            burnBtn.disabled = true;
        } finally {
            checkTokenBtn.disabled = false;
            checkTokenBtn.textContent = 'Check Token';
        }
    });

    // Burn token handler
    burnBtn.addEventListener('click', async () => {
        const tokenId = tokenIdInput.value.trim();
        const version = contractSelect.value;
        const account = getAccount(wagmiConfig);

        if (!account.address) {
            errorMsg.textContent = 'Please connect your wallet first';
            errorMsg.style.display = 'block';
            return;
        }

        if (!tokenId || !currentTokenOwner) {
            errorMsg.textContent = 'Please check the token first';
            errorMsg.style.display = 'block';
            return;
        }

        statusArea.style.display = 'block';
        pendingMsg.style.display = 'block';
        successMsg.style.display = 'none';
        errorMsg.style.display = 'none';
        burnBtn.disabled = true;
        pendingText.textContent = `Burning token #${tokenId}...`;

        try {
            const { address, abi } = getContractConfig(version);

            const hash = await writeContract(wagmiConfig, {
                address,
                abi,
                functionName: 'transferFrom',
                args: [account.address, BURN_ADDRESS, BigInt(tokenId)],
                chainId: 10
            });

            pendingText.textContent = 'Waiting for confirmation...';

            await waitForTransactionReceipt(wagmiConfig, {
                hash,
                chainId: 10
            });

            pendingMsg.style.display = 'none';
            successMsg.style.display = 'block';
            successText.textContent = `Token #${tokenId} has been burned!`;
            txLink.innerHTML = `<a href="https://optimistic.etherscan.io/tx/${hash}" target="_blank" class="btn btn-sm btn-outline-success">View Transaction</a>`;

            // Reset the form
            currentTokenOwner = null;
            tokenInfo.style.display = 'none';
            tokenIdInput.value = '';

        } catch (err) {
            console.error('Burn error:', err);
            pendingMsg.style.display = 'none';

            let errorMessage = err.message || 'Transaction failed';
            if (err.shortMessage) {
                errorMessage = err.shortMessage;
            }
            if (errorMessage.includes('User rejected') || errorMessage.includes('user rejected')) {
                errorMessage = 'Transaction cancelled by user';
            }

            errorMsg.textContent = errorMessage;
            errorMsg.style.display = 'block';
            burnBtn.disabled = false;
        }
    });

    // Initial UI update
    updateWalletUI();
}

// Make it available globally for the template to call
window.initBurnPage = initBurnPage;
