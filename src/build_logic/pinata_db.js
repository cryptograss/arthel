import fs from 'fs';
import path from 'path';
import { stringify } from "./utils.js";
import { getProjectDirs } from "./locations.js";

/**
 * Serialize Pinata pins data to disk
 * @param {Object} pinataPinsData - The pins data with summary
 */
export function serializePinataPins(pinataPinsData) {
    const { outputBaseDir } = getProjectDirs();
    const pinataDataDir = path.resolve(outputBaseDir, '_prebuild_pinata_data');

    // Create directory if it doesn't exist
    if (!fs.existsSync(pinataDataDir)) {
        fs.mkdirSync(pinataDataDir, { recursive: true });
    }

    const pinataDataPath = path.resolve(pinataDataDir, 'pinataPins.json');
    const pinataPinsJson = stringify(pinataPinsData);
    fs.writeFileSync(pinataDataPath, pinataPinsJson);
    console.log(`Saved Pinata pins data to ${pinataDataPath}`);
}

/**
 * Deserialize Pinata pins data from disk
 * @returns {Object|null} The pins data or null if not found
 */
export function deserializePinataPins() {
    const { outputBaseDir } = getProjectDirs();
    const pinataDataDir = path.resolve(outputBaseDir, '_prebuild_pinata_data');
    const pinataDataPath = path.resolve(pinataDataDir, 'pinataPins.json');

    if (!fs.existsSync(pinataDataPath)) {
        console.warn('Pinata pins data not found. Run `npm run fetch:pinata` to fetch pins.');
        return null;
    }

    const pinataPinsJson = fs.readFileSync(pinataDataPath, 'utf8');
    return JSON.parse(pinataPinsJson);
}
