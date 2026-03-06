import {getAccount, signMessage, verifyMessage} from '@wagmi/core';
import {mainnet, optimism} from '@wagmi/core/chains';
import {createWeb3Modal, defaultWagmiConfig} from '@web3modal/wagmi'
import { hexToBytes, keccak256, toHex, stringToBytes } from 'viem'

const projectId = 'a685c805b45541d81547b86d86d97ff5'
// const take = 23;

// 2. Create wagmiConfig
const metadata = {
    name: 'Web3Modal',
    description: 'Web3Modal Example',
    url: 'https://web3modal.com', // origin must match your domain & subdomain.
    icons: ['https://avatars.githubusercontent.com/u/37784886']
}
const chains = [mainnet, optimism]
export const config = defaultWagmiConfig({
    chains,
    projectId,
    metadata,
})

function splitAndReconstituteSignature(signature, vOffset) {
    // Ensure the signature includes '0x' and is the correct length
    if (!signature.startsWith('0x') || signature.length !== 132) {
        throw new Error('Invalid signature length or format');
    }

    const r = signature.slice(2, 66);   // Extracts 'r' component
    const s = signature.slice(66, 130); // Extracts 's' component
    let v = parseInt(signature.slice(130, 132), 16); // Parses 'v' as a hexadecimal integer
    const oldV = v;

    // Adjust 'v' if a new value is provided
    if (vOffset !== undefined && typeof vOffset === 'number') {
        v += vOffset;
    }

    // Ensure 'v' is in hexadecimal form and padded to two characters
    const vHex = v.toString(16).padStart(2, '0');

    // Reconstitute the signature with the new 'v'
    const reconstitutedSignature = `0x${r}${s}${vHex}`;

    return {
        r: '0x' + r,
        s: '0x' + s,
        v: v,
        oldV: oldV,
        fullSignature: reconstitutedSignature
    };
}

let details = {};

function calculateHash(message) {
    const messageBytes = stringToBytes(message);
    return keccak256(messageBytes);
}

async function signPlaintextAndVerify() {
    // Check for connected account first
    const account = getAccount(config);
    if (!account.isConnected) {
        const modal = createWeb3Modal({
            wagmiConfig: config,
            projectId,
        });
        modal.open();
        return;
    }

    let signatureBeforeVSwap;
    let signatureAfterVSwap;

    // Get message from textarea
    const messageInput = document.getElementById('messageInput').value;
    const prehash = document.getElementById('prehash').checked;

    let messageToSign;
    let originalMessage = messageInput;
    if (prehash) {
        const hashedMessage = calculateHash(messageInput);
        messageToSign = hashedMessage;
    } else {
        messageToSign = { raw: stringToBytes(messageInput) };
    }

    try {

        // Sign the message
        signatureBeforeVSwap = await signMessage(config, {
            message: messageToSign,
        })

    } catch (error) {
        console.error('Error signing message:', error);
        alert('Failed to sign the message. See console for details.');
        return;
    }

    // Now verify and process signature
    const parts = splitAndReconstituteSignature(signatureBeforeVSwap, 0);
    signatureAfterVSwap = parts.fullSignature;

    const isValid = await verifyMessage(config, {
        address: account['address'],
        message: originalMessage,
        signature: signatureBeforeVSwap,
    });

    // Display results
    details = {
        signature: signatureBeforeVSwap,
        // signatureAfter: signatureAfterVSwap,
        address: account['address'],
        r: parts.r,
        s: parts.s,
        v: parts.v,
        // oldV: parts.oldV,
        // take: take,
        isValid: isValid
    };

    document.getElementById('signatureOutput').innerHTML =
        JSON.stringify(details, null, 2);
    document.getElementById('messageOutput').innerHTML =
        `\nSigned Message: ${originalMessage}`;
}

function showHashDigest() {
    const messageInput = document.getElementById('messageInput').value;
    const hashedMessage = calculateHash(messageInput);
    const hashDisplay = document.getElementById('hashDisplay');

    document.getElementById('hashOutput').textContent = hashedMessage;
    hashDisplay.classList.remove('d-none');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Optional: Show feedback that it was copied
        const copyButton = document.getElementById('copyHashButton');
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.textContent = originalText;
        }, 2000);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const signButton = document.getElementById('signButton');
    const prehashCheckbox = document.getElementById('prehash');
    const showDigestButton = document.getElementById('showDigestButton');
    const copyHashButton = document.getElementById('copyHashButton');

    if (signButton) {
        signButton.addEventListener('click', signPlaintextAndVerify);
    }

    if (showDigestButton) {
        showDigestButton.addEventListener('click', showHashDigest);
    }

    if (copyHashButton) {
        copyHashButton.addEventListener('click', () => {
            const hashOutput = document.getElementById('hashOutput');
            if (hashOutput.textContent) {
                copyToClipboard(hashOutput.textContent);
            }
        });
    }

    const modal = createWeb3Modal({
        wagmiConfig: config,
        projectId,
    });
});