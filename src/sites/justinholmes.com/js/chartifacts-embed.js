(function() {
    'use strict';

    // Configuration
    const EMBED_BASE_URL = 'http://localhost:4000'; // TODO: Make this configurable for production

    /**
     * Creates an iframe player for the given song
     * @param {HTMLElement} container - The container element (usually the script tag)
     * @param {Object} config - Configuration from data attributes
     */
    function createChartifactsPlayer(container, config) {
        const {
            song,
            width = '400',
            height = '320',
            autoplay = 'false'
        } = config;

        if (!song) {
            console.error('Chartifacts Embed: No song specified. Use data-song="song-name"');
            return;
        }

        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.src = `${EMBED_BASE_URL}/embed/rabbithole/${encodeURIComponent(song)}.html`;
        iframe.width = width;
        iframe.height = height;
        iframe.frameBorder = '0';
        iframe.allow = 'autoplay';
        iframe.title = `Rabbit Hole Player - ${song}`;
        iframe.style.border = 'none';
        iframe.style.borderRadius = '4px';
        iframe.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

        // Replace the script tag with the iframe
        container.parentNode.insertBefore(iframe, container);
        container.parentNode.removeChild(container);

        console.log(`Chartifacts player embedded for song: ${song}`);
    }

    /**
     * Parse data attributes from script tag
     * @param {HTMLElement} script - The script element
     * @returns {Object} Configuration object
     */
    function parseConfig(script) {
        const config = {};

        // Get all data-* attributes
        for (const attr of script.attributes) {
            if (attr.name.startsWith('data-')) {
                const key = attr.name.slice(5); // Remove 'data-' prefix
                config[key] = attr.value;
            }
        }

        return config;
    }

    /**
     * Find and initialize all chartifacts embed scripts
     */
    function initializeEmbeds() {
        const scripts = document.querySelectorAll('script[src*="chartifacts-embed.js"]');

        scripts.forEach(script => {
            const config = parseConfig(script);
            createChartifactsPlayer(script, config);
        });
    }

    // Auto-initialize when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeEmbeds);
    } else {
        initializeEmbeds();
    }

    // Also expose globally for manual initialization
    window.ChartifactsEmbed = {
        init: initializeEmbeds,
        create: createChartifactsPlayer
    };
})();