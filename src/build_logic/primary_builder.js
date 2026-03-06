// Node.js built-ins
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// External packages
import yaml from 'js-yaml';
import { marked } from 'marked';
import nunjucks from "nunjucks";

// Local utilities and helpers
import { getProjectDirs } from "./locations.js";
import { slugify } from "./utils/text_utils.js";
import { renderPage, generateSitemapXML, generateSitemapHTML, getSitemap, clearSitemap } from "./utils/rendering_utils.js";
import { registerHelpers } from './utils/template_helpers.js';

// Data and asset management
import { getShowAndSetData } from "./show_and_set_data.js";
import { gatherAssets, unusedImages, imageMapping } from './asset_builder.js';
import { deserializeChainData } from './chaindata_db.js';
import { deserializePinataPins } from './pinata_db.js';
import { appendChainDataToShows } from './chain_reading.js';

// Feature-specific modules
import { generateSetStonePages, renderSetStoneImages } from './setstone_utils.js';
import { verifyBlueRailroadVideos, generateBlueRailroadV2Metadata } from './blue_railroad.js';
import { fetchPendingSubmissions, fetchAllSubmissions, fetchRecordings, fetchPagesForCids } from './pickipedia_submissions.js';
import { cidToBytes32 } from './cid_utils.js';
import { DateTime } from 'luxon';
import { fetchCurrentBlockHeight } from './get_current_blockheight.js';

// IPFS Gateway URLs for build-time checks
const IPFS_GATEWAYS = {
    pinata: 'https://gateway.pinata.cloud/ipfs/',
    deliveryKid: 'https://ipfs.delivery-kid.cryptograss.live/ipfs/',
    // grasshouse: 'http://localhost:8080/ipfs/',  // Add when configured
};

/**
 * Check if a CID is available on a gateway
 * @param {string} gateway - Gateway base URL
 * @param {string} cid - IPFS CID to check
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<boolean>} Whether the CID is available
 */
