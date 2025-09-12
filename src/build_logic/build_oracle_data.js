/**
 * Build Oracle of Bluegrass Bacon data for static serving
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BluegrassOracle } from './oracle_of_bluegrass_bacon.js';
import { initProjectDirs } from './locations.js';

// Initialize for cryptograss.live since that's where the Oracle lives
initProjectDirs("cryptograss.live");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildOracleData() {
    console.log('🎵 Building Oracle of Bluegrass Bacon data...');
    
    const oracle = new BluegrassOracle();
    await oracle.buildGraph();
    
    // Output to the API directory where the Oracle expects to find it
    const apiDir = path.join(path.dirname(__dirname), 'sites', 'cryptograss.live', 'api', 'oracle');
    fs.mkdirSync(apiDir, { recursive: true });
    
    // Generate musicians list
    const musicians = oracle.getAllMusicians();
    fs.writeFileSync(
        path.join(apiDir, 'musicians.json'),
        JSON.stringify(musicians, null, 2)
    );
    
    // Build a lookup object for fast path finding
    // Since this is for a website, we'll pre-compute some popular paths
    // and create a simplified graph representation
    const graphData = {
        musicians: {},
        connections: oracle.connections.map(conn => ({
            id: conn.id,
            musicians: conn.musicians,
            type: conn.type,
            context: conn.context,
            venue: conn.venue,
            location: conn.location,
            blockHeight: conn.blockHeight,
            songContext: conn.songContext,
            song: conn.song
        }))
    };
    
    // Add musician data with connections
    for (const [name, data] of oracle.musicians) {
        graphData.musicians[name] = {
            id: data.id,
            name: data.name,
            connections: Array.from(data.connections)
        };
    }
    
    // Create adjacency list for client-side pathfinding
    const adjacencyList = {};
    for (const musician of musicians) {
        adjacencyList[musician] = Array.from(oracle.graph.get(musician));
    }
    
    const fullData = {
        musicians: graphData.musicians,
        connections: graphData.connections,
        adjacencyList: adjacencyList,
        stats: {
            totalMusicians: musicians.length,
            totalConnections: oracle.connections.length,
            buildTime: new Date().toISOString()
        }
    };
    
    fs.writeFileSync(
        path.join(apiDir, 'graph.json'),
        JSON.stringify(fullData, null, 2)
    );
    
    console.log(`✅ Built Oracle data:`);
    console.log(`   - ${musicians.length} musicians`);
    console.log(`   - ${oracle.connections.length} connections`);
    console.log(`   - Output: ${apiDir}`);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    buildOracleData().catch(console.error);
}

export { buildOracleData };