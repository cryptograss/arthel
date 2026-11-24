/*
 * Regenerate __tests__/fixtures/time_data.json: the show times the test suite
 * reads when TEST_TIME_DATA is set (see deserializeTimeData in
 * src/build_logic/chaindata_db.js).
 *
 * The real src/data/time_data.json is fetched, never committed (.gitignore):
 * it needs ALCHEMY_API_KEY, which lives in the vault. But the suite must run
 * from a clean checkout, so the suite's times are committed here instead.
 *
 * These times are the real ones wherever a public node can serve them:
 *   - post-Merge blocks: eth_getBlockByNumber on a public RPC (ETH_RPC_URL,
 *     default the same publicnode memory-lane uses), exact timestamps.
 *   - pre-Merge blocks: public nodes have pruned that history (memory-lane,
 *     conversations/services/eth_blocks.py, keeps the same rule), so those
 *     shows get midnight local time on the date the live site renders from
 *     the real fetched data -- day precision, not the hour.
 *
 * Run it after adding a show, or after the chain fetch if you have the key:
 * the suite fails loudly ("No time data for show <id>") on a show the fixture
 * does not know.     node scripts/make_test_time_data.mjs
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { DateTime } from 'luxon';
import { fileURLToPath } from 'url';

const RPC_URL = process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';
const LIVE_SHOW_URL = 'https://justinholmes.com/shows/';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const showsDir = path.resolve(repoRoot, 'src', 'data', 'shows');
const fixturePath = path.resolve(repoRoot, '__tests__', 'fixtures', 'time_data.json');

async function blockTimestamp(blockNumber) {
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber',
            params: [`0x${blockNumber.toString(16)}`, false],
        }),
    });
    const body = await response.json();
    if (body.error || !body.result) {
        return null; // e.g. publicnode prunes history below block 15500000
    }
    return parseInt(body.result.timestamp, 16);
}

/** The date the live site renders for the show, as "August 20, 2024". */
async function liveShowDate(showID) {
    const response = await fetch(LIVE_SHOW_URL + showID);
    if (!response.ok) {
        throw new Error(`live site has no page for ${showID} (${response.status})`);
    }
    const html = await response.text();
    const match = html.match(/<h4[^>]*>([A-Z][a-z]+ \d{1,2}, \d{4})<\/h4>/);
    if (!match) {
        throw new Error(`could not read a local date off the page for ${showID}`);
    }
    return match[1];
}

const showYAMLs = fs.readdirSync(showsDir).filter((f) => f.endsWith('.yaml'));
const times = {};
const sources = {};
for (const showYAML of showYAMLs) {
    const showID = showYAML.split('.')[0];
    const blockNumber = parseInt(showID.split('-')[1], 10);
    const show = yaml.load(fs.readFileSync(path.resolve(showsDir, showYAML), 'utf8'));

    const timestamp = await blockTimestamp(blockNumber);
    if (timestamp !== null) {
        times[showID] = timestamp;
        sources[showID] = `block ${blockNumber}`;
        continue;
    }

    // Pruned from the public node: midnight local time on the show's date.
    const localDate = await liveShowDate(showID);
    const midnight = DateTime.fromFormat(localDate, 'MMMM d, yyyy', { zone: show.timezone, locale: 'en-US' });
    if (!midnight.isValid) {
        throw new Error(`could not parse "${localDate}" for ${showID} in ${show.timezone}`);
    }
    times[showID] = Math.round(midnight.toSeconds());
    sources[showID] = `midnight local of ${localDate} (block pruned)`;
    console.log(`${showID}: block pruned, using midnight local ${localDate}`);
}

fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
fs.writeFileSync(fixturePath, JSON.stringify(times, null, 2) + '\n');
console.log(`Wrote ${Object.keys(times).length} shows to ${path.relative(repoRoot, fixturePath)}`);
for (const [showID, source] of Object.entries(sources)) {
    if (!source.startsWith('block')) {
        console.log(`  ${showID}: ${source}`);
    }
}