import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    headlineItems, wikiHref, readyTracks, pagesFound, graphSize, topTidings, getEcosystem,
    rabbitholeLink, baconLink, challengeLink, wikiLink, escapeHtml, decodeEntities,
} from '../src/build_logic/ecosystem.js';

describe('What the sites read from the rest of cryptograss', () => {

    describe('headlines from the wiki', () => {
        test('a headline keeps its links, bold and italics, and its links go to the wiki', () => {
            const html = '<div class="mw-parser-output"><ul>'
                + '<li><b><a href="/wiki/Rabbithole" title="Rabbithole">Rabbithole</a> is in public beta.</b> With <i>August</i>.</li>'
                + '</ul></div>';
            expect(headlineItems(html)).toEqual([
                '<b><a href="https://pickipedia.xyz/wiki/Rabbithole">Rabbithole</a> is in public beta.</b> With <i>August</i>.',
            ]);
        });

        test('nothing else survives: no scripts, no pictures, no handlers, no styles', () => {
            const html = '<ul><li>Hello <script>alert(1)</script><img src="x" onerror="alert(2)">'
                + '<span style="position:fixed" onclick="alert(3)">there</span>'
                + '<a href="/wiki/A" onclick="alert(4)" style="color:red" class="x">A</a></li></ul>';
            const [item] = headlineItems(html);
            expect(item).toBe('Hello alert(1)there<a href="https://pickipedia.xyz/wiki/A">A</a>');
            expect(item).not.toMatch(/<script|<img|<span|onclick|onerror|style=/);
        });

        test('a link that is a script, or to a page nobody has written, is left as words', () => {
            const html = '<ul><li><a href="javascript:alert(1)">click</a> and '
                + '<a href="/index.php?title=Talk:Rabbithole&amp;action=edit&amp;redlink=1" class="new">Talk:Rabbithole</a> and '
                + '<a href="data:text/html,hi">data</a></li></ul>';
            expect(headlineItems(html)).toEqual(['click and Talk:Rabbithole and data']);
        });

        test('text is escaped again, whatever it was', () => {
            const html = '<ul><li>5 &lt; 6 &amp; "quotes" &#60;b&#62;not bold&#60;/b&#62;</li></ul>';
            expect(headlineItems(html)).toEqual(['5 &lt; 6 &amp; &quot;quotes&quot; &lt;b&gt;not bold&lt;/b&gt;']);
        });

        test('a tag left open is closed, and a stray close is dropped', () => {
            expect(headlineItems('<ul><li><b>open <i>both</li></ul>')).toEqual(['<b>open <i>both</i></b>']);
            expect(headlineItems('<ul><li>stray</b> close</i></li></ul>')).toEqual(['stray close']);
        });

        test('a link inside a link is words', () => {
            const html = '<ul><li><a href="/wiki/A">outer <a href="/wiki/B">inner</a></a></li></ul>';
            expect(headlineItems(html)).toEqual(['<a href="https://pickipedia.xyz/wiki/A">outer inner</a>']);
        });

        test('only the first few are taken, and nothing at all is nothing', () => {
            const html = '<ul>' + [1, 2, 3, 4, 5, 6, 7].map((n) => `<li>${n}</li>`).join('') + '</ul>';
            expect(headlineItems(html, { limit: 3 })).toEqual(['1', '2', '3']);
            expect(headlineItems('')).toEqual([]);
            expect(headlineItems(undefined)).toEqual([]);
            expect(headlineItems('<p>no list here</p>')).toEqual([]);
        });
    });

    describe('addresses', () => {
        test("a wiki link's address, for a reader somewhere else", () => {
            expect(wikiHref('/wiki/Kuba_Hejhal')).toBe('https://pickipedia.xyz/wiki/Kuba_Hejhal');
            expect(wikiHref('https://magenta.cryptograss.live/moods/rabbithole/')).toBe('https://magenta.cryptograss.live/moods/rabbithole/');
            expect(wikiHref('/wiki/Kuba%27s_Last?a=1&amp;b=2')).toBe('https://pickipedia.xyz/wiki/Kuba%27s_Last?a=1&b=2');
            expect(wikiHref('javascript:alert(1)')).toBeNull();
            expect(wikiHref('mailto:someone@example.com')).toBeNull();
            expect(wikiHref('')).toBeNull();
            expect(wikiHref(undefined)).toBeNull();
        });

        test('the links the pages draw', () => {
            expect(rabbitholeLink('QmS3QEZFa1c75BBa9vwNEsXkS6GBmS75Cs6RyDJBXqRx8a'))
                .toBe('https://pickipedia.xyz/rabbithole/?track=QmS3QEZFa1c75BBa9vwNEsXkS6GBmS75Cs6RyDJBXqRx8a');
            expect(baconLink('Justin Myles Holmes')).toBe('https://pickipedia.xyz/bacon?p=Justin+Myles+Holmes');
            expect(baconLink('Maybelle Carter', 'Billy Failing')).toBe('https://pickipedia.xyz/bacon?a=Maybelle+Carter&b=Billy+Failing');
            expect(challengeLink('Justin Myles Holmes')).toBe('https://pickipedia.xyz/bacon/challenge/Justin_Myles_Holmes');
            expect(wikiLink('Justin Myles Holmes')).toBe('https://pickipedia.xyz/wiki/Justin_Myles_Holmes');
            expect(wikiLink('Cryptograss:Delivery-kid')).toBe('https://pickipedia.xyz/wiki/Cryptograss:Delivery-kid');
            expect(wikiLink("Barlow's Jig")).toBe("https://pickipedia.xyz/wiki/Barlow's_Jig");
        });

        test('escaping and entities', () => {
            expect(escapeHtml('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
            expect(escapeHtml(null)).toBe('');
            expect(decodeEntities('&amp;&lt;&gt;&quot;&#39;&#x27;&nbsp;&unknown;')).toBe('&<>"\'\' &unknown;');
        });
    });

    describe('the tracks Rabbithole hands out', () => {
        const chart = 'timeline:\n  0: {part: intro}\n  8.3: {part: A}\n';
        const metadata = {
            'Release:QmAugust/Metadata': 'state: production\n' + chart,
            'Release:QmPaint/Metadata': 'state: Production\n' + chart,
            'Release:QmSilver/Metadata': chart,                                       // charted, no state said
            'Release:QmBeta/Metadata': 'state: beta\n' + chart,
            'Release:QmEmpty/Metadata': 'state: production\ntimeline:\n  0: {part: intro}\n',   // one entry is not a chart
            'Release:QmLive/Metadata': 'state: production\n' + chart,
            'Release:QmBroken/Metadata': 'state: production\n  timeline: [unclosed',
            'Something else': 'state: production\n' + chart,
        };
        const releases = {
            'Release:QmAugust': 'title: August\nparent_release: QmRecord\n',
            'Release:QmPaint': 'title: Paint Exchange\nparent_release: QmRecord\n',
            'Release:QmLive': "title: Reuben's Train (from web3summit 2024)\n",
            'Release:QmRecord': 'title: Justin Myles Holmes - 4masks (RC1)\ntracks: [QmSilver, QmPaint, QmOther, QmAugust]\n',
        };

        test('only a track with a chart and state: production; a record is named by its wiki page', () => {
            expect(readyTracks(metadata, releases, { QmRecord: '4masks' })).toEqual([
                { cid: 'QmPaint', title: 'Paint Exchange', record: '4masks', recordCid: 'QmRecord', number: 2 },
                { cid: 'QmAugust', title: 'August', record: '4masks', recordCid: 'QmRecord', number: 4 },
                { cid: 'QmLive', title: "Reuben's Train (from web3summit 2024)", record: '', recordCid: '', number: null },
            ]);
        });

        test("without a wiki page for the record, the Release's own title stands", () => {
            const tracks = readyTracks(metadata, releases);
            expect(tracks[0].record).toBe('Justin Myles Holmes - 4masks (RC1)');
        });

        test('nothing to read is no tracks', () => {
            expect(readyTracks({}, {})).toEqual([]);
            expect(readyTracks(undefined, undefined)).toEqual([]);
        });
    });

    describe('who has a page on the wiki', () => {
        test('a redirect is followed to the page it lands on; a missing page is nobody', () => {
            const answer = {
                query: {
                    normalized: [{ from: 'cory_Walker', to: 'Cory Walker' }],
                    redirects: [{ from: 'Justin Holmes', to: 'Justin Myles Holmes' }],
                    pages: {
                        '-1': { title: 'David Grier', missing: '' },
                        331: { pageid: 331, title: 'Justin Myles Holmes' },
                        400: { pageid: 400, title: 'Cory Walker' },
                    },
                },
            };
            expect(pagesFound(['Justin Holmes', 'David Grier', 'cory_Walker', 'Nobody Asked'], [answer])).toEqual({
                'Justin Holmes': 'Justin Myles Holmes',
                'cory_Walker': 'Cory Walker',
            });
            expect(pagesFound(['Anyone'], [])).toEqual({});
            expect(pagesFound(['Anyone'], [{}])).toEqual({});
        });
    });

    describe("the Oracle's graph and magenta's tidings", () => {
        test("the graph's size, and who is in it", () => {
            const graph = {
                people: [['Cory Walker', 1, 'banjo'], ['Ice Quilitz', 0, '']],
                music: [['a', 'record'], ['b', 'show'], ['c', 'show']],
                ties: [[0, 1, []]],
            };
            expect(graphSize(graph)).toEqual({ pickers: 2, records: 1, shows: 2, ties: 1, names: ['Cory Walker', 'Ice Quilitz'] });
            expect(graphSize(null)).toEqual({ pickers: 0, records: 0, shows: 0, ties: 0, names: [] });
        });

        test('tidings: the ranked links, without the muted ones or anything that is not a web address', () => {
            const answer = {
                links: [
                    { id: 'a', url: 'https://example.com/1', host: 'example.com', title: 'One', by: 'justin', comments: '2' },
                    { id: 'b', url: 'https://example.com/2', title: 'Muted', muted: true },
                    { id: 'c', url: 'javascript:alert(1)', title: 'No' },
                    { id: 'd', url: 'https://example.com/4', title: '' },
                    { id: 'e/f', url: 'http://example.com/5', host: 'example.com', title: 'Five' },
                ],
            };
            expect(topTidings(answer)).toEqual([
                { id: 'a', title: 'One', url: 'https://example.com/1', host: 'example.com', by: 'justin', comments: 2, talk: 'https://magenta.cryptograss.live/tidings/a/' },
                { id: 'e/f', title: 'Five', url: 'http://example.com/5', host: 'example.com', by: '', comments: 0, talk: 'https://magenta.cryptograss.live/tidings/e%2Ff/' },
            ]);
            expect(topTidings(answer, { limit: 1 })).toHaveLength(1);
            expect(topTidings({})).toEqual([]);
            expect(topTidings(null)).toEqual([]);
        });
    });

    describe('asking, keeping, and doing without', () => {
        let cacheDir;
        let warn;
        const MINUTE = 60 * 1000;

        beforeEach(() => {
            cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecosystem-'));
            warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
            delete process.env.SKIP_ECOSYSTEM;
        });

        afterEach(() => {
            warn.mockRestore();
            fs.rmSync(cacheDir, { recursive: true, force: true });
            delete process.env.SKIP_ECOSYSTEM;
        });

        const asker = (answers) => {
            const calls = [];
            const ask = {};
            for (const name of ['news', 'wiki', 'tracks', 'tidings', 'graph']) {
                ask[name] = async () => {
                    calls.push(name);
                    if (answers[name] instanceof Error) {
                        throw answers[name];
                    }
                    return answers[name];
                };
            }
            return { ask, calls };
        };

        test('a site asks only for what it draws, and gets null for the rest', async () => {
            const { ask, calls } = asker({ news: ['a headline'], wiki: { pages: 5 } });
            const found = await getEcosystem({ only: ['news', 'wiki'], cacheDir, ask, now: 1000 });
            expect(calls.sort()).toEqual(['news', 'wiki']);
            expect(found).toEqual({ news: ['a headline'], wiki: { pages: 5 }, tracks: null, tidings: null, graph: null, pages: null });
        });

        test('an answer is kept and not asked for again until it is old', async () => {
            const first = asker({ news: ['old'] });
            await getEcosystem({ only: ['news'], cacheDir, ask: first.ask, now: 0 });

            const soon = asker({ news: ['new'] });
            const kept = await getEcosystem({ only: ['news'], cacheDir, ask: soon.ask, now: 9 * MINUTE });
            expect(soon.calls).toEqual([]);
            expect(kept.news).toEqual(['old']);

            const later = asker({ news: ['new'] });
            const fresh = await getEcosystem({ only: ['news'], cacheDir, ask: later.ask, now: 11 * MINUTE });
            expect(later.calls).toEqual(['news']);
            expect(fresh.news).toEqual(['new']);
        });

        test('a source that is down never fails the build: its last answer stands, or it is left out', async () => {
            const down = asker({ news: new Error('503 from pickipedia.xyz'), tidings: new Error('timeout') });
            const without = await getEcosystem({ only: ['news', 'tidings'], cacheDir, ask: down.ask, now: 0 });
            expect(without.news).toBeNull();
            expect(without.tidings).toBeNull();

            const up = asker({ news: ['a headline'], tidings: [] });
            await getEcosystem({ only: ['news', 'tidings'], cacheDir, ask: up.ask, now: 6 * MINUTE });

            const downAgain = asker({ news: new Error('503'), tidings: new Error('503') });
            const stale = await getEcosystem({ only: ['news', 'tidings'], cacheDir, ask: downAgain.ask, now: 60 * MINUTE });
            expect(downAgain.calls.sort()).toEqual(['news', 'tidings']);
            expect(stale.news).toEqual(['a headline']);
            expect(warn).toHaveBeenCalled();
        });

        test('a source that did not answer is left alone for five minutes, then asked again', async () => {
            const down = asker({ news: new Error('503') });
            await getEcosystem({ only: ['news'], cacheDir, ask: down.ask, now: 0 });
            expect(down.calls).toEqual(['news']);

            const stillDown = asker({ news: new Error('503') });
            const soon = await getEcosystem({ only: ['news'], cacheDir, ask: stillDown.ask, now: 2 * MINUTE });
            expect(stillDown.calls).toEqual([]);
            expect(soon.news).toBeNull();

            const back = asker({ news: ['a headline'] });
            const later = await getEcosystem({ only: ['news'], cacheDir, ask: back.ask, now: 6 * MINUTE });
            expect(back.calls).toEqual(['news']);
            expect(later.news).toEqual(['a headline']);

            // ...and one that goes down after answering keeps its answer, and is not asked every build
            const downAgain = asker({ news: new Error('503') });
            await getEcosystem({ only: ['news'], cacheDir, ask: downAgain.ask, now: 20 * MINUTE });
            const quiet = asker({ news: new Error('503') });
            const kept = await getEcosystem({ only: ['news'], cacheDir, ask: quiet.ask, now: 22 * MINUTE });
            expect(quiet.calls).toEqual([]);
            expect(kept.news).toEqual(['a headline']);
        });

        test('a source that never finishes answering does not hold the build', async () => {
            jest.useFakeTimers();
            try {
                const ask = { news: () => new Promise(() => {}) };       // never settles
                const waiting = getEcosystem({ only: ['news'], cacheDir, ask, now: 0 });
                await jest.advanceTimersByTimeAsync(60 * 1000);
                const found = await waiting;
                expect(found.news).toBeNull();
                expect(warn).toHaveBeenCalledWith(expect.stringContaining('no answer in'));
            } finally {
                jest.useRealTimers();
            }
        });

        test('pages are asked for by name, and asked again when the names change', async () => {
            const seen = [];
            const askForPages = async (names) => {
                seen.push(names);
                return Object.fromEntries(names.map((n) => [n, n]));
            };
            const { ask } = asker({});
            const one = await getEcosystem({ only: ['pages'], cacheDir, ask, askForPages, names: ['B', 'A', 'A'], now: 0 });
            expect(seen).toEqual([['A', 'B']]);
            expect(one.pages).toEqual({ A: 'A', B: 'B' });

            await getEcosystem({ only: ['pages'], cacheDir, ask, askForPages, names: ['A', 'B'], now: MINUTE });
            expect(seen).toHaveLength(1);

            await getEcosystem({ only: ['pages'], cacheDir, ask, askForPages, names: ['A', 'B', 'C'], now: 2 * MINUTE });
            expect(seen).toHaveLength(2);

            const nobody = await getEcosystem({ only: ['pages'], cacheDir: path.join(cacheDir, 'other'), ask, askForPages, names: [], now: 0 });
            expect(seen).toHaveLength(2);
            expect(nobody.pages).toBeNull();
        });

        test('a kept file that is not JSON is as good as none', async () => {
            fs.writeFileSync(path.join(cacheDir, 'ecosystem.json'), '{"news": {"at": 0, "val');
            const { ask, calls } = asker({ news: ['again'] });
            const found = await getEcosystem({ only: ['news'], cacheDir, ask, now: 1 });
            expect(calls).toEqual(['news']);
            expect(found.news).toEqual(['again']);
        });

        test('SKIP_ECOSYSTEM=true asks nobody anything', async () => {
            process.env.SKIP_ECOSYSTEM = 'true';
            const { ask, calls } = asker({ news: ['a headline'] });
            const found = await getEcosystem({ only: ['news'], cacheDir, ask, now: 0 });
            expect(calls).toEqual([]);
            expect(found.news).toBeNull();
        });
    });
});
