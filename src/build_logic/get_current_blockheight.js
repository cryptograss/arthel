import { createConfig, http } from '@wagmi/core';
import { mainnet } from '@wagmi/core/chains';
import { fetchBlockNumber, getBlock } from '@wagmi/core';
import { AVERAGE_BLOCK_TIME } from './constants.js';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.ALCHEMY_API_KEY;

if (!apiKey) {
    console.error('Error: ALCHEMY_API_KEY not found in environment variables');
    process.exit(1);
}

const config = createConfig({
    chains: [mainnet],
    transports: {
        [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`),
    },
    ssr: true,
});

/**
 * Calculate estimated time from any block height using current block as reference
 */
function estimateTimeFromBlock(targetBlock, currentBlock, currentTimestamp) {
    const blockDifference = BigInt(targetBlock) - BigInt(currentBlock);
    const secondsDifference = Number(blockDifference) * AVERAGE_BLOCK_TIME;
    const estimatedTimestamp = Number(currentTimestamp) + Math.round(secondsDifference);

    return {
        blockDifference: Number(blockDifference),
        secondsDifference: Math.round(secondsDifference),
        estimatedDate: new Date(estimatedTimestamp * 1000),
        isPast: blockDifference < 0,
        isFuture: blockDifference > 0
    };
}

async function getCurrentBlockHeight() {
    try {
        const blockHeight = await fetchBlockNumber(config, { chainId: mainnet.id });
        const block = await getBlock(config, { chainId: mainnet.id, blockNumber: blockHeight });

        console.log(`\nCurrent Ethereum Block Height: ${blockHeight}`);
        console.log(`Timestamp: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
        console.log(`Hash: ${block.hash}`);

        // Example calculations for key moments in our history
        const examples = [
            { name: 'Halloween 2023 (First block height awareness)', block: 21081875 },
            { name: 'Era 0 import complete', block: 23546970 }
        ];

        console.log('\n--- Estimated times for reference blocks ---');
        examples.forEach(({ name, block: targetBlock }) => {
            const estimate = estimateTimeFromBlock(targetBlock, blockHeight, block.timestamp);
            const direction = estimate.isPast ? 'ago' : 'from now';
            const days = Math.abs(Math.floor(estimate.secondsDifference / 86400));
            const hours = Math.abs(Math.floor((estimate.secondsDifference % 86400) / 3600));

            console.log(`\n${name}:`);
            console.log(`  Block: ${targetBlock}`);
            console.log(`  Estimated date: ${estimate.estimatedDate.toISOString()}`);
            console.log(`  Time difference: ${days} days, ${hours} hours ${direction}`);
            console.log(`  Block difference: ${estimate.blockDifference.toLocaleString()} blocks`);
        });

        console.log('\n');
        return blockHeight;
    } catch (error) {
        console.error('Error fetching block height:', error);
        process.exit(1);
    }
}

getCurrentBlockHeight();
