import { jest } from '@jest/globals';

const mockFs = {
    existsSync: jest.fn(() => false),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn()
};

const mockFetch = jest.fn(() => Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(10))
}));

// Mock global fetch (native fetch in Node 18+)
globalThis.fetch = mockFetch;

// Set up all mocks BEFORE any imports
jest.unstable_mockModule('fs', () => ({
    default: mockFs,
    __esModule: true
}));

// Import the function we want to test
let downloadVideos;
beforeAll(async () => {
    const module = await import('../src/build_logic/discord_video_fetcher.js');
    downloadVideos = module.downloadVideos;
});

describe('Video Downloader', () => {
    beforeEach(() => {
        // Clear mock calls between tests
        jest.clearAllMocks();
    });

    test('downloads videos based on metadata', async () => {
        const metadataList = [
            {
                discordUrl: 'http://example.com/video.mp4',
                fileName: 'video.mp4'
            }
        ];
        const outputDir = '/mock/output/dir';

        await downloadVideos(metadataList, outputDir);

        expect(mockFs.existsSync).toHaveBeenCalled();
        expect(mockFs.writeFileSync).toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalledWith('http://example.com/video.mp4');
    });
}); 