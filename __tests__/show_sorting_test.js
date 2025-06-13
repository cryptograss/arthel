import { getShowAndSetData } from '../src/build_logic/show_and_set_data.js';
import { initProjectDirs } from '../src/build_logic/locations.js';

describe('Show Sorting', () => {
    beforeAll(() => {
        // Initialize project directories for testing
        initProjectDirs('justinholmes.com');
    });
    test('shows are returned in descending blockheight order', () => {
        const { shows } = getShowAndSetData();
        
        // Convert shows object to array of [showId, showData] entries
        const showEntries = Object.entries(shows);
        
        // Extract blockheights from the show entries
        const blockheights = showEntries.map(([showId, showData]) => showData.blockheight);
        
        // Check that we have some shows to test
        expect(blockheights.length).toBeGreaterThan(0);
        
        // Verify blockheights are in descending order (most recent first)
        for (let i = 0; i < blockheights.length - 1; i++) {
            expect(blockheights[i]).toBeGreaterThanOrEqual(blockheights[i + 1]);
        }
    });
    
    test('shows object maintains show ID to show data mapping', () => {
        const { shows } = getShowAndSetData();
        
        // Pick a few shows and verify direct access works
        const showIds = Object.keys(shows);
        expect(showIds.length).toBeGreaterThan(0);
        
        // Test that we can access shows by ID
        for (const showId of showIds.slice(0, 3)) { // Test first 3 shows
            expect(shows[showId]).toBeDefined();
            expect(shows[showId].blockheight).toBeDefined();
            expect(shows[showId].show_id).toBe(showId);
        }
    });
    
    test('most recent shows come first', () => {
        const { shows } = getShowAndSetData();
        const showEntries = Object.entries(shows);
        
        if (showEntries.length >= 2) {
            const [firstShowId, firstShow] = showEntries[0];
            const [secondShowId, secondShow] = showEntries[1];
            
            // First show has higher or equal blockheight than second
            expect(firstShow.blockheight).toBeGreaterThanOrEqual(secondShow.blockheight);
        }
    });
});