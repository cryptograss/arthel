import { createConfig, http, writeContract, getAccount, watchAccount } from '@wagmi/core';
import { optimism, mainnet } from '@wagmi/core/chains';
import { createWeb3Modal } from '@web3modal/wagmi';
import { createPublicClient } from 'viem';
import { normalize } from 'viem/ens';
import { blueRailroadContractAddress } from '../../../../build_logic/constants.js';
import { brABI } from '../../../../abi/blueRailroadABI.js';

const projectId = '3e6e7e58a5918c44fa42816d90b735a6';

const config = createConfig({
    chains: [optimism, mainnet],
    transports: {
        [optimism.id]: http(),
        [mainnet.id]: http(),
    },
});

// Public client for ENS resolution (ENS lives on mainnet)
const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http(),
});

let modal;

function updateWalletUI(address) {
    const notConnectedMsg = document.getElementById('not-connected-msg');
    const connectedAddress = document.getElementById('connected-address');
    const connectBtn = document.getElementById('connect-wallet-btn');
    const mintBtn = document.getElementById('mint-btn');

    if (address) {
        notConnectedMsg.style.display = 'none';
        connectedAddress.style.display = 'block';
        connectedAddress.textContent = `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`;
        connectBtn.textContent = 'Change Wallet';
        mintBtn.disabled = false;
    } else {
        notConnectedMsg.style.display = 'block';
        connectedAddress.style.display = 'none';
        connectBtn.textContent = 'Connect Wallet';
        mintBtn.disabled = true;
    }
}

function showStatus(type, message) {
    const statusArea = document.getElementById('status-area');
    const pendingMsg = document.getElementById('pending-msg');
    const successMsg = document.getElementById('success-msg');
    const errorMsg = document.getElementById('error-msg');
    const txLink = document.getElementById('tx-link');

    statusArea.style.display = 'block';
    pendingMsg.style.display = 'none';
    successMsg.style.display = 'none';
    errorMsg.style.display = 'none';

    switch (type) {
        case 'pending':
            pendingMsg.style.display = 'block';
            break;
        case 'success':
            successMsg.style.display = 'block';
            txLink.href = `https://optimistic.etherscan.io/tx/${message}`;
            break;
        case 'error':
            errorMsg.style.display = 'block';
            errorMsg.textContent = message;
            break;
    }
}

function dateToUint32(dateString) {
    // Convert YYYY-MM-DD to YYYYMMDD as uint32
    return parseInt(dateString.replace(/-/g, ''), 10);
}

function isEnsName(input) {
    // ENS names contain a dot and don't start with 0x
    return input.includes('.') && !input.startsWith('0x');
}

function isValidAddress(input) {
    return /^0x[a-fA-F0-9]{40}$/.test(input);
}

async function resolveRecipient(input) {
    // If it's already a valid address, return it
    if (isValidAddress(input)) {
        return { address: input, ensName: null };
    }

    // If it looks like an ENS name, try to resolve it
    if (isEnsName(input)) {
        try {
            const normalizedName = normalize(input);
            const address = await mainnetClient.getEnsAddress({ name: normalizedName });
            if (address) {
                return { address, ensName: input };
            } else {
                throw new Error(`Could not resolve ENS name: ${input}`);
            }
        } catch (error) {
            if (error.message.includes('Could not resolve')) {
                throw error;
            }
            throw new Error(`Invalid ENS name: ${input}`);
        }
    }

    throw new Error('Please enter a valid Ethereum address or ENS name');
}

function updateResolvedAddress(address, ensName) {
    const resolvedDiv = document.getElementById('resolved-address');
    if (address && ensName) {
        resolvedDiv.style.display = 'block';
        resolvedDiv.textContent = `Resolved: ${address.slice(0, 6)}...${address.slice(-4)}`;
    } else {
        resolvedDiv.style.display = 'none';
    }
}

async function handleMint(e) {
    e.preventDefault();

    const account = getAccount(config);
    if (!account?.address) {
        showStatus('error', 'Please connect your wallet first');
        return;
    }

    const recipientInput = document.getElementById('recipient').value.trim();
    const songId = parseInt(document.getElementById('song-select').value, 10);
    const date = dateToUint32(document.getElementById('date-input').value);
    const uri = document.getElementById('video-uri').value;

    if (!recipientInput || !songId || !date || !uri) {
        showStatus('error', 'Please fill in all fields');
        return;
    }

    try {
        // Show resolving status if it's an ENS name
        if (isEnsName(recipientInput)) {
            showStatus('pending', 'Resolving ENS name...');
        }

        const { address: recipient, ensName } = await resolveRecipient(recipientInput);

        // Show the resolved address if we resolved an ENS name
        if (ensName) {
            updateResolvedAddress(recipient, ensName);
        }

        showStatus('pending');

        const result = await writeContract(config, {
            address: blueRailroadContractAddress,
            abi: brABI,
            functionName: 'issueTony',
            chainId: optimism.id,
            args: [recipient, songId, date, uri],
        });

        showStatus('success', result);
        console.log('Transaction hash:', result);

    } catch (error) {
        console.error('Mint error:', error);
        let errorMessage = error.message || 'Transaction failed';

        // Extract more useful error if available
        if (error.shortMessage) {
            errorMessage = error.shortMessage;
        }
        if (errorMessage.includes('OwnableUnauthorizedAccount')) {
            errorMessage = 'Only the contract owner can mint tokens';
        }

        showStatus('error', errorMessage);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    const dateInput = document.getElementById('date-input');
    dateInput.value = new Date().toISOString().split('T')[0];

    // Initialize Web3Modal
    // Note: z-index must be higher than #main-container's z-index: 1000
    modal = createWeb3Modal({
        wagmiConfig: config,
        projectId,
        themeVariables: {
            '--w3m-z-index': 10000
        }
    });

    // Watch for account changes
    watchAccount(config, {
        onChange(account) {
            updateWalletUI(account?.address);
        },
    });

    // Check initial account state
    const account = getAccount(config);
    updateWalletUI(account?.address);

    // Connect wallet button
    document.getElementById('connect-wallet-btn').addEventListener('click', () => {
        modal.open();
    });

    // Form submission
    document.getElementById('mint-form').addEventListener('submit', handleMint);
});
