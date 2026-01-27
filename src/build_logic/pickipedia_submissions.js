/**
 * Fetches pending Blue Railroad submissions from PickiPedia at build time.
 * Uses MediaWiki Action API to avoid CORS issues.
 */

const PICKIPEDIA_API = 'https://pickipedia.xyz/api.php';
const PICKIPEDIA_WIKI = 'https://pickipedia.xyz/wiki';

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
        const response = await fetch(url);
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
        const response = await fetch(url);
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

    // Extract participants from Blue Railroad Participant templates
    const participants = [];
    const participantRegex = /\{\{Blue Railroad Participant\s*\|name=([^\n|}]+)\s*\|wallet=([^\n|}]+)\s*\}\}/g;
    let match;
    while ((match = participantRegex.exec(content)) !== null) {
        participants.push({
            name: match[1].trim(),
            wallet: match[2].trim()
        });
    }

    return {
        exercise: exerciseMatch ? exerciseMatch[1].trim() : 'Unknown',
        video: videoMatch ? videoMatch[1].trim() : null,
        blockHeight: blockHeightMatch ? blockHeightMatch[1] : null,
        status: statusMatch ? statusMatch[1].trim() : 'Pending',
        participants: participants
    };
}

/**
 * Determine song ID from exercise name
 */
function getSongIdFromExercise(exercise) {
    const lower = exercise.toLowerCase();
    if (lower.includes('blue railroad')) return 5;
    if (lower.includes('nine pound')) return 6;
    if (lower.includes('ginseng')) return 10;
    return null;
}

/**
 * Fetch all pending submissions from PickiPedia
 * Checks submissions 1-20 (can be expanded as needed)
 */
export async function fetchPendingSubmissions() {
    const submissions = [];
    const MAX_SUBMISSION_ID = 20;

    console.log('Fetching Blue Railroad submissions from PickiPedia...');

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
            participants: parsed.participants,
            songId: getSongIdFromExercise(parsed.exercise)
        };

        submissions.push(submission);
        console.log(`  Submission #${i}: ${parsed.exercise} (${parsed.participants.length} participants)`);
    }

    console.log(`Found ${submissions.length} pending submission(s)`);
    return submissions;
}

// Allow running standalone for testing
if (import.meta.url === `file://${process.argv[1]}`) {
    fetchPendingSubmissions().then(submissions => {
        console.log(JSON.stringify(submissions, null, 2));
    });
}
