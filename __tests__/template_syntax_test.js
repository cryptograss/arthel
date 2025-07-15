import { initProjectDirs } from '../src/build_logic/locations.js';
import { registerHelpers } from '../src/build_logic/utils/template_helpers.js';
import nunjucks from 'nunjucks';
import fs from 'fs';
import path from 'path';

describe('Template Syntax', () => {
    let env;
    
    beforeAll(() => {
        // Initialize project directories for testing
        initProjectDirs('cryptograss.live');
        
        // Set up Nunjucks environment
        const { templateDir } = initProjectDirs('cryptograss.live');
        env = nunjucks.configure(templateDir, {
            autoescape: false,
            throwOnUndefined: false
        });
        
        // Register template helpers
        registerHelpers('cryptograss.live');
    });
    
    test('onchain-merch template renders without syntax errors', () => {
        // Create minimal mock data that template expects
        const mockContext = {
            shows: {
                '0-22447747': {
                    title: 'Test Show',
                    local_date: '2025-01-01',
                    locality: 'Test City',
                    region1: 'Test Region',
                    venue: 'Test Venue',
                    blockheight: 22447747,
                    ticketStubCount: 2,
                    has_set_stones_available: true,
                    poster: 'test-poster.png',
                    sets: {
                        '0': {
                            setstones: [
                                { tokenId: 1 },
                                { tokenId: 2 }
                            ]
                        }
                    }
                }
            },
            chainData: {
                ticketStubClaimerContractAddress: '0x1234567890123456789012345678901234567890',
                setStoneContractAddress: '0x0987654321098765432109876543210987654321'
            }
        };
        
        // Mock the template helper functions
        env.addGlobal('get_image', (imagePath, size) => `/images/${imagePath}`);
        env.addGlobal('getCryptograssUrl', () => 'https://cryptograss.live');
        
        // Attempt to render the template
        expect(() => {
            env.render('pages/onchain-merch.njk', mockContext);
        }).not.toThrow();
    });
    
    test('cryptograss.live templates have valid Nunjucks syntax', () => {
        const { templateDir } = initProjectDirs('cryptograss.live');
        
        // Get all .njk files in the templates directory
        const getAllNjkFiles = (dir) => {
            const files = [];
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    files.push(...getAllNjkFiles(fullPath));
                } else if (item.endsWith('.njk')) {
                    files.push(fullPath);
                }
            }
            return files;
        };
        
        const templateFiles = getAllNjkFiles(templateDir);
        expect(templateFiles.length).toBeGreaterThan(0);
        
        // Test each template for basic syntax validity
        for (const templateFile of templateFiles) {
            const relativePath = path.relative(templateDir, templateFile);
            
            // Skip templates that might require specific complex context
            if (relativePath.includes('single-') || relativePath.includes('claim-')) {
                continue;
            }
            
            expect(() => {
                // Just compile the template to check syntax
                env.getTemplate(relativePath);
            }).not.toThrow(`Template ${relativePath} has syntax errors`);
        }
    });
    
    test('template fails compilation when given invalid syntax', () => {
        // Create a template with intentionally bad syntax
        const badTemplate = '{{ someVar != 1 ? "yes" : "no" }}'; // Invalid ternary syntax
        
        expect(() => {
            env.renderString(badTemplate, {});
        }).toThrow();
    });
});