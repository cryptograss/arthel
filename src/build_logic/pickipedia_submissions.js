/**
 * Fetches pending Blue Railroad submissions from PickiPedia at build time.
 * Uses MediaWiki Action API to avoid CORS issues.
 */

const PICKIPEDIA_API = 'https://pickipedia.xyz/api.php';
const PICKIPEDIA_WIKI = 'https://pickipedia.xyz/wiki';

// Timeout for PickiPedia API requests (5 seconds)
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch with timeout - prevents build hanging when PickiPedia is down
 */
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw e;
    }
}

/**
 * Get the actual URL for a file from MediaWiki API
 * MediaWiki stores files in hash-based subdirectories, so we need to query the API
 */
async function getFileUrl(filename) {
    if (!filename) return null;

    // MediaWiki file titles need "File:" prefix
    const fileTitle = filename.startsWith('File:') ? filename : `File:${filename}`;

    const url = `${PICKIPEDIA_API}?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&format=json`;

    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;

        const data = await response.json();
        const pages = data.query?.pages;
        if (!pages) return null;

        const pageId = Object.keys(pages)[0];
        if (pageId === '-1') return null;

        const imageInfo = pages[pageId].imageinfo?.[0];
        return imageInfo?.url || null;
    } catch (e) {
        console.warn(`Failed to get file URL for ${filename}:`, e.message);
        return null;
    }
}

/**
 * Fetch a single submission page from PickiPedia
 */
async function fetchSubmissionPage(submissionId) {
    const url = `${PICKIPEDIA_API}?action=query&titles=Blue_Railroad_Submission/${submissionId}&prop=revisions&rvprop=content&format=json`;

    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;

        const data = await response.json();
        const pages = data.query?.pages;
        if (!pages) return null;

        // Get the first (and only) page
        const pageId = Object.keys(pages)[0];
        if (pageId === '-1') return null; // Page doesn't exist

        const page = pages[pageId];
        const content = page.revisions?.[0]?.['*'];
        if (!content) return null;

        return {
            id: submissionId,
            title: page.title,
            content: content
        };
    } catch (e) {
        console.warn(`Failed to fetch submission ${submissionId}:`, e.message);
        return null;
    }
}

/**
 * Parse submission content to extract structured data
 */
function parseSubmissionContent(content) {
    // Extract main template fields
    const exerciseMatch = content.match(/\|exercise=([^\n|}]+)/);
    const videoMatch = content.match(/\|video=([^\n|}]+)/);
    const blockHeightMatch = content.match(/\|block_height=(\d+)/);
    const statusMatch = content.match(/\|status=([^\n|}]+)/);
    const ipfsCidMatch = content.match(/\|ipfs_cid=([^\n|}]+)/);

    // Extract participants from Blue Railroad Participant templates
    // Supports both old format (name + wallet) and new format (wallet only)
    const participants = [];

    // New format: wallet only
    const walletOnlyRegex = /\{\{Blue Railroad Participant\s*\|wallet=([^\n|}]+)\s*\}\}/g;
    let match;
    while ((match = walletOnlyRegex.exec(content)) !== null) {
        participants.push({
            wallet: match[1].trim()
        });
    }

    // Old format: name + wallet (for backward compatibility)
    const nameWalletRegex = /\{\{Blue Railroad Participant\s*\|name=([^\n|}]+)\s*\|wallet=([^\n|}]+)\s*\}\}/g;
    while ((match = nameWalletRegex.exec(content)) !== null) {
        participants.push({
            wallet: match[2].trim()
        });
    }

    return {
        exercise: exerciseMatch ? exerciseMatch[1].trim() : 'Unknown',
        video: videoMatch ? videoMatch[1].trim() : null,
        blockHeight: blockHeightMatch ? blockHeightMatch[1] : null,
        status: statusMatch ? statusMatch[1].trim() : 'Pending',
        ipfsCid: ipfsCidMatch ? ipfsCidMatch[1].trim() : null,
        participants: participants
    };
}

