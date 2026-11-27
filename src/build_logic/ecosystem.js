/**
 * What these two sites show of the rest of cryptograss: PickiPedia's headlines and size, the tracks
 * Rabbithole hands out, the size of the Oracle of Bluegrass Bacon's graph, and magenta's tidings.
 *
 * Production builds every two minutes, so what is read here is on the sites within minutes of
 * changing over there. Three rules:
 *
 *  - Nothing here can fail a build. A source that doesn't answer within its time is left out, and
 *    the templates draw the page without it.
 *  - Nothing here is asked for more often than its `every` says. Answers are kept in
 *    output/_prebuild_ecosystem/<site>/ecosystem.json; when a source is down, its last answer
 *    stands, and it is left alone for five minutes before it is asked again.
 *  - Nothing read here reaches a page as markup, except PickiPedia's headlines, and those only
 *    after headlineItems() has rebuilt them from an allowlist (text, bold, italic, links).
 *
 * Asked for in #other-web, 27 Nov 2026 (Justin: the sites "don't presuppose pickipedia, magenta,
 * or The Oracle of Bluegrass Bacon at all").
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const PICKIPEDIA = 'https://pickipedia.xyz';
export const MAGENTA = 'https://magenta.cryptograss.live';
export const RABBITHOLE = PICKIPEDIA + '/rabbithole/';
export const BACON = PICKIPEDIA + '/bacon';

const MINUTE = 60 * 1000;

/** How long each answer is good for, and how long to wait for one request of it. */
const SOURCES = {
    news: { every: 10 * MINUTE, wait: 6000 },
    wiki: { every: 60 * MINUTE, wait: 6000 },
    tracks: { every: 10 * MINUTE, wait: 10000 },
    pages: { every: 60 * MINUTE, wait: 8000 },
    tidings: { every: 10 * MINUTE, wait: 6000 },
    graph: { every: 6 * 60 * MINUTE, wait: 20000 },   // 2 MB: a few times a day is plenty
};

/** A source that didn't answer is left alone this long: a build every two minutes is no help to a server that is down. */
const RETRY = 5 * MINUTE;

/** A source made of several requests gets this many of its `wait`s in all, however slowly each is answered. */
const PATIENCE = 3;

/* ------------------------------------------------------------------------------------------
 * Pure parts: text in, data out. These are what __tests__/ecosystem.test.js checks.
 * --------------------------------------------------------------------------------------- */

export function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The text an HTML fragment's entities stand for. */
export function decodeEntities(text) {
    return String(text).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name) => {
        if (name[0] === '#') {
            const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
        }
        const known = ENTITIES[name.toLowerCase()];
        return known === undefined ? whole : known;
    });
}

/**
 * Where a link in the wiki's own HTML points, as an address a reader of another site can follow;
 * null when it is not one to carry over (a link to a page nobody has written, a script, a fragment).
 */
export function wikiHref(raw, base = PICKIPEDIA) {
    const href = decodeEntities(raw || '').trim();
    if (!href || /redlink=1/.test(href)) {
        return null;
    }
    let url;
    try {
        url = new URL(href, base + '/');
    } catch (e) {
        return null;
    }
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
}

/**
 * PickiPedia's headlines (Template:NewsShorts, as the wiki renders it) as a list of safe HTML
 * strings, one per headline. Rebuilt, not passed through: the only tags that survive are <a href>,
 * <b> and <i>, a link keeps its address and nothing else, and every run of text is escaped again.
 */
