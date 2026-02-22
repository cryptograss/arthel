import fs from 'fs';
import path from 'path';
import ora from 'ora';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getProjectDirs, initProjectDirs } from './locations.js';
import { serializePinataPins } from './pinata_db.js';
import { fetchCurrentBlockHeight } from './get_current_blockheight.js';

dotenv.config();

const PINATA_API_URL = 'https://api.pinata.cloud/v3/files/public';
const MAYBELLE_PINNING_URL = process.env.MAYBELLE_PINNING_URL || 'https://pinning.maybelle.cryptograss.live';

/**
 * Fetch all pins from maybelle's local IPFS node
 * @returns {Promise<Object>} Object with pins array and metadata
 */
async function fetchMaybellePins() {
    const spinner = ora('Fetching pins from Maybelle IPFS node...').start();

    try {
        const response = await fetch(`${MAYBELLE_PINNING_URL}/local-pins`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Maybelle API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        spinner.succeed(`Fetched ${data.count} pins from Maybelle IPFS node`);
        return data;
    } catch (error) {
        spinner.fail(`Failed to fetch Maybelle pins: ${error.message}`);
        return { node: 'maybelle', pins: [], count: 0, error: error.message };
    }
}

/**
 * Fetch all pins from Pinata v3 API with pagination
 * @returns {Promise<Array>} Array of pin objects
 */
async function fetchAllPins() {
    const jwt = process.env.PINATA_JWT;
    if (!jwt || jwt === 'your_pinata_jwt_token_here') {
        throw new Error('PINATA_JWT environment variable not set. Please add your Pinata JWT to .env');
    }

    const allPins = [];
    let pageToken = null;
    let pageCount = 0;

    const spinner = ora('Fetching pins from Pinata...').start();

    while (true) {
        pageCount++;
        spinner.text = `Fetching pins from Pinata (page ${pageCount})...`;

        const url = new URL(PINATA_API_URL);
        url.searchParams.set('limit', '100');
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Pinata API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const files = data.data?.files || [];

        for (const file of files) {
            allPins.push({
                id: file.id,
                cid: file.cid,
                name: file.name,
                size: file.size,
                date_pinned: file.created_at,
                mime_type: file.mime_type,
                number_of_files: file.number_of_files,
                keyvalues: file.keyvalues || {},
            });
        }

        // Check for next page
        pageToken = data.data?.next_page_token;
        if (!pageToken || files.length === 0) {
            break;
        }
    }

    spinner.succeed(`Fetched ${allPins.length} pins from Pinata (${pageCount} pages)`);
    return allPins;
}

/**
 * Main function to fetch and save pins from all sources
 */
async function fetchPinataPins() {
    console.log('Starting IPFS pin discovery...');

    const { outputBaseDir } = getProjectDirs();
    const outputDir = path.resolve(outputBaseDir, '_prebuild_pinata_data');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Fetch from both sources in parallel
    const [pinataPins, maybellePins] = await Promise.all([
        fetchAllPins(),
        fetchMaybellePins()
    ]);

    // Build a set of Pinata CIDs for quick lookup
    const pinataCidSet = new Set(pinataPins.map(p => p.cid));

    // Find maybelle-only pins (not on Pinata)
    const maybelleOnlyPins = (maybellePins.pins || [])
        .filter(p => !pinataCidSet.has(p.cid))
        .map(p => ({
            cid: p.cid,
            name: null,
            size: null,
            date_pinned: null,
            source: 'maybelle-only',
            keyvalues: {},
        }));

    console.log(`  Found ${maybelleOnlyPins.length} maybelle-only pins (not on Pinata)`);

    // Combine all pins
    const allPins = [...pinataPins, ...maybelleOnlyPins];

    // Calculate summary statistics
    const summary = {
        total: allPins.length,
        pinataCount: pinataPins.length,
        maybelleOnlyCount: maybelleOnlyPins.length,
        totalSize: pinataPins.reduce((sum, pin) => sum + (pin.size || 0), 0),
        byMimeType: {},
        byKeyvalueSource: {},
    };

    for (const pin of pinataPins) {
        // Count by mime type
        const mimeType = pin.mime_type || 'unknown';
        summary.byMimeType[mimeType] = (summary.byMimeType[mimeType] || 0) + 1;

        // Count by keyvalue source
        const source = pin.keyvalues?.source || 'no-source';
        summary.byKeyvalueSource[source] = (summary.byKeyvalueSource[source] || 0) + 1;
    }

    // Fetch current Ethereum blockheight for temporal reference
    let fetchedAtBlock = null;
    try {
        fetchedAtBlock = await fetchCurrentBlockHeight();
        console.log(`  Ethereum block at fetch time: ${fetchedAtBlock}`);
    } catch (e) {
        console.warn('  Warning: Could not fetch Ethereum blockheight:', e.message);
    }

    const pinataPinsData = {
        fetchedAt: new Date().toISOString(),
        fetchedAtBlock,
        summary,
        pins: allPins,
        maybellePins: maybellePins,  // Include raw maybelle data for reference
    };

    // Serialize to disk
    serializePinataPins(pinataPinsData);

    console.log('\nSummary:');
    console.log(`  Total pins: ${summary.total} (${summary.pinataCount} on Pinata, ${summary.maybelleOnlyCount} maybelle-only)`);
    console.log(`  Total size (Pinata): ${(summary.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('  By source:');
    for (const [source, count] of Object.entries(summary.byKeyvalueSource)) {
        console.log(`    ${source}: ${count}`);
    }

    return pinataPinsData;
}

// If this file is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    initProjectDirs('cryptograss.live');
    fetchPinataPins().catch(error => {
        console.error('Failed to fetch Pinata pins:', error.message);
        process.exit(1);
    });
}

export { fetchPinataPins, fetchAllPins };