/**
 * Determine song ID from exercise name
 * V2 uses Manzanita track numbers:
 *   Track 5 = Nine Pound Hammer (Pushups)
 *   Track 7 = Blue Railroad Train (Squats)
 *   Track 8 = Ginseng Sullivan (Army Crawls)
 */
function getSongIdFromExercise(exercise) {
    const lower = exercise.toLowerCase();
    if (lower.includes('blue railroad') || lower.includes('squat')) return 7;
    if (lower.includes('nine pound') || lower.includes('pushup')) return 5;
    if (lower.includes('ginseng') || lower.includes('army crawl')) return 8;
    return null;
}

/**
 * Fetch all pending submissions from PickiPedia
 * Checks submissions 1-20 (can be expanded as needed)
 */
export async function fetchPendingSubmissions() {
    const submissions = [];
    const MAX_SUBMISSION_ID = 20;

    console.log('=== PickiPedia Submission Fetch ===');
    console.log(`  API endpoint: ${PICKIPEDIA_API}`);
    console.log(`  Timeout: ${FETCH_TIMEOUT_MS}ms (health check: 5000ms)`);
    console.log(`  Max submission ID to check: ${MAX_SUBMISSION_ID}`);

    // Quick connectivity check - if PickiPedia is down, fail fast
    const healthCheckStart = Date.now();
    try {
        console.log('  Performing health check...');
        const healthCheck = await fetchWithTimeout(`${PICKIPEDIA_API}?action=query&meta=siteinfo&format=json`, 5000);
        const healthCheckDuration = Date.now() - healthCheckStart;
        console.log(`  Health check completed in ${healthCheckDuration}ms (status: ${healthCheck.status})`);
        if (!healthCheck.ok) {
            console.warn(`  PickiPedia returned non-OK status (${healthCheck.status}), skipping submission fetch`);
            return [];
        }
    } catch (e) {
        const healthCheckDuration = Date.now() - healthCheckStart;
        console.warn(`  PickiPedia health check FAILED after ${healthCheckDuration}ms`);
        console.warn(`  Error: ${e.message}`);
        console.warn(`  Skipping submission fetch`);
        return [];
    }

    console.log('  Health check passed, fetching submissions...');

    for (let i = 1; i <= MAX_SUBMISSION_ID; i++) {
        const page = await fetchSubmissionPage(i);
        if (!page) continue;

        const parsed = parseSubmissionContent(page.content);

        // Only include pending submissions
        if (parsed.status.toLowerCase() === 'minted') {
            console.log(`  Submission #${i}: Already minted, skipping`);
            continue;
        }

        // Get the actual file URL from MediaWiki API (handles hash-based subdirectories)
        const videoUrl = await getFileUrl(parsed.video);

        const submission = {
            id: i,
            url: `${PICKIPEDIA_WIKI}/Blue_Railroad_Submission/${i}`,
            exercise: parsed.exercise,
            video: parsed.video,
            videoUrl: videoUrl,
            blockHeight: parsed.blockHeight,
            status: parsed.status,
            ipfsCid: parsed.ipfsCid,
            participants: parsed.participants,
            songId: getSongIdFromExercise(parsed.exercise)
        };

        submissions.push(submission);
        console.log(`  Submission #${i}: ${parsed.exercise} (${parsed.participants.length} participants)`);
    }

    console.log(`Found ${submissions.length} pending submission(s)`);
    return submissions;
}

/**
 * Fetch ALL submissions from PickiPedia (regardless of status)
 * For IPFS pinning status dashboard
 */
