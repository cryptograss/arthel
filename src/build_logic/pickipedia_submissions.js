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

// Allow running standalone for testing
if (import.meta.url === `file://${process.argv[1]}`) {
    fetchPendingSubmissions().then(submissions => {
        console.log(JSON.stringify(submissions, null, 2));
    });
}
