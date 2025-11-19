import { initProjectDirs } from '../src/build_logic/locations.js';
import { generateSetStonePages } from '../src/build_logic/setstone_utils.js';
import fs from 'fs';
import path from 'path';

describe('Ticket Stub Generation', () => {
    let outputDir;
    
    beforeAll(() => {
        initProjectDirs('cryptograss.live');
        outputDir = '/tmp/test_ticket_stubs';
        
        // Create test output directory
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });
    });
    
    afterAll(() => {
        // Clean up test directory
        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true });
        }
    });
    
    test.skip('generates fake ticket stubs for testing shows', () => {
        // Mock show data
        const mockShows = {
            '0-22447747': {
                title: 'ETHDam 2025',
                venue: 'Test Venue',
                locality: 'Amsterdam',
                region1: 'Netherlands',
                blockheight: 22447747,
                ticketStubCount: 0, // Should be overridden by fake generation
                sets: {}
            },
            '0-99999999': {
                title: 'Test Show Without Stubs',
                venue: 'Another Venue',
                locality: 'Test City',
                region1: 'Test Region',
                blockheight: 99999999,
                ticketStubCount: 0,
                sets: {}
            }
        };
        
        // This should run without throwing errors
        expect(() => {
            generateSetStonePages(mockShows, outputDir);
        }).not.toThrow();
        
        // Check that ETHDam show now has fake ticket stubs
        expect(mockShows['0-22447747'].ticketStubs).toBeDefined();
        expect(mockShows['0-22447747'].ticketStubs.length).toBe(3);
        expect(mockShows['0-22447747'].ticketStubCount).toBe(3);
        
        // Check ticket stub structure
        const firstStub = mockShows['0-22447747'].ticketStubs[0];
        expect(firstStub.tokenId).toBe(1);
        expect(firstStub.claimed).toBe(false);
        expect(firstStub.secret).toBeTruthy(); // Should have a generated secret
        
        // Check that non-test show doesn't have ticket stubs
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