async function checkGateway(gateway, cid, timeout = 5000) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(gateway + cid, {
            method: 'HEAD',
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Check pinning status across all configured gateways for a list of CIDs
 * @param {Array<string>} cids - List of CIDs to check
 * @returns {Promise<Object>} Map of CID -> { pinata: bool, deliveryKid: bool, ... }
 */
async function checkAllGateways(cids) {
    const results = {};
    const gateways = Object.entries(IPFS_GATEWAYS);

    console.log(`Checking ${cids.length} CIDs across ${gateways.length} gateways...`);

    for (const cid of cids) {
        results[cid] = {};
        for (const [name, url] of gateways) {
            results[cid][name] = await checkGateway(url, cid);
        }
    }

    return results;
}

/**
 * Categorize Pinata pins against known CIDs from submissions, V2 tokens, and recordings
 * @param {Object} pinataPinsData - Raw Pinata data with pins array
 * @param {Array} submissions - All submissions with ipfsCid
 * @param {Object} blueRailroadV2s - V2 tokens keyed by tokenId
 * @param {Array} recordings - Recording pages from PickiPedia with CIDs
 * @param {Object} gatewayStatus - Pre-checked gateway status per CID
 * @returns {Object} Categorized pins with summary
 */
function categorizePinataPins(pinataPinsData, submissions, blueRailroadV2s, recordings = [], gatewayStatus = {}) {
    if (!pinataPinsData || !pinataPinsData.pins) {
        return null;
    }

    // Build lookup maps
    const submissionCidMap = {};  // CID -> submission
    for (const submission of submissions) {
        if (submission.ipfsCid) {
            submissionCidMap[submission.ipfsCid] = submission;
        }
    }

    // Build CID -> recording map (a recording can have multiple CIDs)
    const recordingCidMap = {};  // CID -> { recording, format }
    for (const recording of recordings) {
        for (const { cid, format } of recording.cids) {
            recordingCidMap[cid] = { recording, format };
        }
    }
    if (recordings.length > 0) {
        console.log(`Built recordingCidMap with ${Object.keys(recordingCidMap).length} CIDs from ${recordings.length} recordings`);
    }

    // Build videoHash -> tokenId map (videoHash is bytes32 hex format)
    const tokenVideoHashMap = {};
    if (blueRailroadV2s) {
        for (const [tokenId, token] of Object.entries(blueRailroadV2s)) {
            if (token.videoHash && token.videoHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                tokenVideoHashMap[token.videoHash] = tokenId;
            }
        }
        console.log(`Built tokenVideoHashMap with ${Object.keys(tokenVideoHashMap).length} entries from ${Object.keys(blueRailroadV2s).length} tokens`);
    } else {
        console.log('WARNING: blueRailroadV2s is null/undefined');
    }

    const categorizedPins = [];
    const summary = {
        total: 0,
        totalSize: 0,
        byCategory: {
            'minted-token': 0,
            'submission': 0,
            'recording': 0,
            'blue-railroad': 0,
            'unknown': 0,
        }
    };

    for (const pin of pinataPinsData.pins) {
        const cid = pin.cid;
        let category = 'unknown';
        let linkedSubmissionId = null;
        let linkedTokenId = null;
        let linkedRecording = null;

        // Convert pin CID to bytes32 to compare with token videoHash
        let pinHashBytes32 = null;
        try {
            pinHashBytes32 = cidToBytes32(cid);
        } catch (e) {
            // CID conversion failed, might not be a valid v1 CID
        }

        // Priority 1: Check if CID matches a V2 token videoHash
        if (pinHashBytes32 && tokenVideoHashMap[pinHashBytes32]) {
            category = 'minted-token';
            linkedTokenId = tokenVideoHashMap[pinHashBytes32];
        }
        // Priority 2: Check if CID matches a submission
        else if (submissionCidMap[cid]) {
            category = 'submission';
            linkedSubmissionId = submissionCidMap[cid].id;
        }
        // Priority 3: Check if CID matches a recording
        else if (recordingCidMap[cid]) {
            category = 'recording';
            linkedRecording = {
                title: recordingCidMap[cid].recording.title,
                artists: recordingCidMap[cid].recording.artists,
                format: recordingCidMap[cid].format,
                url: recordingCidMap[cid].recording.url,
            };
        }
        // Priority 4: Check keyvalues.source for blue-railroad
        else if (pin.keyvalues?.source === 'blue-railroad') {
            category = 'blue-railroad';
        }

        categorizedPins.push({
            ...pin,
            category,
            linkedSubmissionId,
            linkedTokenId,
            linkedRecording,
            gatewayStatus: gatewayStatus[cid] || {},
        });

        summary.total++;
        summary.totalSize += pin.size || 0;
        summary.byCategory[category]++;
    }

    return {
        allPins: categorizedPins,
        summary,
        fetchedAt: pinataPinsData.fetchedAt,
        fetchedAtBlock: pinataPinsData.fetchedAtBlock,
    };
}

/**
 * Match submissions to V2 tokens by comparing video hashes
 * @param {Array} submissions - Submissions with ipfsCid
 * @param {Object} blueRailroadV2s - V2 tokens keyed by tokenId
 * @returns {Array} Submissions with matchedTokens array added
 */
function matchSubmissionsToTokens(submissions, blueRailroadV2s) {
    if (!blueRailroadV2s) return submissions;

    // Build a map of videoHash -> token IDs
    const hashToTokens = {};
    for (const [tokenId, token] of Object.entries(blueRailroadV2s)) {
        const hash = token.videoHash;
        if (!hash) continue;
        if (!hashToTokens[hash]) hashToTokens[hash] = [];
        hashToTokens[hash].push({
            tokenId: tokenId,
            owner: token.owner,
            ownerDisplay: token.ownerDisplay || token.owner
        });
    }

    // Match each submission's CID to tokens
    return submissions.map(submission => {
        if (!submission.ipfsCid) {
            return { ...submission, matchedTokens: [] };
        }

        try {
            const hash = cidToBytes32(submission.ipfsCid);
            const tokens = hashToTokens[hash] || [];
            return { ...submission, matchedTokens: tokens };
        } catch (e) {
            console.warn(`Failed to convert CID for submission ${submission.id}:`, e.message);
            return { ...submission, matchedTokens: [] };
        }
    });
}

export const runPrimaryBuild = async () => {
    const oldUmask = process.umask(0o000); // Ensure that proper permissions are applied
    const { outputPrimaryRootDir, dataDir, templateDir, site, outputPrimarySiteDir } = getProjectDirs();
    const { shows, songs, pickers, songsByProvenance } = getShowAndSetData();

    const ensureDirectories = () => {
        const dirs = [
            path.resolve(outputPrimaryRootDir, 'cryptograss/assets'),
            path.resolve(outputPrimaryRootDir, 'setstones'),
            path.resolve(outputPrimaryRootDir, 'cryptograss/tools'),
            path.resolve(outputPrimaryRootDir, 'cryptograss/bazaar'),
        ];

        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
            }
        });
    };
    ensureDirectories();
    console.time('primary-build');
    
    // Clear sitemap from any previous builds
    clearSitemap();

    // TODO: Do we need to make sure the root output directory exists?

    // ...now, same for the site-specific output directory.
    if (fs.existsSync(outputPrimarySiteDir)) {
        fs.rmSync(outputPrimarySiteDir, { recursive: true});
    }
    fs.mkdirSync(outputPrimarySiteDir, { recursive: true, mode: 0o777 });

    /////////////////////////
    ///// Chapter one: chain data
    ////////////////////////////

    // Note: We're not fetching chain data here.  We're just deserializing it.
    // To build chain data, run `npm run fetch-chain-data`.

    console.time('chain-data');
    let chainData;

    try {
        chainData = deserializeChainData();
    } catch (e) {
        // If the error is that the directory wasn't found, make a suggestion.
        if (e.code === 'ENOENT') {
            throw new Error("Chain data not found. You probably need to fetch chain data with `npm run fetch-chain-data`.");
        } else {
            throw e;
        }
    }

    // Verify videos early (V1) and merge with chain data
    const blueRailroadVideoMetadata = await verifyBlueRailroadVideos();
    // Merge video metadata into existing chain data
    // Chain data (owner, ownerDisplay) takes precedence over stale video metadata
    for (const [tokenId, videoData] of Object.entries(blueRailroadVideoMetadata)) {
        if (chainData.blueRailroads[tokenId]) {
            const currentChainData = { ...chainData.blueRailroads[tokenId] };
            // Merge video data first, then restore chain data on top
            Object.assign(chainData.blueRailroads[tokenId], videoData, currentChainData);
        }
    }

    // Generate V2 metadata JSON files (cryptograss.live serves these at /meta/bluerailroad/{tokenId})
    if (site === 'cryptograss.live' && chainData.blueRailroadV2s) {
        generateBlueRailroadV2Metadata(chainData.blueRailroadV2s, outputPrimarySiteDir);
    }

    console.timeEnd("chain-data");

    //////////////////////////////////
    ///// Chapter two: assets
    //////////////////////////////////
    gatherAssets();

    ////////////////////////////////////////////////
    ///// Chapter three: One-off Pages
    /////////////////////////////////////////////
    console.time('One Off Pages');

    ////////
    /// Chapter 3.1: Register helpers, partials, and context
    //////

    ////////
    //// 3.1a: Picker metadata
    //////
    // TODO: Not jazzed to do this here instead of just making this available in the context.
    let songs_by_studio_version = {};
    let all_records = {}
    for (let [song_slug, song] of Object.entries(songs)) {
        if (!song.studio_versions) {
            continue;
        }

        for (let [producing_artist_id, records_including_this_song] of Object.entries(song.studio_versions)) {

            if (!(producing_artist_id == 0)) {
                // TODO: Here's where we'll have logic to deal with albums by artists other than JH+ISB.
                continue;
            }

            for (let [record_name, studio_version] of Object.entries(records_including_this_song)) {
                if (!all_records[song.by_artist_id]) {
                    all_records[song.by_artist_id] = {}
                }
                if (!all_records[song.by_artist_id][record_name]) {
                    all_records[song.by_artist_id][record_name] = [] // TODO: What about track order?
                }
                all_records[song.by_artist_id][record_name].push(studio_version)
                let studio_version_slug = slugify(record_name + '_' + song.slug);
                songs_by_studio_version[studio_version_slug] = studio_version;

                for (let [studio_picker_name, instruments] of Object.entries(studio_version.ensemble)) {
                    let studio_picker_slug = slugify(studio_picker_name);
                    if (!pickers[studio_picker_name]) {
                        pickers[studio_picker_name] = {}
                    }
                    let picker = pickers[studio_picker_name];
                    if (!picker.studio_versions) {
                        picker.studio_versions = []
                        picker.studio_versions_by_record = {}
                    }

                    picker.studio_versions.push(studio_version);
                    if (!picker.studio_versions_by_record[record_name]) {
                        picker.studio_versions_by_record[record_name] = []
                    }


                    if (!picker.instruments) {
                        picker.instruments = {};
                    }
                    for (let instrument of instruments) {
                        if (!picker.instruments[instrument]) {
                            picker.instruments[instrument] = 1
                        } else {
                            picker.instruments[instrument] += 1
                        }
                    }

                    picker.studio_versions_by_record[record_name].push([song, studio_version]);

                } // End ensemble loop
            } // End record loop
        }// End Studio version loop



    }

    // Now that we have studio versions, let's take a brief diversion to add those to the pickers instances.

    for (let [picker_name, picker_data] of Object.entries(pickers)) {
        if (!picker_data.studio_versions) {
            picker_data.studio_versions = [];
        }
        if (!picker_data.shows_as_array) {
            picker_data.shows_as_array = [];
        }
        picker_data.total_instance_count = picker_data.shows_as_array.length + picker_data.studio_versions.length;


        let shows_in_ensemble = 0;

        // Count each show where the picker was in the ensemble (not a featured artist)
        if (picker_data.shows) {
            for (let [showId, instruments] of Object.entries(picker_data.shows)) {
                if (instruments != 'featured') {
                    shows_in_ensemble += 1;
                } else {
                    // console.log(`${picker_name} featured in ${showId}`);
                }
            }
        }

        // Since studio versions happen more rarely but are heard many times, we weigh them much more strongly for the purposes of sorting the pickers on the list.
        picker_data.weighted_total_instance_count = shows_in_ensemble + (picker_data.studio_versions.length * 3);

        // Also, anybody who has both studio versions and shows gets 35% weight increase compared to pickers who have only one or the other.
        if (picker_data.shows_as_array.length > 0 && picker_data.studio_versions.length > 0) {
            picker_data.weighted_total_instance_count *= 1.5;
        }

        // If the picker has been in at least 5 of each, another increase in weight.
        if (picker_data.shows_as_array.length > 5 && picker_data.studio_versions.length > 5) {
            picker_data.weighted_total_instance_count *= 1.25;
        }



        // Shortcut to easily display instruments in the template.
        if (picker_data.instruments) {
            let instruments_sorted = Object.entries(picker_data.instruments).sort((a, b) => {
                return b[1] - a[1] || a[0].localeCompare(b[0]);
            });

            // Then, format them as a comma-separated list.
            picker_data.instruments_display = instruments_sorted.map(instrument => instrument[0]).join(', ');
        } else {
            picker_data.instruments_display = '';
        }

    }

    // Also provide pickers sorted by number of instances.
    let pickers_by_instance_count = Object.entries(pickers).sort(function (a, b) {
        return b[1].weighted_total_instance_count - a[1].weighted_total_instance_count;
    }); // TODO: Man, isn't this going to be fun when we actually have proper model and manager notions of all these things?



    ////////
    //// 3.1b: context population
    //////


    // We'll need helpers....
    registerHelpers(site);

    // A lot going on here - this is where we actually append things like set stones, ticket stubs, etc., to the shows.  Any further chain data that is required to render shows to templates needs to be added here.
    appendChainDataToShows(shows, chainData); // Mutates shows, obviously.

    // Fetch Blue Railroad submissions and recordings from PickiPedia (cryptograss.live only)
    let pendingSubmissions = [];
    let allSubmissions = [];
    let allRecordings = [];
    if (site === 'cryptograss.live') {
        try {
            // Fetch all submissions first (includes both pending and minted)
            allSubmissions = await fetchAllSubmissions();
            // Match submissions to V2 tokens by video hash
            allSubmissions = matchSubmissionsToTokens(allSubmissions, chainData.blueRailroadV2s);
            // Filter to just pending for the pending-submissions page
            pendingSubmissions = allSubmissions.filter(s => s.status.toLowerCase() !== 'minted');
        } catch (e) {
            console.warn('Failed to fetch submissions from PickiPedia:', e.message);
        }

        try {
            // Fetch recording pages with CIDs
            allRecordings = await fetchRecordings();
        } catch (e) {
            console.warn('Failed to fetch recordings from PickiPedia:', e.message);
        }
    }

    const dataAvailableAsContext = {
        "songs": songs,
        "shows": shows,
        'songsByProvenance': songsByProvenance,
        'latest_git_commit': execSync('git rev-parse HEAD').toString().trim(),
        'chainData': chainData,
        'pickers_by_instance_count': pickers_by_instance_count,
        'pendingSubmissions': pendingSubmissions,
        'allSubmissions': allSubmissions,
    };

    if (site === "justinholmes.com") { // TODO: Make this more general
        // Copy client-side partials to the output directory
        fs.cpSync(path.join(templateDir, 'client_partials'),
            path.join(outputPrimarySiteDir, 'client_partials'), { recursive: true });
    }


    ////////////////////
    // Chapter 3.2: Render one-off pages from YAML
    ///////////////////////


    let pageyamlFile = fs.readFileSync(`src/data/${site}.pages.yaml`);
    let pageyaml = yaml.load(pageyamlFile);

    let contextFromPageSpecificFiles = {};
    Object.keys(pageyaml).forEach(page => {
        let pageInfo = pageyaml[page];

        // See if there is a directory in data/page_specifc for this page.
        const pageSpecificDataPath = `src/data/page_specific/${page}`;
        if (fs.existsSync(pageSpecificDataPath)) {
            // Add an entry to the context for this page.
            contextFromPageSpecificFiles[page] = {};

            // Iterate through files in this directory.
            const pageSpecificFiles = fs.readdirSync(pageSpecificDataPath);

            pageSpecificFiles.forEach(file => {
                const fileContents = fs.readFileSync(path.join(pageSpecificDataPath, file), 'utf8');

                // If it's markdown, render it with marked.
                if (file.endsWith('.md')) {
                    contextFromPageSpecificFiles[page][file.replace(/\.md$/, '')] = marked(fileContents);
                }
                // If it's yaml, load it as yaml.
                if (file.endsWith('.yaml')) {
                    contextFromPageSpecificFiles[page][file.replace(/\.yaml$/, '')] = yaml.load(fileContents);
                }
                // TODO: Handle failure case if there are two files with the same name but different extensions.

            });
        }

        let specified_context;

        if (pageInfo['context_from_yaml'] === true) {
            // Load specified context from yaml
            let yaml_for_this_page = fs.readFileSync(`src/data/${page}.yaml`);
            specified_context = { [page]: yaml.load(yaml_for_this_page) };
        } else {
            specified_context = {};
        }

        // TODO: Why is this special?  Can't this be generalized with other data sections for context inclusion?
        if (pageInfo['include_chaindata_as_context'] !== undefined) {
            for (let chainDataSection of pageInfo['include_chaindata_as_context']) {
                specified_context[chainDataSection] = chainData[chainDataSection];
            }
        }

        if (pageInfo['include_data_in_context'] !== undefined) {
            for (let dataSection of pageInfo['include_data_in_context']) {
                let dataSectionToInclude = dataAvailableAsContext[dataSection];
                if (dataSectionToInclude === undefined) {
                    throw new Error(`Data section ${dataSection} requested for page ${page} but not found in dataAvailableAsContext.`);
                }
                specified_context[dataSection] = dataSectionToInclude;
            }
        }

        let context = {
            page_name: page,
            ...pageInfo['context'],
            ...specified_context,
            imageMapping,
            chainData,
        };

        if (contextFromPageSpecificFiles[page]) {
            context = Object.assign({}, context, contextFromPageSpecificFiles[page])
        }
        const template_path = "pages/" + pageInfo["template"];

        const output_path = path.join(pageInfo["template"]).replace(/\.njk$/, '.html');

        renderPage({
            template_path: template_path,
            output_path: output_path,
            context: context,
            layout: pageInfo["base_template"],
            site: site,
        });

    });

    console.timeEnd('One Off Pages');

    ///////////////////////////////////////////
    // Chapter 4: Factory pages (individual shows, songs, etc)  and JSON files
    /////////////////////////////////////////////

    // Render things that we'll need later.

    if (site === "cryptograss.live") {
        generateSetStonePages(shows, path.resolve(outputPrimarySiteDir, 'setstones'));
    }

    // Append set stone favorites to the song objects.  TOOD: Surely this belongs in a better place.
    for (let [show, showId] of Object.entries(shows)) {

        // We're only interested in shows that have set stones.
        if (!show.has_set_stones_available) {
            continue;
        }

        Object.entries(show.sets).forEach(([setNumber, set]) => {
            set.setstones.forEach((setstone, setstoneNumber) => {

                const favoriteSong1Index = setstone.favoriteSong

                setstone.favoriteSongObject = set.songplays[favoriteSong1Index]._song;  // TODO: Terrible name; this needs to be like "moment" instead of "favoriteSong" and then "momentSong" when we resolve it.  Or something.

                setstone.favoriteSongObject.setstoneFavorites.push(setstone);
                console.log(`show ${showId} set ${setNumber} stone ${setstoneNumber} favorite song: ${setstone.favoriteSongObject.slug}`);

            });
        });
    }

    renderSetStoneImages(shows, path.resolve(outputPrimarySiteDir, 'assets/images/setstones'));

    //////////////////////
    // Chapter 4.1: Show pages
    ////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.

        Object.entries(shows).forEach(([show_id, show]) => {
            const page = `show_${show_id}`;

            let context = {
                page_name: page,
                page_title: show.title,
                show,
                imageMapping,
                chainData,
            };

            renderPage({
                template_path: 'reuse/single-show.njk',
                output_path: `shows/${show_id}.html`,
                context: context,
                site: site,
            }
            );

        });

    }

    ///////////////////////////
    // Chapter 4.2: Song pages
    ///////////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.

        Object.entries(songs).forEach(([song_slug, song]) => {
            const page = `song_${song_slug}`;

            let context = {
                page_name: page,
                page_title: song.title,
                song,
                imageMapping,
                chainData,
            };

            // See if we have a MD file with long-form commentary for the song.
            let commentary;
            const commentary_path = path.resolve(dataDir, `songs_and_tunes/${song_slug}.md`);
            if (fs.existsSync(commentary_path)) {
                const commentary_raw = fs.readFileSync(commentary_path, 'utf8');
                const commentary_njk_rendered = nunjucks.renderString(commentary_raw, context)
                commentary = marked(commentary_njk_rendered);
            }

            context.commentary = commentary;

            renderPage({
                template_path: 'reuse/single-song.njk',
                output_path: `songs/${song_slug}.html`,
                context: context,
                site: site,
            }
            );

        });

    }

    ///////////////////////////
    // Chapter 4.2b: Embed pages for songs with chartifacts
    ///////////////////////////

    if (site === "justinholmes.com") {
        Object.entries(songs).forEach(([song_slug, song]) => {
            // Only create embed pages for songs that have chartifacts data
            let chartifacts_version = null;
            if (song.studio_versions) {
                for (const [version_num, version] of Object.entries(song.studio_versions)) {
                    for (const [release_name, release_data] of Object.entries(version)) {
                        if (release_data.rabbithole) {
                            chartifacts_version = release_data;
                            break;
                        }
                    }
                    if (chartifacts_version) break;
                }
            }

            if (chartifacts_version && chartifacts_version.rabbithole) {
                // Prepare song data for the embed iframe
                const songData = {
                    title: song.title,
                    duration: chartifacts_version.rabbithole.duration,
                    audioFile: chartifacts_version.rabbithole.audioFile,
                    ensemble: chartifacts_version.ensemble,
                    timeline: chartifacts_version.rabbithole.timeline,
                    standardSectionLength: chartifacts_version.rabbithole.standardSectionLength,
                    colorScheme: chartifacts_version.rabbithole.colorScheme || null
                };

                const context = {
                    page_name: `embed_chartifacts_${song_slug}`,
                    page_title: `Chartifacts Player - ${song.title}`,
                    songData,
                };

                renderPage({
                    template_path: 'pages/embed/rabbithole.njk',
                    output_path: `embed/rabbithole/${song_slug}.html`,
                    context: context,
                    site: site,
                });

                console.log(`Generated embed page for song: ${song_slug}`);
            }
        });
    }

    ///////////////////////////
    // Chapter 4.2a: Lists of songs
    ///////////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.




        // Make a new array of songs, sorted by song.plays.length
        let songs_sorted_by_plays = Object.values(songs);
        songs_sorted_by_plays.sort((a, b) => {
            return b.plays.length - a.plays.length;
        });

        let context = {
            page_name: "songs-by-plays",
            page_title: "Songs sorted by plays",
            songs: songs_sorted_by_plays,
            imageMapping,
            chainData,
        };

        renderPage({
            template_path: 'pages/songs/songs-by-plays.njk',
            output_path: `songs/songs-by-plays.html`,
            context: context,
            site: site,
        }
        );

    }


    ///////////////////////////
    // Chapter 4.3: Musician pages
    ///////////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.

        Object.entries(pickers).forEach(([picker, picker_data]) => {

            let picker_slug = slugify(picker);

            const shows_played_by_this_picker = picker_data['shows_as_array'];

            let context = {
                page_name: picker,
                page_title: picker,
                picker,
                picker_data,
                imageMapping,
                chainData,
            };

            renderPage({
                template_path: 'reuse/single-picker.njk',
                output_path: `pickers/${picker_slug}.html`,
                context: context,
                site: site,
            }
            );

        });

    }

    ///////////////////////////
    // Chapter 5: Happenings
    ///////////////////////////

    if (site === "cryptograss.live") {  // TODO: This is a hack.  We need to make this more general.  Probably #197.

        // Iterate though YAML files in data/happenings
        let happenings = {};
        fs.readdirSync(path.resolve(dataDir, 'happenings')).forEach(file => {
            if (file.endsWith('.yaml')) {
                const fileContents = fs.readFileSync(path.join(dataDir, 'happenings', file), 'utf8');
                const yamlData = yaml.load(fileContents);
                happenings[file.replace(/\.yaml$/, '')] = yamlData;
            }
        });

        // Find MD file, render the MD therein, and add it as "body" to the happening.
        for (let [happening_epoch_and_slug, happening_data] of Object.entries(happenings)) {
            let context = {} // TOOD: Does anything belong in the context for single happenings?

            let happening_slug = happening_epoch_and_slug.split('-')[1];
            let happening_epoch = happening_epoch_and_slug.split('-')[0];

            const local_dt = DateTime.fromSeconds(parseInt(happening_epoch));
            happening_data['local_datetime'] = local_dt.toLocaleString(DateTime.DATE_MED)
            const md_path = path.resolve(dataDir, 'happenings', `${happening_epoch_and_slug}.md`);
            if (fs.existsSync(md_path)) {
                const md_contents_raw = fs.readFileSync(md_path, 'utf8');
                const md_contents_njk_rendered = nunjucks.renderString(md_contents_raw, context)
                happening_data.body = marked(md_contents_njk_rendered)
            }
        }

        // Render cryptograss.live happenings - TODO: move this to secondary builder.


        // First, all the happenings to the news page (TODO: paginate this? TODO: Turn this into a regular page, with happenigns as context.)
        renderPage({
            template_path: 'pages/happenings.njk',
            output_path: `index.html`,
            site: site,
            context: {
                happenings: happenings,
                site: site,
            }
        });

        for (let [happening_slug, happening_data] of Object.entries(happenings)) {
            renderPage({
                template_path: 'reuse/single-happening.njk',
                output_path: `happenings/${happening_slug}.html`,
                context: happening_data,
                site: site,
            }
            );
        }
    }

    ///////////////////////////
    // Chapter 5.5: Blue Railroad Submission Mint Pages
    ///////////////////////////

    if (site === "cryptograss.live" && pendingSubmissions.length > 0) {
        // Ensure the mint directory exists
        const mintDir = path.join(outputPrimarySiteDir, 'blox-office/admin/mint/bluerailroad/from-pickipedia');
        fs.mkdirSync(mintDir, { recursive: true, mode: 0o777 });

        for (const submission of pendingSubmissions) {
            const context = {
                page_name: `mint_submission_${submission.id}`,
                page_title: `Mint Submission #${submission.id}`,
                submission: submission,
                chainData: chainData,
                latest_git_commit: dataAvailableAsContext.latest_git_commit,
                no_video_bg: true,
            };

            renderPage({
                template_path: 'pages/blox-office/admin/mint-submission.njk',
                output_path: `blox-office/admin/mint/bluerailroad/from-pickipedia/${submission.id}.html`,
                context: context,
                site: site,
            });

            console.log(`Generated mint page for submission #${submission.id}`);
        }
    }

    ///////////////////////////
    // Chapter 5.6: Blue Railroad V1→V2 Upgrade Pages
    ///////////////////////////

    // Generate upgrade pages for V1 tokens not yet migrated to V2
    if (site === "cryptograss.live" && chainData.blueRailroads) {
        const upgradeDir = path.join(outputPrimarySiteDir, 'blox-office/admin/upgrade/bluerailroad');
        fs.mkdirSync(upgradeDir, { recursive: true, mode: 0o777 });

        // Find V1 tokens without corresponding V2 tokens
        const v2TokenIds = new Set(
            chainData.blueRailroadV2s ? Object.keys(chainData.blueRailroadV2s) : []
        );

        const v1TokensNeedingUpgrade = Object.entries(chainData.blueRailroads)
            .filter(([tokenId]) => !v2TokenIds.has(tokenId));

        // Exercise name mapping (same as EXERCISE_MAP in leaderboard.py)
        const EXERCISE_MAP = {
            '5': 'Squats (Blue Railroad Train)',
            '6': 'Pushups (Nine Pound Hammer)',
            '7': 'Squats (Blue Railroad Train) (legacy)',
            '10': 'Army Crawls (Ginseng Sullivan)',
        };

        for (const [tokenId, token] of v1TokensNeedingUpgrade) {
            const exerciseName = EXERCISE_MAP[String(token.songId)] || `Exercise ID ${token.songId}`;

            const context = {
                page_name: `upgrade_token_${tokenId}`,
                page_title: `Upgrade Token #${tokenId} to V2`,
                submission: {
                    isUpgrade: true,
                    v1TokenId: parseInt(tokenId),
                    v1ContractAddress: '0xCe09A2d0d0BDE635722D8EF31901b430E651dB52',
                    songId: parseInt(token.songId) || 5,
                    blockHeight: token.date || 0,  // V1 used 'date' for blockheight
                    exercise: exerciseName,
                    // Use locally-served video (Discord CDN URLs expire)
                    videoUrl: `/assets/fetched/10-0xCe09A2d0d0BDE635722D8EF31901b430E651dB52-${tokenId}.mp4`,
                    owner: token.owner,
                    ownerDisplay: token.ownerDisplay,
                    participants: [],  // Not used for upgrades
                },
                chainData: chainData,
                latest_git_commit: dataAvailableAsContext.latest_git_commit,
                no_video_bg: true,
            };

            renderPage({
                template_path: 'pages/blox-office/admin/mint-submission.njk',
                output_path: `blox-office/admin/upgrade/bluerailroad/${tokenId}.html`,
                context: context,
                site: site,
            });

            console.log(`Generated upgrade page for V1 Token #${tokenId} (owner: ${token.ownerDisplay || token.owner})`);
        }

        if (v1TokensNeedingUpgrade.length > 0) {
            console.log(`Generated ${v1TokensNeedingUpgrade.length} upgrade pages for V1 tokens`);
        }
    }

    ///////////////////////////
    // Chapter 5.7: IPFS Pinning Status Dashboard
    ///////////////////////////

    if (site === "cryptograss.live") {
        // Load and categorize Pinata pins if available
        let categorizedPinataPins = null;
        try {
            const rawPinataPins = deserializePinataPins();
            if (rawPinataPins) {
                // Build sets of CIDs that are ACTUALLY PINNED on each node
                // (not just accessible via gateway)

                // Pinata pins: everything in pins array except delivery-kid-only
                const pinataPinnedCids = new Set();
                for (const pin of rawPinataPins.pins) {
                    if (pin.source !== 'delivery-kid-only') {
                        pinataPinnedCids.add(pin.cid);
                    }
                }

                // Delivery Kid pins: from the local-pins endpoint
                const deliveryKidPinnedCids = new Set();
                if (rawPinataPins.deliveryKidPins?.pins) {
                    for (const pin of rawPinataPins.deliveryKidPins.pins) {
                        deliveryKidPinnedCids.add(pin.cid);
                    }
                }

                console.log(`Actual pins: ${pinataPinnedCids.size} on Pinata, ${deliveryKidPinnedCids.size} on Delivery Kid`);

                // Build gateway status from actual pin lists (no HTTP checks needed)
                const gatewayStatus = {};
                const allCidsInData = new Set(rawPinataPins.pins.map(p => p.cid));

                // Also include submission CIDs that might not be pinned anywhere
                for (const submission of allSubmissions) {
                    if (submission.ipfsCid) {
                        allCidsInData.add(submission.ipfsCid);
                    }
                }

                for (const cid of allCidsInData) {
                    gatewayStatus[cid] = {
                        pinata: pinataPinnedCids.has(cid),
                        deliveryKid: deliveryKidPinnedCids.has(cid),
                        grasshouse: false,  // Not yet configured
                    };
                }

                categorizedPinataPins = categorizePinataPins(
                    rawPinataPins,
                    allSubmissions,
                    chainData.blueRailroadV2s,
                    allRecordings,
                    gatewayStatus
                );

                // Count actual pins on each node (not gateway availability)
                const gatewayCounts = {
                    pinata: pinataPinnedCids.size,
                    deliveryKid: deliveryKidPinnedCids.size,
                    grasshouse: 0,  // Not yet configured
                };
                categorizedPinataPins.gatewayCounts = gatewayCounts;

                console.log(`Loaded ${categorizedPinataPins.summary.total} total CIDs (${categorizedPinataPins.summary.byCategory['minted-token']} minted, ${categorizedPinataPins.summary.byCategory['submission']} submissions, ${categorizedPinataPins.summary.byCategory['recording']} recordings, ${categorizedPinataPins.summary.byCategory['blue-railroad']} blue-railroad, ${categorizedPinataPins.summary.byCategory['unknown']} unknown)`);
                console.log(`Pinned: ${gatewayCounts.pinata} on Pinata, ${gatewayCounts.deliveryKid} on Delivery Kid`);

                // Fetch PickiPedia pages that reference each CID
                const allCids = categorizedPinataPins.allPins.map(p => p.cid);
                const cidPages = await fetchPagesForCids(allCids);
                categorizedPinataPins.cidPages = cidPages;
            }
        } catch (e) {
            console.warn('Failed to load Pinata pins:', e.message);
        }

        // Fetch current blockheight for build timestamp
        let buildBlockheight = null;
        try {
            buildBlockheight = await fetchCurrentBlockHeight();
            console.log(`Build blockheight: ${buildBlockheight}`);
        } catch (e) {
            console.warn('Failed to fetch build blockheight:', e.message);
        }

        renderPage({
            template_path: 'pages/blox-office/admin/ipfs-status.njk',
            output_path: 'blox-office/admin/ipfs-status.html',
            context: {
                page_name: 'ipfs_status',
                page_title: 'IPFS Pinning Status',
                allSubmissions: allSubmissions,
                pinataPins: categorizedPinataPins,
                buildBlockheight: buildBlockheight,
                chainData: chainData,
                latest_git_commit: dataAvailableAsContext.latest_git_commit,
                no_video_bg: true,
            },
            site: site,
        });
        console.log('Generated IPFS pinning status dashboard');
    }

    ///////////////////////////
    // Chapter 5.8: Blue Railroad V1 Tokens Dashboard
    ///////////////////////////

    if (site === "cryptograss.live" && chainData.blueRailroads) {
        const EXERCISE_MAP = {
            '5': 'Squats (Blue Railroad Train)',
            '6': 'Pushups (Nine Pound Hammer)',
            '7': 'Squats (Blue Railroad Train) (legacy)',
            '10': 'Army Crawls (Ginseng Sullivan)',
        };

        const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
        const V1_CONTRACT = '0xCe09A2d0d0BDE635722D8EF31901b430E651dB52';

        // Enrich V1 tokens with video URLs and exercise names
        const v1Tokens = {};
        let burnedCount = 0;

        for (const [tokenId, token] of Object.entries(chainData.blueRailroads)) {
            const isBurned = token.owner === DEAD_ADDRESS;
            if (isBurned) burnedCount++;

            v1Tokens[tokenId] = {
                ...token,
                videoUrl: `/assets/fetched/10-${V1_CONTRACT}-${tokenId}.mp4`,
                exerciseName: EXERCISE_MAP[String(token.songId)] || `Exercise ID ${token.songId}`,
            };
        }

        const totalCount = Object.keys(v1Tokens).length;

        renderPage({
            template_path: 'pages/blox-office/admin/v1-tokens.njk',
            output_path: 'blox-office/admin/v1-tokens.html',
            context: {
                page_name: 'v1_tokens',
                page_title: 'Blue Railroad V1 Tokens',
                v1Tokens: v1Tokens,
                stats: {
                    total: totalCount,
                    burned: burnedCount,
                    active: totalCount - burnedCount,
                },
                chainData: chainData,
                latest_git_commit: dataAvailableAsContext.latest_git_commit,
                no_video_bg: true,
            },
            site: site,
        });
        console.log(`Generated V1 tokens dashboard (${totalCount} tokens, ${burnedCount} burned)`);
    }

    ///////////////////////////
    // Chapter 6: Cleanup
    ///////////////////////////

    // Warn about each unused image.
    console.log(unusedImages.size, 'images were not used.');
    unusedImages.forEach(image => {
    console.warn(`Image not used: ${image}`);
    });

    // Generate sitemaps
    console.time('sitemap-generation');
    const sitemap = getSitemap();
    console.log(`Generated sitemap with ${sitemap.size} pages`);
    
    // Generate XML sitemap (for search engines - goes in normal location)
    const baseUrl = site === 'cryptograss.live' ? 'https://cryptograss.live' : 'https://justinholmes.com';
    const xmlSitemap = generateSitemapXML(site, baseUrl);
    fs.writeFileSync(path.join(outputPrimarySiteDir, 'sitemap.xml'), xmlSitemap);
    
    // Generate HTML sitemap (debug tool - goes outside webpack reach)
    const htmlSitemap = generateSitemapHTML(site);
    const debugSitemapPath = path.join(outputPrimarySiteDir, `sitemap.html`);
    fs.writeFileSync(debugSitemapPath, htmlSitemap);
    console.log(`Debug sitemap written to: ${debugSitemapPath}`);
    
    console.timeEnd('sitemap-generation');

    console.timeEnd('primary-build');
    return true; // TODO: Return something useful.
}