export async function fetchAllSubmissions() {
    const submissions = [];
    const MAX_SUBMISSION_ID = 20;

    console.log('=== PickiPedia All Submissions Fetch ===');

    // Quick connectivity check
    try {
        const healthCheck = await fetchWithTimeout(`${PICKIPEDIA_API}?action=query&meta=siteinfo&format=json`, 5000);
        if (!healthCheck.ok) {
            console.warn(`  PickiPedia returned non-OK status, skipping`);
            return [];
        }
    } catch (e) {
        console.warn(`  PickiPedia health check failed: ${e.message}`);
        return [];
    }

    for (let i = 1; i <= MAX_SUBMISSION_ID; i++) {
        const page = await fetchSubmissionPage(i);
        if (!page) continue;

        const parsed = parseSubmissionContent(page.content);
        const videoUrl = await getFileUrl(parsed.video);

        submissions.push({
            id: i,
            url: `${PICKIPEDIA_WIKI}/Blue_Railroad_Submission/${i}`,
            exercise: parsed.exercise,
            video: parsed.video,
            videoUrl: videoUrl,
            blockHeight: parsed.blockHeight,
            status: parsed.status,
            ipfsCid: parsed.ipfsCid,
            participants: parsed.participants,
            songId: getSongIdFromExercise(parsed.exercise)
        });
    }

    console.log(`Found ${submissions.length} total submission(s)`);
    return submissions;
}

/**
 * Fetch pages in a specific category from PickiPedia
 */
async function fetchCategoryMembers(category) {
    const url = `${PICKIPEDIA_API}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(category)}&cmlimit=100&format=json`;

    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return [];

        const data = await response.json();
        return data.query?.categorymembers || [];
    } catch (e) {
        console.warn(`Failed to fetch category ${category}:`, e.message);
        return [];
    }
}

/**
 * Fetch a Recording page by title
 */
async function fetchRecordingPage(title) {
    const url = `${PICKIPEDIA_API}?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json`;

    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;

        const data = await response.json();
        const pages = data.query?.pages;
        if (!pages) return null;

        const pageId = Object.keys(pages)[0];
        if (pageId === '-1') return null;

        const page = pages[pageId];
        const content = page.revisions?.[0]?.['*'];
        if (!content) return null;

        return {
            title: page.title,
            content: content
        };
    } catch (e) {
        console.warn(`Failed to fetch recording ${title}:`, e.message);
        return null;
    }
}

/**
 * Parse Recording template content to extract CIDs and metadata
 */
function parseRecordingContent(content) {
    const titleMatch = content.match(/\|title=([^\n|}]+)/);
    const artistsMatch = content.match(/\|artists=([^\n|}]+)/);
    const dateMatch = content.match(/\|date=([^\n|}]+)/);
    const videoCidMatch = content.match(/\|video_cid=([^\n|}]+)/);
    const audioCidMatch = content.match(/\|audio_cid=([^\n|}]+)/);
    const mixCidMatch = content.match(/\|mix_cid=([^\n|}]+)/);
    const studioMatch = content.match(/\|studio=([^\n|}]+)/);
    const engineerMatch = content.match(/\|engineer=([^\n|}]+)/);

    // Clean up wiki link syntax from artists field
    const cleanArtists = artistsMatch
        ? artistsMatch[1].replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').trim()
        : null;

    return {
        title: titleMatch ? titleMatch[1].trim() : null,
        artists: cleanArtists,
        date: dateMatch ? dateMatch[1].trim() : null,
        videoCid: videoCidMatch ? videoCidMatch[1].trim() : null,
        audioCid: audioCidMatch ? audioCidMatch[1].trim() : null,
        mixCid: mixCidMatch ? mixCidMatch[1].trim() : null,
        studio: studioMatch ? studioMatch[1].trim() : null,
        engineer: engineerMatch ? engineerMatch[1].trim() : null
    };
}

/**
 * Search for pages matching a query
 */
async function searchPages(query) {
    const url = `${PICKIPEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=100&format=json`;

    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) return [];

        const data = await response.json();
        return data.query?.search || [];
    } catch (e) {
        console.warn(`Failed to search pages for ${query}:`, e.message);
        return [];
    }
}

