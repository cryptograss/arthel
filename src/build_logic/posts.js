import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import nunjucks from 'nunjucks';
import { DateTime } from 'luxon';

import { getProjectDirs } from './locations.js';
import { renderPage } from './utils/rendering_utils.js';

/**
 * A posts collection: a directory of `<epoch>-<slug>.yaml` files, each
 * optionally paired with a `<epoch>-<slug>.md` holding the body.
 *
 * The epoch is a unix timestamp, which is what orders the collection and what
 * gives each post its date. The markdown is rendered through nunjucks first,
 * so a post can use the same template helpers the rest of the site has, and
 * then through marked.
 *
 * This started life as cryptograss.live's hardcoded "happenings" feature. The
 * shape is unchanged; it just takes its paths from config now, so any site
 * arthel builds can have one.
 */

/**
 * cryptograss.live had this wired in directly, with its post index doubling as
 * the site's front page. Sites built from arthel's own tree still get exactly
 * that; anything else declares `posts` in arthel.config.json.
 */
const IN_TREE_DEFAULTS = {
    'cryptograss.live': {
        dirName: 'happenings',
        indexTemplate: 'pages/happenings.njk',
        itemTemplate: 'reuse/single-happening.njk',
        indexOutput: 'index.html',
        itemOutputPattern: 'happenings/{slug}.html',
        contextKey: 'happenings',
    },
};

/**
 * Work out which posts collection, if any, applies to the current build.
 * Returns null when the site has no posts.
 */
export function resolvePostsConfig() {
    const { postsConfig, site, dataDir } = getProjectDirs();
    if (postsConfig) return postsConfig;

    const legacy = IN_TREE_DEFAULTS[site];
    if (!legacy) return null;
    const { dirName, ...rest } = legacy;
    return { dir: path.resolve(dataDir, dirName), ...rest };
}

/**
 * Read every post in the collection, newest first.
 * Keys are the full `<epoch>-<slug>` stem, which is what the item output path
 * is built from.
 */
export function loadPosts(postsConfig) {
    if (!fs.existsSync(postsConfig.dir)) return {};

    const posts = {};
    for (const file of fs.readdirSync(postsConfig.dir)) {
        if (!file.endsWith('.yaml')) continue;
        const stem = file.replace(/\.yaml$/, '');
        const raw = fs.readFileSync(path.join(postsConfig.dir, file), 'utf8');
        posts[stem] = yaml.load(raw) || {};
    }

    for (const [stem, post] of Object.entries(posts)) {
        const epoch = stem.split('-')[0];
        const parsedEpoch = parseInt(epoch, 10);
        if (Number.isNaN(parsedEpoch)) {
            throw new Error(
                `Post "${stem}" in ${postsConfig.dir} does not start with a unix epoch. ` +
                `Posts are named <epoch>-<slug>.yaml so that they sort by date.`
            );
        }

        const localDateTime = DateTime.fromSeconds(parsedEpoch);
        post.epoch = parsedEpoch;
        post.slug = stem.split('-').slice(1).join('-');
        post.local_datetime = localDateTime.toLocaleString(DateTime.DATE_MED);
        post.iso_date = localDateTime.toISODate();

        const mdPath = path.resolve(postsConfig.dir, `${stem}.md`);
        if (fs.existsSync(mdPath)) {
            const rawBody = fs.readFileSync(mdPath, 'utf8');
            post.body = marked(nunjucks.renderString(rawBody, {}));
        }
    }

    // Newest first. Object key order is insertion order for string keys that
    // are not integer-like, and `<epoch>-<slug>` never is.
    return Object.fromEntries(
        Object.entries(posts).sort(([, a], [, b]) => b.epoch - a.epoch)
    );
}

/**
 * Render the collection: one index page, plus a page per post.
 * Returns the loaded posts so callers can put them in other contexts too.
 */
export function renderPostsCollection({ site, extraIndexContext = {} } = {}) {
    const postsConfig = resolvePostsConfig();
    if (!postsConfig) return {};

    const posts = loadPosts(postsConfig);

    renderPage({
        template_path: postsConfig.indexTemplate,
        output_path: postsConfig.indexOutput,
        site,
        context: {
            [postsConfig.contextKey]: posts,
            site,
            ...extraIndexContext,
        },
    });

    for (const [stem, post] of Object.entries(posts)) {
        renderPage({
            template_path: postsConfig.itemTemplate,
            output_path: postsConfig.itemOutputPattern.replace('{slug}', stem),
            context: post,
            site,
        });
    }

    return posts;
}
