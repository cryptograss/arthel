/**
 * Oracle of Bluegrass Bacon - Connect any two musicians through shows and recordings
 * Like the Oracle of Bacon (six degrees of Kevin Bacon) but for bluegrass!
 */

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BluegrassOracle {
    constructor() {
        this.musicians = new Map(); // musician name -> musician object
        this.connections = []; // array of connection objects
        this.graph = new Map(); // musician name -> Set of connected musician names
    }

    /**
     * Build the graph from all show and recording data
     */
    async buildGraph() {
        console.log('Building Oracle of Bluegrass Bacon graph...');
        
        // Load show data
        await this.loadShowData();
        
        // Load studio recording data
        await this.loadStudioData();
        
        // Build adjacency graph for pathfinding
        this.buildAdjacencyGraph();
        
        console.log(`Graph built with ${this.musicians.size} musicians and ${this.connections.length} connections`);
        return this;
    }

    /**
     * Load all show files and extract musician connections
     */
    async loadShowData() {
        const showsDir = path.join(__dirname, '../data/shows');
        const showFiles = fs.readdirSync(showsDir).filter(f => f.endsWith('.yaml'));
        
        for (const file of showFiles) {
            const showPath = path.join(showsDir, file);
            const showData = yaml.load(fs.readFileSync(showPath, 'utf8'));
            
            if (!showData || !showData.ensemble) continue;
            
            // Extract base ensemble musicians
            const showMusicians = Object.keys(showData.ensemble);
            this.addMusicians(showMusicians);
            
            // Create connections between all musicians in this show
            this.addShowConnections(showMusicians, showData, file);
            
            // Handle ensemble modifications (featuring musicians)
            if (showData.sets) {
                for (const setNum of Object.keys(showData.sets)) {
                    const set = showData.sets[setNum];
                    if (set.songplays) {
                        for (const songplay of set.songplays) {
                            if (typeof songplay === 'object' && songplay['ensemble-modifications']?.featuring) {
                                const featuring = songplay['ensemble-modifications'].featuring;
                                const featuredMusicians = [...showMusicians, ...featuring];
                                this.addMusicians(featuring);
                                this.addShowConnections(featuredMusicians, showData, file, songplay);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Load studio recording data from song files
     */
    async loadStudioData() {
        const songsDir = path.join(__dirname, '../data/songs_and_tunes');
        const songFiles = fs.readdirSync(songsDir).filter(f => f.endsWith('.yaml'));
        
        for (const file of songFiles) {
            const songPath = path.join(songsDir, file);
            const songData = yaml.load(fs.readFileSync(songPath, 'utf8'));
            
            if (!songData?.studio_versions) continue;
            
            // Process each studio version
            for (const versionNum of Object.keys(songData.studio_versions)) {
                const version = songData.studio_versions[versionNum];
                
                // Each version can have multiple albums/releases
                for (const albumName of Object.keys(version)) {
                    const albumData = version[albumName];
                    
                    if (albumData.ensemble) {
                        const studioMusicians = Object.keys(albumData.ensemble);
                        this.addMusicians(studioMusicians);
                        this.addStudioConnections(studioMusicians, albumName, file);
                    }
                }
            }
        }
    }

    /**
     * Add musicians to the musicians map
     */
    addMusicians(musicianNames) {
        for (const name of musicianNames) {
            if (!this.musicians.has(name)) {
                this.musicians.set(name, {
                    id: this.generateId(name),
                    name: name,
                    connections: new Set()
                });
            }
        }
    }

    /**
     * Add connections between musicians who played at the same show
     */
    addShowConnections(musicians, showData, filename, songContext = null) {
        const connectionId = `show-${filename}-${songContext ? 'song' : 'base'}`;
        
        // Create connections between every pair of musicians
        for (let i = 0; i < musicians.length; i++) {
            for (let j = i + 1; j < musicians.length; j++) {
                const connection = {
                    id: `${connectionId}-${i}-${j}`,
                    musicians: [musicians[i], musicians[j]],
                    type: 'show',
                    context: showData.title || filename,
                    venue: showData.venue,
                    location: showData.locality && showData.region1 ? 
                             `${showData.locality}, ${showData.region1}` : 
                             showData.locality || showData.region1,
                    blockHeight: filename.split('-')[1]?.split('.')[0], // extract from filename
                    songContext: songContext,
                    artifacts: [] // TODO: populate with set stones, etc.
                };
                
                this.connections.push(connection);
                this.musicians.get(musicians[i]).connections.add(connection.id);
                this.musicians.get(musicians[j]).connections.add(connection.id);
            }
        }
    }

    /**
     * Add connections between musicians who recorded together
     */
    addStudioConnections(musicians, albumName, filename) {
        const connectionId = `studio-${filename}-${albumName}`;
        
        // Create connections between every pair of musicians
        for (let i = 0; i < musicians.length; i++) {
            for (let j = i + 1; j < musicians.length; j++) {
                const connection = {
                    id: `${connectionId}-${i}-${j}`,
                    musicians: [musicians[i], musicians[j]],
                    type: 'recording',
                    context: albumName,
                    song: filename.replace('.yaml', ''),
                    artifacts: [] // TODO: populate with artifacts
                };
                
                this.connections.push(connection);
                this.musicians.get(musicians[i]).connections.add(connection.id);
                this.musicians.get(musicians[j]).connections.add(connection.id);
            }
        }
    }

    /**
     * Build adjacency graph for efficient pathfinding
     */
    buildAdjacencyGraph() {
        for (const musician of this.musicians.keys()) {
            this.graph.set(musician, new Set());
        }
        
        for (const connection of this.connections) {
            const [musician1, musician2] = connection.musicians;
            this.graph.get(musician1).add(musician2);
            this.graph.get(musician2).add(musician1);
        }
    }

    /**
     * Find the shortest path between two musicians using BFS
     */
    findPath(startMusician, endMusician) {
        if (!this.musicians.has(startMusician)) {
            throw new Error(`Musician "${startMusician}" not found in database`);
        }
        if (!this.musicians.has(endMusician)) {
            throw new Error(`Musician "${endMusician}" not found in database`);
        }
        
        if (startMusician === endMusician) {
            return { path: [startMusician], connections: [], degrees: 0 };
        }
        
        const queue = [[startMusician]];
        const visited = new Set([startMusician]);
        
        while (queue.length > 0) {
            const currentPath = queue.shift();
            const currentMusician = currentPath[currentPath.length - 1];
            
            const neighbors = this.graph.get(currentMusician);
            for (const neighbor of neighbors) {
                if (neighbor === endMusician) {
                    const finalPath = [...currentPath, neighbor];
                    const pathConnections = this.getConnectionsForPath(finalPath);
                    return {
                        path: finalPath,
                        connections: pathConnections,
                        degrees: finalPath.length - 1
                    };
                }
                
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...currentPath, neighbor]);
                }
            }
        }
        
        return null; // No path found
    }

    /**
     * Get the connections that link musicians in a path
     */
    getConnectionsForPath(pathArray) {
        const pathConnections = [];
        
        for (let i = 0; i < pathArray.length - 1; i++) {
            const musician1 = pathArray[i];
            const musician2 = pathArray[i + 1];
            
            // Find connection between these two musicians
            const connection = this.connections.find(conn => 
                (conn.musicians[0] === musician1 && conn.musicians[1] === musician2) ||
                (conn.musicians[0] === musician2 && conn.musicians[1] === musician1)
            );
            
            if (connection) {
                pathConnections.push(connection);
            }
        }
        
        return pathConnections;
    }

    /**
     * Get all musicians in the database
     */
    getAllMusicians() {
        return Array.from(this.musicians.keys()).sort();
    }

    /**
     * Generate a URL-safe ID from a name
     */
    generateId(name) {
        return name.toLowerCase()
                  .replace(/[^a-z0-9\s]/g, '')
                  .replace(/\s+/g, '-');
    }
}

export { BluegrassOracle };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    async function main() {
        const oracle = new BluegrassOracle();
        await oracle.buildGraph();
        
        const args = process.argv.slice(2);
        if (args.length === 0) {
            console.log('Available musicians:');
            console.log(oracle.getAllMusicians().join('\n'));
        } else if (args.length === 2) {
            const [start, end] = args;
            console.log(`\nFinding path from "${start}" to "${end}"...`);
            
            try {
                const result = oracle.findPath(start, end);
                if (result) {
                    console.log(`\n🎵 ${result.degrees} degrees of separation!`);
                    console.log(`Path: ${result.path.join(' → ')}`);
                    console.log('\nConnections:');
                    result.connections.forEach((conn, i) => {
                        console.log(`${i + 1}. ${conn.type === 'show' ? '🎤' : '🎧'} ${conn.context}`);
                        if (conn.venue) console.log(`   at ${conn.venue}${conn.location ? `, ${conn.location}` : ''}`);
                        if (conn.songContext) console.log(`   during "${Object.keys(conn.songContext)[0]}"`);
                    });
                } else {
                    console.log('No connection found! 😱');
                }
            } catch (error) {
                console.error(error.message);
            }
        } else {
            console.log('Usage: node oracle_of_bluegrass_bacon.js [musician1] [musician2]');
        }
    }
    
    main().catch(console.error);
}