export function headlineItems(html, { limit = 5 } = {}) {
    const items = [];
    for (const [, inner] of String(html || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
        let out = '';
        const open = [];
        let at = 0;
        for (const tag of inner.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
            out += escapeHtml(decodeEntities(inner.slice(at, tag.index)));
            at = tag.index + tag[0].length;
            const closing = tag[1] === '/';
            const name = { strong: 'b', em: 'i' }[tag[2].toLowerCase()] || tag[2].toLowerCase();
            if (!['a', 'b', 'i'].includes(name)) {
                continue;
            }
            if (closing) {
                const last = open.lastIndexOf(name);
                if (last !== -1) {
                    out += open.splice(last).reverse().map((n) => `</${n}>`).join('');
                }
                continue;
            }
            if (name === 'a') {
                const href = wikiHref((/\bhref="([^"]*)"/i.exec(tag[3]) || [])[1]);
                if (!href || open.includes('a')) {
                    continue;                                   // its text stays, as text
                }
                out += `<a href="${escapeHtml(href)}">`;
            } else {
                out += `<${name}>`;
            }
            open.push(name);
        }
        out += escapeHtml(decodeEntities(inner.slice(at)));
        out += open.reverse().map((n) => `</${n}>`).join('');
        out = out.replace(/\s+/g, ' ').trim();
        if (out) {
            items.push(out);
        }
        if (items.length >= limit) {
            break;
        }
    }
    return items;
}

/**
 * The tracks Rabbithole hands out, from the wiki's own pages: those whose /Metadata page has a
 * chart (a timeline of more than one entry) and says `state: production`.
 *
 * This is rabbithole's rule, not a second one: src/wiki/api.js there (chartedTracks, readyTracks;
 * Justin, #rabbithole, 16 Nov 2026: "the state of the metadata is either alpha, beta or
 * production"). If that rule changes, this is the copy to change with it.
 *
 * A record is named by the wiki page that carries its Release ({{Record release}} on [[4masks]]
 * names Release:QmUWtV…), since that is the name people use, and the one arthel's own data has:
 * the Release's own title is the pinner's ("Justin Myles Holmes - 4masks (RC1)").
 *
 * @param {Object} metadataTexts  "Release:<cid>/Metadata" -> its text
 * @param {Object} releaseTexts   "Release:<cid>" -> its text, for the tracks and for their records
 * @param {Object} recordPages    a record's cid -> the wiki page that carries it
 * @returns {Array<{cid, title, record, recordCid, number}>} by record (those on none, last), then running order, then title
 */
export function readyTracks(metadataTexts, releaseTexts, recordPages = {}) {
    const load = (text) => {
        try {
            const data = yaml.load(text || '');
            return data && typeof data === 'object' ? data : {};
        } catch (e) {
            return {};
        }
    };
    const tracks = [];
    for (const [title, text] of Object.entries(metadataTexts || {})) {
        const match = /^Release:(.+)\/Metadata$/.exec(title);
        if (!match) {
            continue;
        }
        const data = load(text);
        const charted = data.timeline && typeof data.timeline === 'object' && Object.keys(data.timeline).length > 1;
        const state = typeof data.state === 'string' ? data.state.trim().toLowerCase() : '';
        if (!charted || state !== 'production') {
            continue;
        }
        const cid = match[1];
        const release = load((releaseTexts || {})['Release:' + cid]);
        const recordCid = typeof release.parent_release === 'string' ? release.parent_release : '';
        const record = recordCid ? load((releaseTexts || {})['Release:' + recordCid]) : {};
        const order = Array.isArray(record.tracks) ? record.tracks.findIndex((t) => t === cid || (t && t.cid === cid)) : -1;
        tracks.push({
            cid,
            title: String(release.title || data.title || cid),
            record: String(recordPages[recordCid] || record.title || ''),
            recordCid,
            number: order === -1 ? null : order + 1,
        });
    }
    // A record's tracks first, in its running order; then those on no record.
    return tracks.sort((a, b) => (a.record === '') - (b.record === '') || a.record.localeCompare(b.record)
        || (a.number ?? 999) - (b.number ?? 999) || a.title.localeCompare(b.title));
}

/** The address that plays a track in Rabbithole. */
export function rabbitholeLink(cid) {
    return RABBITHOLE + '?track=' + encodeURIComponent(cid);
}

/** A picker's own graph in the Oracle; two pickers, the music between them. */
export function baconLink(a, b) {
    return BACON + '?' + new URLSearchParams(b ? { a, b } : { p: a });
}

/** The Six Degrees, with this picker to find. */
export function challengeLink(name) {
    return BACON + '/challenge/' + encodeURIComponent(String(name).trim().replace(/\s+/g, '_'));
}

/** A wiki page's address. */
export function wikiLink(title) {
    return PICKIPEDIA + '/wiki/' + encodeURIComponent(String(title).replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':');
}

/**
 * Which of these names have a page on PickiPedia, and what the page is called (a redirect is
 * followed: "Justin Holmes" is [[Justin Myles Holmes]]). From one or more answers to
 * action=query&redirects=1.
 */
export function pagesFound(names, answers) {
    const found = {};
    for (const answer of answers || []) {
        const query = (answer && answer.query) || {};
        const step = {};
        for (const hop of [...(query.normalized || []), ...(query.redirects || [])]) {
            step[hop.from] = hop.to;
        }
        const there = new Set(Object.values(query.pages || {}).filter((p) => p.missing === undefined && p.invalid === undefined).map((p) => p.title));
        for (const name of names) {
            let title = name;
            for (let hops = 0; step[title] !== undefined && hops < 5; hops++) {
                title = step[title];
            }
            if (there.has(title)) {
                found[name] = title;
            }
        }
    }
    return found;
}

/** The size of the Oracle's graph, and the names of the pickers in it, from graph.json. */
export function graphSize(graph) {
    const music = Array.isArray(graph && graph.music) ? graph.music : [];
    const people = Array.isArray(graph && graph.people) ? graph.people : [];
    return {
        pickers: people.length,
        records: music.filter((m) => m[1] === 'record').length,
        shows: music.filter((m) => m[1] === 'show').length,
        ties: Array.isArray(graph && graph.ties) ? graph.ties.length : 0,
        names: people.map((p) => String(p[0])),
    };
}

/** magenta's top tidings: the links people shared, in the order magenta ranks them. */
export function topTidings(answer, { limit = 5 } = {}) {
    const links = Array.isArray(answer && answer.links) ? answer.links : [];
    return links.filter((t) => t && !t.muted && typeof t.url === 'string' && /^https?:\/\//.test(t.url) && t.title)
        .slice(0, limit)
        .map((t) => ({
            id: String(t.id || ''),
            title: String(t.title),
            url: t.url,
            host: String(t.host || ''),
            by: String(t.by || ''),
            comments: Number(t.comments) || 0,
            talk: t.id ? `${MAGENTA}/tidings/${encodeURIComponent(t.id)}/` : MAGENTA + '/tidings/',
        }));
}

/* ------------------------------------------------------------------------------------------
 * Asking
 * --------------------------------------------------------------------------------------- */

async function getJson(url, wait) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), wait);
    try {
        const response = await fetch(url, { signal: stop.signal, headers: { 'User-Agent': 'arthel-build (cryptograss.live)' } });
        if (!response.ok) {
            throw new Error(`${response.status} from ${new URL(url).host}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

const wikiApi = (params, wait) => getJson(PICKIPEDIA + '/api.php?' + new URLSearchParams({ format: 'json', ...params }), wait);

/** Every page named, as {title: text}, fifty to a request. */
async function pageTexts(titles, wait) {
    const texts = {};
    for (let i = 0; i < titles.length; i += 50) {
        const answer = await wikiApi({
            action: 'query', titles: titles.slice(i, i + 50).join('|'), prop: 'revisions', rvprop: 'content', rvslots: 'main',
        }, wait);
        for (const page of Object.values((answer.query && answer.query.pages) || {})) {
            const text = page.revisions && page.revisions[0] && page.revisions[0].slots && page.revisions[0].slots.main && page.revisions[0].slots.main['*'];
            if (text !== undefined) {
                texts[page.title] = text;
            }
        }
    }
    return texts;
}

const ASK = {
    async news(wait) {
        const answer = await wikiApi({
            action: 'parse', page: 'Template:NewsShorts', prop: 'text', formatversion: '2',
            disablelimitreport: '1', disableeditsection: '1',
        }, wait);
        return headlineItems(answer.parse && answer.parse.text);
    },

    async wiki(wait) {
        const answer = await wikiApi({ action: 'query', meta: 'siteinfo', siprop: 'statistics' }, wait);
        const s = (answer.query && answer.query.statistics) || {};
        return { pages: s.pages || 0, articles: s.articles || 0, edits: s.edits || 0, users: s.users || 0 };
    },

    async tracks(wait) {
        const titles = [];
        let from;
        do {
            const answer = await wikiApi({ action: 'query', list: 'allpages', apnamespace: '3004', aplimit: '500', ...(from ? { apcontinue: from } : {}) }, wait);
            for (const page of (answer.query && answer.query.allpages) || []) {
                if (page.title.endsWith('/Metadata')) {
                    titles.push(page.title);
                }
            }
            from = answer.continue && answer.continue.apcontinue;
        } while (from);
        const metadata = await pageTexts(titles, wait);
        const cids = Object.keys(metadata).map((t) => t.slice('Release:'.length, -'/Metadata'.length));
        const releases = await pageTexts(cids.map((cid) => 'Release:' + cid), wait);
        const parents = new Set();
        for (const text of Object.values(releases)) {
            try {
                const parent = (yaml.load(text) || {}).parent_release;
                if (typeof parent === 'string' && parent) {
                    parents.add('Release:' + parent);
                }
            } catch (e) { /* a page that isn't YAML names no record */ }
        }
        Object.assign(releases, await pageTexts([...parents], wait));
        // The article that carries each record: the main-namespace page that links its Release.
        const recordPages = {};
        for (const parent of parents) {
            const answer = await wikiApi({ action: 'query', list: 'backlinks', bltitle: parent, blnamespace: '0', bllimit: '5' }, wait);
            const carriers = (answer.query && answer.query.backlinks) || [];
            if (carriers.length) {
                recordPages[parent.slice('Release:'.length)] = carriers[0].title;
            }
        }
        return readyTracks(metadata, releases, recordPages);
    },

    async tidings(wait) {
        return topTidings(await getJson(MAGENTA + '/api/tidings/', wait));
    },

    async graph(wait) {
        return graphSize(await getJson(PICKIPEDIA + '/assets/connectome/graph.json', wait));
    },
};

/** Which of these names have a PickiPedia page: {name: page title}. */
async function askPages(names, wait) {
    const answers = [];
    for (let i = 0; i < names.length; i += 50) {
        answers.push(await wikiApi({ action: 'query', titles: names.slice(i, i + 50).join('|'), redirects: '1' }, wait));
    }
    return pagesFound(names, answers);
}

/**
 * What a site asked for, each from its last answer unless that is older than its `every`.
 *
 * Each site keeps its own answers (the two are built side by side, in one workspace), and asks
 * only for what it draws.
 *
 * @param {Object} options
 * @param {string[]} options.only     the sources this site draws: news, wiki, tracks, tidings, graph, pages
 * @param {string} options.cacheDir   where this site's answers are kept between builds
 * @param {string[]} options.names    for `pages`: the people to look for on PickiPedia
 * @param {number} options.now        for the tests
 * @param {Object} options.ask        for the tests
 * @returns {Promise<{news, wiki, tracks, tidings, graph, pages}>} null for a source not asked, or never answered
 */
export async function getEcosystem({ only = Object.keys(SOURCES), cacheDir, names = [], now = Date.now(), ask = ASK, askForPages = askPages } = {}) {
    const nothing = { news: null, wiki: null, tracks: null, tidings: null, graph: null, pages: null };
    if (process.env.SKIP_ECOSYSTEM === 'true') {
        return nothing;
    }
    const cachePath = cacheDir ? path.join(cacheDir, 'ecosystem.json') : null;
    let kept = {};
    if (cachePath && fs.existsSync(cachePath)) {
        try {
            kept = JSON.parse(fs.readFileSync(cachePath, 'utf8')) || {};
        } catch (e) {
            kept = {};
        }
    }

    const wanted = [...new Set(names)].sort();
    const jobs = only.filter((name) => SOURCES[name]).map(async (name) => {
        const { every, wait } = SOURCES[name];
        const last = kept[name];
        const answered = last && last.at !== undefined;
        const sameAsk = name !== 'pages' || (last && JSON.stringify(last.names) === JSON.stringify(wanted));
        if (answered && sameAsk && now - last.at < every) {
            return;
        }
        if (last && sameAsk && last.tried !== undefined && now - last.tried < RETRY) {
            return;                                             // it didn't answer a moment ago: not yet
        }
        if (name === 'pages' && wanted.length === 0) {
            return;
        }
        try {
            const value = await withDeadline(name === 'pages' ? askForPages(wanted, wait) : ask[name](wait), wait * PATIENCE);
            kept[name] = name === 'pages' ? { at: now, value, names: wanted } : { at: now, value };
        } catch (e) {
            console.warn(`ecosystem: ${name} did not answer (${e.message}); ${answered && sameAsk ? 'its last answer stands' : 'left out of this build'}`);
            kept[name] = answered && sameAsk ? { ...last, tried: now } : (name === 'pages' ? { tried: now, names: wanted } : { tried: now });
        }
    });
    await Promise.all(jobs);

    if (cachePath) {
        try {
            fs.mkdirSync(cacheDir, { recursive: true });
            const partial = cachePath + '.' + process.pid + '.partial';
            fs.writeFileSync(partial, JSON.stringify(kept));
            fs.renameSync(partial, cachePath);                  // whole, or not at all
        } catch (e) {
            console.warn('ecosystem: could not keep the answers:', e.message);
        }
    }

    const found = { ...nothing };
    for (const name of only) {
        if (kept[name] && kept[name].at !== undefined && name in found) {
            found[name] = kept[name].value;
        }
    }
    return found;
}

/** A promise's answer, or an error once `ms` have gone by without one. */
function withDeadline(promise, ms) {
    let timer;
    const late = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(ms / 1000)}s`)), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
