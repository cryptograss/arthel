import { describe, test, expect } from '@jest/globals';
import nunjucks from 'nunjucks';
import path from 'path';

/**
 * The pages both sites open on, drawn twice: with nothing read from the rest of cryptograss
 * (PickiPedia and magenta both down, a first build with nothing kept), and with everything.
 * A page that can only be drawn when another server answers would stop the build that makes it.
 */

const site = (name) => {
    const templates = path.resolve('src/sites', name, 'templates');
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader([templates, path.join(templates, name)]), { autoescape: false });
    env.addGlobal('get_image', (file) => `/assets/images/${file}`);
    env.addGlobal('getCryptograssUrl', () => 'https://cryptograss.live');
    env.addGlobal('get_record_metadata', (record) => ({ bandcamp_url: `https://justinholmes.bandcamp.com/album/${record}` }));
    env.addFilter('slugify', (text) => String(text).toLowerCase().replace(/\s+/g, '-'));
    return env;
};

const links = {
    pickipedia: 'https://pickipedia.xyz',
    magenta: 'https://magenta.cryptograss.live',
    rabbithole: 'https://pickipedia.xyz/rabbithole/',
    bacon: 'https://pickipedia.xyz/bacon',
    justin: {
        page: 'Justin Myles Holmes',
        wiki: 'https://pickipedia.xyz/wiki/Justin_Myles_Holmes',
        bacon: 'https://pickipedia.xyz/bacon?p=Justin+Myles+Holmes',
        challenge: 'https://pickipedia.xyz/bacon/challenge/Justin_Myles_Holmes',
    },
};

const tracks = [
    { cid: 'QmPaint', title: 'Paint Exchange', record: '4masks', listen: 'https://pickipedia.xyz/rabbithole/?track=QmPaint' },
    { cid: 'QmLive', title: "Reuben's Train", record: '', listen: 'https://pickipedia.xyz/rabbithole/?track=QmLive' },
];

const everything = {
    ...links,
    news: ['<b><a href="https://pickipedia.xyz/wiki/Rabbithole">Rabbithole</a> is in public beta.</b>'],
    wiki: { pages: 3465, articles: 1103, edits: 17523, users: 201 },
    tracks,
    tracks_by_record: { '4masks': [tracks[0]], '': [tracks[1]] },
    tidings: [{ id: 'a', title: 'A <script>alert(1)</script> title', url: 'https://example.com/?a=1&b="2"', host: 'example.com', by: 'justin', comments: 2, talk: 'https://magenta.cryptograss.live/tidings/a/' }],
    graph: { pickers: 1824, records: 255, shows: 315, ties: 48530, names: [] },
    pages: {},
};

const build = { commit: 'a7f219fa1506334b3b4cb42a2e26ca9e2849ace1', commit_short: 'a7f219fa', block: 26503860, block_display: '26,503,860', shows: 2, songs: 3, pickers: 2, setstones: 1, blueRailroads: 11, vowelSoundsContributions: 29 };

const show = (blockheight, more = {}) => ({
    show_id: `0-${blockheight}`,
    title: `A show at ${blockheight}`,
    local_date: 'July 12, 2026',
    venue: 'Roaring Brook Farm',
    locality: 'Groveton',
    region1: 'New Hampshire',
    blockheight,
    resource_url: `/shows/0-${blockheight}`,
    is_future: false,
    provenances: { original: 2, traditional: 3, cover: 1, video_game: 1, film: 0, 'one-off': 0 },
    songplay_count: 7,
    sets: { 0: { setstones: [{ tokenId: 4, owner: '0x1234' }] } },
    ...more,
});

const shows = {
    '0-30000000': show(30000000, { is_future: true, sets: {}, songplay_count: 0 }),
    '0-25519700': show(25519700, { has_set_stones_available: true }),
    '0-23955770': show(23955770, { local_date: 'December 6, 2025' }),
};

