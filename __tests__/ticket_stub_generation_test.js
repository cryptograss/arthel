import { initProjectDirs, resetProjectDirs } from '../src/build_logic/locations.js';
import { generateSetStonePages } from '../src/build_logic/setstone_utils.js';
import fs from 'fs';
import path from 'path';

describe('Ticket Stub Generation', () => {
    const outputDir = 'test_output_stubs';

    beforeEach(() => {
        // Clean up test output directory
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });

        // Reset and set env BEFORE initializing
        resetProjectDirs();
        process.env.OUTPUT_PRIMARY_ROOT_DIR = outputDir;
        initProjectDirs('cryptograss.live');
    });

    afterEach(() => {
        // Clean up
        delete process.env.OUTPUT_PRIMARY_ROOT_DIR;
        resetProjectDirs();
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true });
        }
    });

    test('generates fake ticket stubs for hardcoded test shows', () => {
        // Use the hardcoded show IDs that trigger fake stub generation
        const mockShows = {
            '0_7-22575700': { // Burza #4 - gets 50 stubs starting at token 0
                title: 'Burza #4 - ETHPrague 2025',
                venue: 'Test Venue',
                locality: 'Prague',
                region1: 'Czech Republic',
                blockheight: 22575700,
                ticketStubCount: 0,
                sets: {}
            },
            '0-22748946': { // Porcupine 2025 - gets 40 stubs starting at token 100
                title: 'Porcupine 2025',
                venue: 'Another Venue',
                locality: 'Test City',
                region1: 'Test Region',
                blockheight: 22748946,
                ticketStubCount: 0,
                sets: {}
            },
            '0-99999999': { // Not a hardcoded show - should get empty array
                title: 'Random Show',
                venue: 'Random Venue',
                locality: 'Random City',
                region1: 'Random Region',
                blockheight: 99999999,
                ticketStubCount: 0,
                sets: {}
            }
        };

        expect(() => {
            generateSetStonePages(mockShows, outputDir);
        }).not.toThrow();

        // Burza #4 should have 50 fake ticket stubs
        expect(mockShows['0_7-22575700'].ticketStubs).toBeDefined();
        expect(mockShows['0_7-22575700'].ticketStubs.length).toBe(50);
        expect(mockShows['0_7-22575700'].ticketStubCount).toBe(50);

        // First stub should start at token 0
        const firstStub = mockShows['0_7-22575700'].ticketStubs[0];
        expect(firstStub.tokenId).toBe(0);
        expect(firstStub.claimed).toBe(false);
        expect(firstStub.secret).toBeTruthy();

        // Porcupine should have 40 stubs starting at token 100
        expect(mockShows['0-22748946'].ticketStubs.length).toBe(40);
        expect(mockShows['0-22748946'].ticketStubs[0].tokenId).toBe(100);

        // Random show should have empty array
        expect(mockShows['0-99999999'].ticketStubs).toEqual([]);
    });
    
    test('skips shows with no ticket stubs gracefully', () => {
        const mockShows = {
            '0-12345678': {
                title: 'Show Without Stubs',
                venue: 'Test Venue',
                locality: 'Test City',
                region1: 'Test Region',
                blockheight: 12345678,
                ticketStubCount: 0,
                sets: {}
            }
        };
        
        expect(() => {
            generateSetStonePages(mockShows, outputDir);
        }).not.toThrow();
        
        expect(mockShows['0-12345678'].ticketStubs).toEqual([]);
    });
});