/**
 * Fetch all Recording pages from PickiPedia
 * Returns array of recordings with their CIDs for pin categorization
 */
export async function fetchRecordings() {
    const recordings = [];

    console.log('=== PickiPedia Recordings Fetch ===');

    // Quick connectivity check
    try {
        const healthCheck = await fetchWithTimeout(`${PICKIPEDIA_API}?action=query&meta=siteinfo&format=json`, 5000);
        if (!healthCheck.ok) {
            console.warn(`  PickiPedia returned non-OK status, skipping recordings fetch`);
            return [];
        }
    } catch (e) {
        console.warn(`  PickiPedia health check failed: ${e.message}`);
        return [];
    }

    // Search for pages with "Recording:" in their title
    const searchResults = await searchPages('Recording');
    // Filter to only pages that actually start with "Recording:"
    const recordingPages = searchResults.filter(p => p.title.startsWith('Recording:'));
    console.log(`  Found ${recordingPages.length} Recording page(s)`);

    for (const pageInfo of recordingPages) {
        const page = await fetchRecordingPage(pageInfo.title);
        if (!page) continue;

        const parsed = parseRecordingContent(page.content);

        // Collect all CIDs from this recording
        const cids = [];
        if (parsed.videoCid) cids.push({ cid: parsed.videoCid, format: 'video' });
        if (parsed.audioCid) cids.push({ cid: parsed.audioCid, format: 'audio' });
        if (parsed.mixCid) cids.push({ cid: parsed.mixCid, format: 'mix' });

        if (cids.length === 0) continue;

        const recording = {
            pageTitle: pageInfo.title,
            url: `${PICKIPEDIA_WIKI}/${encodeURIComponent(pageInfo.title)}`,
            ...parsed,
            cids: cids
        };

        recordings.push(recording);
        console.log(`  Recording: ${parsed.title} by ${parsed.artists} (${cids.length} CIDs)`);
    }

    console.log(`Found ${recordings.length} recording(s) with CIDs`);
    return recordings;
}

/**
 * Find PickiPedia pages that embed/reference a specific CID
 * @param {string} cid - The IPFS CID to search for
 * @returns {Promise<Array>} Array of {title, url} objects
 */
export async function fetchPagesWithCid(cid) {
    if (!cid) return [];

    const results = await searchPages(cid);

    return results.map(r => ({
        title: r.title,
        url: `${PICKIPEDIA_WIKI}/${encodeURIComponent(r.title)}`
    }));
}

/**
 * Find PickiPedia pages for multiple CIDs (batched for efficiency)
 * @param {Array<string>} cids - Array of IPFS CIDs
 * @returns {Promise<Object>} Map of cid -> [{title, url}, ...]
 */
export async function fetchPagesForCids(cids) {
    console.log(`=== PickiPedia CID Pages Lookup ===`);

    // Quick connectivity check
    try {
        const healthCheck = await fetchWithTimeout(`${PICKIPEDIA_API}?action=query&meta=siteinfo&format=json`, 5000);
        if (!healthCheck.ok) {
            console.warn(`  PickiPedia returned non-OK status, skipping CID lookup`);
            return {};
        }
    } catch (e) {
        console.warn(`  PickiPedia health check failed: ${e.message}`);
        return {};
    }

    const result = {};
    const uniqueCids = [...new Set(cids.filter(Boolean))];

    console.log(`  Looking up ${uniqueCids.length} CIDs...`);

    for (const cid of uniqueCids) {
        const pages = await fetchPagesWithCid(cid);
        if (pages.length > 0) {
            result[cid] = pages;
        }
    }

    const foundCount = Object.keys(result).length;
    console.log(`  Found wiki pages for ${foundCount} CIDs`);

    return result;
}

// Allow running standalone for testing
if (import.meta.url === `file://${process.argv[1]}`) {
    fetchPendingSubmissions().then(submissions => {
        console.log(JSON.stringify(submissions, null, 2));
    });
}
