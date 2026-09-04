import fs from 'fs';
import os from 'os';
import path from 'path';

import { initProjectDirs, resetProjectDirs } from '../src/build_logic/locations.js';
import { loadPosts, resolvePostsConfig } from '../src/build_logic/posts.js';

/**
 * Posts are the generic form of what cryptograss.live called "happenings":
 * a directory of <epoch>-<slug>.yaml files, each optionally paired with a
 * matching .md holding the body.
 */

const EPOCH_OLDER = 1735689600;   // 2025-01-01
const EPOCH_NEWER = 1767225600;   // 2026-01-01

let fixtureRoot;
let originalCwd;

function writePost(stem, frontmatter, body) {
    const postsDir = path.join(fixtureRoot, 'posts');
    fs.writeFileSync(path.join(postsDir, `${stem}.yaml`), frontmatter);
    if (body !== undefined) {
        fs.writeFileSync(path.join(postsDir, `${stem}.md`), body);
    }
}

beforeAll(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arthel-posts-'));
    fs.mkdirSync(path.join(fixtureRoot, 'posts'), { recursive: true });

    fs.writeFileSync(path.join(fixtureRoot, 'arthel.config.json'), JSON.stringify({
        site: 'justinholmes.com',
        posts: {
            dir: 'posts',
            indexTemplate: 'pages/blog.njk',
            itemTemplate: 'reuse/single-post.njk',
            indexOutput: 'blog/index.html',
            itemOutputPattern: 'blog/{slug}.html',
        },
    }));

    writePost(`${EPOCH_OLDER}-first-post`, 'title: The First One\n', '# Hello\n\nSome *words*.\n');
    writePost(`${EPOCH_NEWER}-a-later-post-with-dashes`, 'title: A Later One\n');

    // Discover arthel.config.json the way a consumer repo does: by cwd.
    originalCwd = process.cwd();
    process.chdir(fixtureRoot);
    resetProjectDirs();
    initProjectDirs('justinholmes.com');
});

afterAll(() => {
    process.chdir(originalCwd);
    resetProjectDirs();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('posts collection', () => {
    test('config comes from arthel.config.json and resolves against the repo root', () => {
        const config = resolvePostsConfig();
        expect(config.dir).toBe(path.join(fixtureRoot, 'posts'));
        expect(config.indexOutput).toBe('blog/index.html');
        expect(config.itemOutputPattern).toBe('blog/{slug}.html');
    });

    test('posts are returned newest first', () => {
        const posts = loadPosts(resolvePostsConfig());
        const stems = Object.keys(posts);
        expect(stems).toEqual([
            `${EPOCH_NEWER}-a-later-post-with-dashes`,
            `${EPOCH_OLDER}-first-post`,
        ]);
    });

    test('the epoch in the filename becomes the post date', () => {
        const posts = loadPosts(resolvePostsConfig());
        const post = posts[`${EPOCH_OLDER}-first-post`];
        expect(post.epoch).toBe(EPOCH_OLDER);
        expect(post.iso_date).toBe('2025-01-01');
        expect(post.local_datetime).toEqual(expect.stringContaining('2025'));
    });

    test('a slug may itself contain dashes', () => {
        const posts = loadPosts(resolvePostsConfig());
        expect(posts[`${EPOCH_NEWER}-a-later-post-with-dashes`].slug)
            .toBe('a-later-post-with-dashes');
    });

    test('the markdown body is rendered, and is optional', () => {
        const posts = loadPosts(resolvePostsConfig());
        expect(posts[`${EPOCH_OLDER}-first-post`].body).toContain('<h1');
        expect(posts[`${EPOCH_OLDER}-first-post`].body).toContain('<em>words</em>');
        expect(posts[`${EPOCH_NEWER}-a-later-post-with-dashes`].body).toBeUndefined();
    });

    test('yaml frontmatter is carried through', () => {
        const posts = loadPosts(resolvePostsConfig());
        expect(posts[`${EPOCH_OLDER}-first-post`].title).toBe('The First One');
    });

    test('a missing posts directory is not an error', () => {
        const posts = loadPosts({ ...resolvePostsConfig(), dir: path.join(fixtureRoot, 'nope') });
        expect(posts).toEqual({});
    });

    test('a post not named <epoch>-<slug> fails loudly', () => {
        writePost('not-an-epoch', 'title: Bad\n');
        expect(() => loadPosts(resolvePostsConfig()))
            .toThrow(/does not start with a unix epoch/);
        fs.rmSync(path.join(fixtureRoot, 'posts', 'not-an-epoch.yaml'));
    });
});
