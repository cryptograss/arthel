import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { generateSetStonePages } from '../src/build_logic/setstone_utils.js';
import { initProjectDirs, resetProjectDirs } from '../src/build_logic/locations.js';

describe('Claim Page Generation', () => {
    const testOutputDir = 'test_output';
    
    beforeEach(() => {
        // Clean up test output directory
        if (fs.existsSync(testOutputDir)) {
            fs.rmSync(testOutputDir, { recursive: true });
        }
        fs.mkdirSync(testOutputDir, { recursive: true });

        // Reset project dirs and set environment BEFORE initializing
        resetProjectDirs();
        process.env.OUTPUT_PRIMARY_ROOT_DIR = testOutputDir;

        // Now initialize with the env var set
        initProjectDirs('cryptograss.live');
    });

    afterEach(() => {
        // Clean up env var and reset for other tests
        delete process.env.OUTPUT_PRIMARY_ROOT_DIR;
        resetProjectDirs();
    });

    const createMockShow = (showId, venue, tokenStart, tokenCount) => ({
        [showId]: {
            title: `Test Show at ${venue}`,
            venue: venue,
            locality: 'Test City',
            region1: 'Test State',
            local_date: '2025-01-15',
            blockheight: 22700000 + parseInt(showId.split('-')[1]),
            poster: 'test-poster.png',
            has_set_stones_available: false, // Focus on ticket stubs
            sets: {},
            ticketStubs: [],
            ticketStubCount: tokenCount
        }
    });

    test('generates claim pages for multiple shows with different token ranges', () => {
        // Use show IDs that trigger the fake ticket stub generation
        const mockShows = {
            ...createMockShow('0_7-22575700', 'Test Venue Alpha', 0, 50), // Burza #4
            ...createMockShow('0_7-22590100', 'Test Venue Beta', 50, 50),  // Bike Jesus
            ...createMockShow('0-22748946', 'Test Venue Gamma', 100, 40)   // Porcupine
        };

        // This should trigger ticket stub generation and claim page creation
        expect(() => {
            generateSetStonePages(mockShows, testOutputDir);
        }).not.toThrow();

        // Verify claim pages were created for each token ID range
        
        // Burza #4: tokens 0-49
        for (let i = 0; i < 50; i++) {
            const claimPagePath = path.join(testOutputDir, 'cryptograss.live', 'blox-office', 'ticketstubs', 'claim', `${i}.html`);
            expect(fs.existsSync(claimPagePath)).toBe(true);
        }
        
        // Bike Jesus: tokens 50-99
        for (let i = 50; i < 100; i++) {
            const claimPagePath = path.join(testOutputDir, 'cryptograss.live', 'blox-office', 'ticketstubs', 'claim', `${i}.html`);
            expect(fs.existsSync(claimPagePath)).toBe(true);
        }
        
        // Porcupine: tokens 100-139
        for (let i = 100; i < 140; i++) {
            const claimPagePath = path.join(testOutputDir, 'cryptograss.live', 'blox-office', 'ticketstubs', 'claim', `${i}.html`);
            expect(fs.existsSync(claimPagePath)).toBe(true);
        }
    });

    test('claim pages contain correct show information', () => {
        const mockShows = createMockShow('0-22748946', 'Test Venue', 100, 5);
        
        generateSetStonePages(mockShows, testOutputDir);
        
        // Read a generated claim page (Porcupine range: 100-139)
        const claimPagePath = path.join(testOutputDir, 'cryptograss.live', 'blox-office', 'ticketstubs', 'claim', '102.html');
        expect(fs.existsSync(claimPagePath)).toBe(true);
        
        const claimPageContent = fs.readFileSync(claimPagePath, 'utf8');
        
        // Verify show details are in the page
        expect(claimPageContent).toContain('Test Show at Test Venue');
        expect(claimPageContent).toContain('Test City, Test State');
        expect(claimPageContent).toContain('2025-01-15');
        expect(claimPageContent).toContain('Claim Ticket Stub #102');
    });

    test('claim pages include contract integration code', () => {
        const mockShows = createMockShow('0-22748946', 'Test Venue', 100, 3);
        
        generateSetStonePages(mockShows, testOutputDir);
        
        const claimPagePath = path.join(testOutputDir, 'cryptograss.live', 'blox-office', 'ticketstubs', 'claim', '101.html');
        const claimPageContent = fs.readFileSync(claimPagePath, 'utf8');
        
        // Verify blockchain integration elements
        expect(claimPageContent).toContain('claimTicketStub');
        expect(claimPageContent).toContain('walletAddress');
        expect(claimPageContent).toContain('secretInput');
        expect(claimPageContent).toContain('writeContract');
    });

    test.skip('does not generate claim pages for shows without ticket stubs', () => {
        const mockShows = {
            '0-22700000': {
                title: 'Show Without Stubs',
                venue: 'Test Venue',
                has_set_stones_available: false,
                sets: {},
                ticketStubs: [],
                ticketStubCount: 0
            }
        };
        
        generateSetStonePages(mockShows, testOutputDir);
        
        // Should not create any claim pages
        const claimDir = path.join(testOutputDir, 'cryptograss.live', 'blox-office', 'ticketstubs', 'claim');
        if (fs.existsSync(claimDir)) {
            const claimFiles = fs.readdirSync(claimDir);
            expect(claimFiles.length).toBe(0);
        }
    });

    test('each token ID gets unique claim page with correct context', () => {
        const mockShows = createMockShow('0-22748946', 'Context Test Venue', 100, 3);

        generateSetStonePages(mockShows, testOutputDir);

        // Check each generated claim page has the right token ID (Porcupine range: 100-139)
        for (let tokenId = 100; tokenId < 103; tokenId++) {
            const claimPagePath = path.join(testOutputDir, 'cryptograss.live', 'blox-office', 'ticketstubs', 'claim', `${tokenId}.html`);
            const content = fs.readFileSync(claimPagePath, 'utf8');

            // Title includes token ID
            expect(content).toContain(`Claim Ticket Stub #${tokenId}`);
            // Form for claiming is present
            expect(content).toContain('id="claimForm"');
        }
    });
});