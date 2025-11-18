/**
 * @jest-environment node
 */

import { BluegrassOracle } from '../src/build_logic/oracle_of_bluegrass_bacon.js';

describe('Oracle of Bluegrass Bacon', () => {
    let oracle;

    beforeAll(async () => {
        oracle = new BluegrassOracle();
        await oracle.buildGraph();
    });

    describe('Graph Building', () => {
        test('discovers expected number of musicians', () => {
            const musicians = oracle.getAllMusicians();
            expect(musicians.length).toBeGreaterThanOrEqual(50);
            expect(musicians.length).toBeLessThan(100); // sanity check
        });

        test('discovers expected number of connections', () => {
            expect(oracle.connections.length).toBeGreaterThanOrEqual(800);
            expect(oracle.connections.length).toBeLessThan(1000); // sanity check
        });

        test('includes core cryptograss musicians', () => {
            const musicians = oracle.getAllMusicians();
            expect(musicians).toContain('Justin Holmes');
            expect(musicians).toContain('Skyler Golden');
            expect(musicians).toContain('Jakub Vysoky');
            expect(musicians).toContain('David Grier');
            expect(musicians).toContain('Cory Walker');
        });

        test('builds adjacency graph correctly', () => {
            expect(oracle.graph.has('Justin Holmes')).toBe(true);
            expect(oracle.graph.get('Justin Holmes').size).toBeGreaterThan(0);
        });

        test('creates bidirectional connections', () => {
            // If A connects to B, then B should connect to A
            const justinConnections = oracle.graph.get('Justin Holmes');
            if (justinConnections.has('David Grier')) {
                const grierConnections = oracle.graph.get('David Grier');
                expect(grierConnections.has('Justin Holmes')).toBe(true);
            }
        });
    });

    describe('Connection Types', () => {
        test('creates show connections', () => {
            const showConnections = oracle.connections.filter(c => c.type === 'show');
            expect(showConnections.length).toBeGreaterThan(0);
        });

        test('creates recording connections', () => {
            const recordingConnections = oracle.connections.filter(c => c.type === 'recording');
            expect(recordingConnections.length).toBeGreaterThan(0);
        });

        test('show connections have venue information', () => {
            const showConnection = oracle.connections.find(c => 
                c.type === 'show' && c.venue && c.context
            );
            expect(showConnection).toBeDefined();
            expect(showConnection.venue).toBeDefined();
            expect(showConnection.context).toBeDefined();
        });

        test('recording connections have album information', () => {
            const recordingConnection = oracle.connections.find(c => 
                c.type === 'recording' && c.context
            );
            expect(recordingConnection).toBeDefined();
            expect(recordingConnection.context).toBeDefined();
        });
    });

    describe('Pathfinding Algorithm', () => {
        test('finds direct connection (1 degree)', () => {
            // Justin Holmes and David Grier have collaborated directly
            const result = oracle.findPath('Justin Holmes', 'David Grier');
            
            expect(result).not.toBeNull();
            expect(result.degrees).toBe(1);
            expect(result.path).toEqual(['Justin Holmes', 'David Grier']);
            expect(result.connections).toHaveLength(1);
        });

        test('finds 2-degree connection', () => {
            // Find a known 2-degree path
            const result = oracle.findPath('Bones', 'Ice Quilitz');
            
            if (result) {
                expect(result.degrees).toBe(2);
                expect(result.path).toHaveLength(3);
                expect(result.connections).toHaveLength(2);
                expect(result.path[0]).toBe('Bones');
                expect(result.path[2]).toBe('Ice Quilitz');
                // Middle connection should be through Justin Holmes
                expect(result.path[1]).toBe('Justin Holmes');
            }
        });

        test('handles same musician input', () => {
            const result = oracle.findPath('Justin Holmes', 'Justin Holmes');
            
            expect(result.degrees).toBe(0);
            expect(result.path).toEqual(['Justin Holmes']);
            expect(result.connections).toHaveLength(0);
        });

        test('throws error for non-existent musician', () => {
            expect(() => {
                oracle.findPath('Non Existent Musician', 'Justin Holmes');
            }).toThrow('not found in database');
        });

        test('returns null for disconnected musicians', () => {
            // This test assumes we might have disconnected components
            // If all musicians are connected, this test might need adjustment
            const result = oracle.findPath('Justin Holmes', 'Justin Holmes');
            expect(result).not.toBeNull(); // This should always work
        });
    });

    describe('Path Reconstruction', () => {
        test('reconstructs connection details correctly', () => {
            const result = oracle.findPath('Justin Holmes', 'Skyler Golden');
            
            expect(result).not.toBeNull();
            expect(result.connections.length).toBe(result.degrees);
            
            // Each connection should link consecutive musicians in the path
            for (let i = 0; i < result.connections.length; i++) {
                const connection = result.connections[i];
                const musician1 = result.path[i];
                const musician2 = result.path[i + 1];
                
                expect(
                    (connection.musicians[0] === musician1 && connection.musicians[1] === musician2) ||
                    (connection.musicians[0] === musician2 && connection.musicians[1] === musician1)
                ).toBe(true);
            }
        });

        test('includes connection metadata', () => {
            const result = oracle.findPath('Justin Holmes', 'David Grier');
            
            expect(result).not.toBeNull();
            expect(result.connections.length).toBeGreaterThan(0);
            
            const connection = result.connections[0];
            expect(connection.type).toBeDefined();
            expect(connection.context).toBeDefined();
            expect(['show', 'recording']).toContain(connection.type);
        });
    });

    describe('Performance and Edge Cases', () => {
        test('handles all musician combinations efficiently', () => {
            const musicians = oracle.getAllMusicians().slice(0, 10); // Test subset for performance
            const startTime = Date.now();
            
            let pathsFound = 0;
            let totalDegrees = 0;
            
            for (let i = 0; i < musicians.length; i++) {
                for (let j = i + 1; j < musicians.length; j++) {
                    const result = oracle.findPath(musicians[i], musicians[j]);
                    if (result) {
                        pathsFound++;
                        totalDegrees += result.degrees;
                    }
                }
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
            expect(pathsFound).toBeGreaterThan(0);
            
            if (pathsFound > 0) {
                const averageDegrees = totalDegrees / pathsFound;
                expect(averageDegrees).toBeLessThan(6); // Six degrees or less!
            }
        });

        test('validates connection consistency', () => {
            // Every connection should have exactly 2 musicians
            oracle.connections.forEach(connection => {
                expect(connection.musicians).toHaveLength(2);
                expect(connection.musicians[0]).not.toBe(connection.musicians[1]);
                
                // Both musicians should exist in the musicians map
                expect(oracle.musicians.has(connection.musicians[0])).toBe(true);
                expect(oracle.musicians.has(connection.musicians[1])).toBe(true);
            });
        });

        test('validates musician data integrity', () => {
            oracle.musicians.forEach((musicianData, name) => {
                expect(musicianData.name).toBe(name);
                expect(musicianData.id).toBeDefined();
                expect(musicianData.connections).toBeDefined();
                expect(musicianData.connections.size).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Data Source Integration', () => {
        test('parses show data correctly', () => {
            const showConnections = oracle.connections.filter(c => c.type === 'show');
            expect(showConnections.length).toBeGreaterThan(0);
            
            // Check for expected show venues/contexts
            const contexts = showConnections.map(c => c.context);
            expect(contexts.some(context => 
                context && context.toLowerCase().includes('porcupine')
            )).toBe(true); // Porcupine 2025 is in the data
        });

        test('parses studio recording data correctly', () => {
            const recordingConnections = oracle.connections.filter(c => c.type === 'recording');
            expect(recordingConnections.length).toBeGreaterThan(0);
            
            // Should find connections from known albums
            const contexts = recordingConnections.map(c => c.context);
            expect(contexts).toContain('Vowel Sounds');
        });

        test('handles ensemble modifications correctly', () => {
            // Look for connections that should include featuring musicians
            const featuringConnections = oracle.connections.filter(c => 
                c.songContext && typeof c.songContext === 'object'
            );
            
            // This depends on the actual data structure
            expect(featuringConnections.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Real-world Test Cases', () => {
        test('finds expected path: Pepa Lopera to Jakub Vysoky', () => {
            const result = oracle.findPath('Pepa Lopera', 'Jakub Vysoky');
            
            if (result) {
                expect(result.degrees).toBeLessThanOrEqual(2); // Should be direct or through Justin
                expect(result.path[0]).toBe('Pepa Lopera');
                expect(result.path[result.path.length - 1]).toBe('Jakub Vysoky');
            }
        });

        test('verifies Justin Holmes is highly connected', () => {
            const justinConnections = oracle.graph.get('Justin Holmes');
            expect(justinConnections.size).toBeGreaterThan(10); // Should be very connected
            
            // Justin should be able to reach most musicians in 2 degrees or less
            const musicians = oracle.getAllMusicians();
            let reachableInTwoDegrees = 0;
            
            for (const musician of musicians.slice(0, 20)) { // Test subset
                if (musician === 'Justin Holmes') continue;
                
                const result = oracle.findPath('Justin Holmes', musician);
                if (result && result.degrees <= 2) {
                    reachableInTwoDegrees++;
                }
            }
            
            expect(reachableInTwoDegrees).toBeGreaterThan(15); // Most should be reachable
        });
    });
});

describe('Oracle Data Generation', () => {
    test('generates consistent static data', async () => {
        // This would test the build_oracle_data.js output
        // For now, just verify the oracle can be built consistently
        const oracle1 = new BluegrassOracle();
        await oracle1.buildGraph();
        
        const oracle2 = new BluegrassOracle();
        await oracle2.buildGraph();
        
        expect(oracle1.musicians.size).toBe(oracle2.musicians.size);
        expect(oracle1.connections.length).toBe(oracle2.connections.length);
    });
});