const picker = (more = {}) => ({
    resource_url: '/pickers/cory-walker', instruments_display: '5-string banjo', total_instance_count: 16,
    shows_as_array: [{}, {}], studio_versions: [{}], ...more,
});

const pickers_by_instance_count = [
    ['Justin Holmes', picker({ resource_url: '/pickers/justin-holmes' })],
    ['Cory Walker', picker({ pickipedia_url: 'https://pickipedia.xyz/wiki/Cory_Walker', bacon_url: 'https://pickipedia.xyz/bacon?p=Cory+Walker' })],
    ['Someone With No Page', picker({ resource_url: '/pickers/someone', total_instance_count: 1, shows_as_array: [{}], studio_versions: [] })],
];

const tape = { title: 'Drowsy Maggie w/ David Grier', url: 'https://www.youtube.com/embed/yTI1HoFYbE0', date: 'April 2, 2024', location: 'Nashville, TN' };
const media = { sessions: [tape], live: [tape], talks: [tape] };

const song = (title, more = {}) => ({ title, slug: title.toLowerCase(), resource_url: `/songs/${title.toLowerCase()}`, plays: [{}, {}], ...more });

const withAndWithout = (env, draw) => {
    env.addGlobal('eco', undefined);
    env.addGlobal('build', undefined);
    const bare = draw();
    env.addGlobal('eco', links);
    env.addGlobal('build', build);
    const quiet = draw();
    env.addGlobal('eco', everything);
    const full = draw();
    return { bare, quiet, full };
};

describe('cryptograss.live', () => {
    const env = site('cryptograss.live');

    test('the home page draws with nothing read, and with everything', () => {
        const { bare, quiet, full } = withAndWithout(env, () => env.render('pages/index.njk', { page_name: 'index', page_title: 'Future-proofing Bluegrass', shows, chainData: {}, basePath: '' }));
        for (const html of [bare, quiet, full]) {
            expect(html).toContain('cryptograss');
            expect(html).toContain('The Oracle of Bluegrass Bacon');
            expect(html).toContain('/assets/images/setstones/4.png');
        }
        expect(quiet).not.toContain('id="lately"');
        expect(quiet).toContain('href="https://pickipedia.xyz/rabbithole/"');
        expect(full).toContain('3,465 pages');
        expect(full).toContain('1,824 pickers');
        expect(full).toContain('Listen to &ldquo;Paint Exchange&rdquo;');
        expect(full).toContain('<b><a href="https://pickipedia.xyz/wiki/Rabbithole">Rabbithole</a> is in public beta.</b>');
    });

    test("what magenta's people typed reaches the page as text", () => {
        env.addGlobal('eco', everything);
        env.addGlobal('build', build);
        const html = env.render('pages/index.njk', { page_name: 'index', shows, chainData: {}, basePath: '' });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('A &lt;script&gt;alert(1)&lt;/script&gt; title');
        expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;2&quot;"');
    });

    test('the questions, the happenings and one happening draw', () => {
        const happening = { headline: 'A happening', local_datetime: 'Feb 18, 2025', body: '<p>Its words.</p>', resource_url: '/happenings/1-a', slug: '1-a' };
        const { bare, full } = withAndWithout(env, () => [
            env.render('pages/faq.njk', { page_name: 'faq', faq: '<h4>A question?</h4><p>An answer.</p>', basePath: '' }),
            env.render('pages/happenings.njk', { page_name: 'happenings', happenings: [happening], basePath: '' }),
            env.render('pages/happenings.njk', { page_name: 'happenings', happenings: [], basePath: '' }),
            env.render('pages/happening.njk', { page_name: 'happenings', happening, basePath: '' }),
        ].join('\n'));
        for (const html of [bare, full]) {
            expect(html).toContain('An answer.');
            expect(html).toContain('Its words.');
            expect(html).toContain('Nothing announced yet.');
        }
        expect(full).toContain('built at block 26,503,860');
    });

    test('every link in the menu goes somewhere', () => {
        env.addGlobal('eco', links);
        const html = env.render('partials/nav.njk', { page_name: 'faq', basePath: '' });
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
        expect(hrefs.length).toBeGreaterThan(4);
        for (const href of hrefs) {
            expect(href).not.toBe('#');
            expect(href).not.toBe('');
        }
    });
});

