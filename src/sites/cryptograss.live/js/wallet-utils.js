/**
 * Shared wallet connection utilities for Cryptograss
 * Wraps Reown/AppKit initialization with better error handling
 */

import { createAppKit } from '@reown/appkit';
import { optimism } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet } from '@reown/appkit/networks';

// Shared project ID for all Cryptograss wallet connections
export const REOWN_PROJECT_ID = 'a685c805b45541d81547b86d86d97ff5';

/**
 * Check if Reown API is accessible with current projectId and origin
 * Logs detailed error info to console if not
 */
export async function checkReownAccess(projectId = REOWN_PROJECT_ID) {
    try {
        const response = await fetch(
            `https://api.web3modal.com/getWallets?projectId=${projectId}&page=1&entries=1`
        );
        if (!response.ok) {
            console.error(`[Reown] API returned ${response.status} ${response.statusText}`);
            console.error(`[Reown] ProjectId: ${projectId}`);
            console.error(`[Reown] Origin: ${window.location.origin}`);
            if (response.status === 403) {
                console.error(`[Reown] 403 Forbidden - Domain "${window.location.hostname}" is not whitelisted`);
                console.error(`[Reown] Fix: Add "${window.location.hostname}" to allowed domains in Reown Cloud dashboard`);
                console.error(`[Reown] Dashboard: https://cloud.reown.com/`);
            }
            return false;
        }
        console.log('[Reown] API access verified OK');
        return true;
    } catch (err) {
        console.error('[Reown] API check failed:', err);
        return false;
    }
}

/**
 * Create and initialize wallet connection with error handling
 * @param {Object} options
 * @param {string} options.name - App name shown in wallet
 * @param {string} options.description - App description
 * @param {boolean} options.includeMainnet - Include mainnet for ENS resolution
 * @returns {{ modal, wagmiAdapter, wagmiConfig } | null}
 */
export function createWalletConnection(options = {}) {
    const {
        name = 'Cryptograss',
        description = 'Cryptograss App',
        includeMainnet = false
    } = options;

    const projectId = REOWN_PROJECT_ID;
    const networks = includeMainnet ? [optimism, mainnet] : [optimism];

    const metadata = {
        name,
        description,
        url: 'https://cryptograss.live',
        icons: ['https://cryptograss.live/favicon.ico']
    };

    // Run pre-flight check (async, non-blocking)
    checkReownAccess(projectId);

    try {
        const wagmiAdapter = new WagmiAdapter({
            projectId,
            networks
        });

        const modal = createAppKit({
            adapters: [wagmiAdapter],
            networks: [optimism], // Modal shows optimism only
            metadata,
            projectId,
            features: { analytics: false }
        });

        const wagmiConfig = wagmiAdapter.wagmiConfig;

        return { modal, wagmiAdapter, wagmiConfig };
    } catch (err) {
        console.error('[Reown/AppKit] Initialization failed:', err);
        console.error('[Reown/AppKit] ProjectId:', projectId);
        console.error('[Reown/AppKit] This often means the projectId is invalid or domain not whitelisted');
        return null;
    }
}