describe('justinholmes.com', () => {
    const env = site('justinholmes.com');

    test('the home page draws with nothing read, and with everything', () => {
        const { bare, quiet, full } = withAndWithout(env, () => env.render('pages/index.njk', { page_name: 'index', shows, pickers_by_instance_count, media, basePath: '' }));
        for (const html of [bare, quiet, full]) {
            expect(html).toContain('4masks');
            expect(html).toContain('A show at 25519700');
            expect(html).toContain('Next up');                      // the show at block 30,000,000
            expect(html).toContain('Cory Walker');
            expect(html).toContain('data-embed="https://www.youtube.com/embed/yTI1HoFYbE0"');
            expect(html).not.toContain('<iframe');                   // nothing asked of anyone until it is pressed
        }
        expect(quiet).not.toContain('play in Rabbithole');
        expect(full).toContain('href="https://pickipedia.xyz/rabbithole/?track=QmPaint"');
        expect(full).not.toContain('QmLive');                         // not on this record
    });

    test('a show ahead of us is listed apart; with none, there is no such list', () => {
        const past = { '0-25519700': shows['0-25519700'] };
        env.addGlobal('eco', links);
        env.addGlobal('build', build);
        expect(env.render('pages/shows.njk', { page_name: 'shows', shows, basePath: '' })).toContain('id="ahead"');
        const html = env.render('pages/shows.njk', { page_name: 'shows', shows: past, basePath: '' });
        expect(html).not.toContain('id="ahead"');
        expect(html).toContain('<h3 class="jh-year">2026</h3>');
        expect(html).toContain('set stones');
        expect((html.match(/<i class="traditional">/g) || []).length).toBe(3);
    });

    test('listen, the band, the songs, about and contact draw either way', () => {
        const ensemble = { 'Cory Walker': { Description: 'My banjo guy.', Photo: 'musicians/cory.jpg', Caption: 'Cory.' } };
        const songsByProvenance = { original: [song('August', { rabbithole_url: 'https://pickipedia.xyz/rabbithole/?track=QmAugust' })], traditional: [song('Salt Creek')], cover: [], video_game: [], film: [], 'one-off': [] };
        const { bare, full } = withAndWithout(env, () => [
            env.render('pages/listen.njk', { page_name: 'listen', ...media, basePath: '' }),
            env.render('pages/ensemble.njk', { page_name: 'ensemble', ensemble, pickers_by_instance_count, basePath: '' }),
            env.render('pages/songs/all-songs.njk', { page_name: 'all-songs', songs: {}, songsByProvenance, basePath: '' }),
            env.render('pages/about.njk', { page_name: 'about', about_text: '<p>About him.</p>', basePath: '' }),
            env.render('pages/contact.njk', { page_name: 'contact', basePath: '' }),
        ].join('\n'));
        for (const html of [bare, full]) {
            expect(html).toContain('Vowel Sounds');
            expect(html).toContain('/music/vowel-sounds/"');           // with its slash: without it, the server says 403
            expect(html).toContain('My banjo guy.');
            expect(html).toContain('5-string banjo');                  // the partials see the picker they are handed
            expect(html).toContain('Someone With No Page');
            expect(html).toContain('Salt Creek');
            expect(html).toContain('About him.');
            expect((html.match(/href="mailto:/g) || []).length).toBe(3);    // booking, production, Justin
            expect(html).not.toContain('0xwhatever');
        }
        expect(full).toContain('From the stage');
        expect(full).toContain('href="https://pickipedia.xyz/wiki/Cory_Walker"');
        expect(full).toContain('href="https://pickipedia.xyz/rabbithole/?track=QmAugust"');
    });
});
