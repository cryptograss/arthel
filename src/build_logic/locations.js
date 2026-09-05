import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

/**
 * Arthel resolves every path it touches through this module.
 *
 * There are two layouts:
 *
 *   in-tree (legacy)  - the site lives inside arthel at src/sites/<site>, and
 *                       content lives at src/data, src/images, audio/, epk/.
 *                       This is what arthel did before it became consumable.
 *
 *   consumer          - arthel is a dependency of a separate site repo, which
 *                       owns its own templates and content and describes them
 *                       in an arthel.config.json at its root.
 *
 * A consumer is detected by finding arthel.config.json (walking up from cwd,
 * or pointed at by $ARTHEL_CONFIG), or by passing a config object directly to
 * initProjectDirs - which is what a consumer's webpack config does, since that
 * runs before any npm script has set cwd for us.
 *
 * Every key this module exported before still exists and still means the same
 * thing, so callers do not care which layout they are running under.
 */

const CONFIG_FILENAME = 'arthel.config.json';

const projectDirs = new Proxy({}, {
    get: function (target, prop) {
        if (!(prop in target)) {
            throw new Error(`KeyError: '${prop}' is not defined`);
        }
        return target[prop];
    }
});

projectDirs.initialized = false;
projectDirs.site = null;

function findConfigFile(startDir) {
    let dir = path.resolve(startDir);
    for (;;) {
        const candidate = path.join(dir, CONFIG_FILENAME);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function loadConfigFromDisk() {
    if (process.env.ARTHEL_CONFIG) {
        const explicitPath = path.resolve(process.env.ARTHEL_CONFIG);
        if (!fs.existsSync(explicitPath)) {
            throw new Error(`ARTHEL_CONFIG points at a file that does not exist: ${explicitPath}`);
        }
        return { file: explicitPath, data: JSON.parse(fs.readFileSync(explicitPath, 'utf8')) };
    }
    const found = findConfigFile(process.cwd());
    if (!found) return null;
    return { file: found, data: JSON.parse(fs.readFileSync(found, 'utf8')) };
}

/**
 * @param {string|object} siteOrConfig - a site name (in-tree or config-driven),
 *   or a full config object with at least { site }.
 */
export function initProjectDirs(siteOrConfig) {
    const explicitConfig = (siteOrConfig && typeof siteOrConfig === 'object') ? siteOrConfig : null;
    const site_name = explicitConfig ? explicitConfig.site : siteOrConfig;

    if (!site_name) {
        throw new Error("initProjectDirs needs a site name, either directly or as config.site");
    }

    // Prevent multiple initializations
    if (projectDirs.initialized) {
        if (projectDirs.site !== site_name) {
            throw new Error(`Project directories already initialized for ${projectDirs.site}, cannot reinitialize for ${site_name}`);
        }
        return projectDirs; // Return existing if already initialized for same site
    }

    const arthelSrcDir = path.resolve(fileURLToPath(import.meta.url), '../..');

    let config = explicitConfig;
    let configDir;
    if (config) {
        configDir = path.resolve(config.rootDir || process.cwd());
    } else {
        const loaded = loadConfigFromDisk();
        if (loaded) {
            config = loaded.data;
            configDir = path.dirname(loaded.file);
        }
    }

    if (config) {
        applyConsumerLayout(config, configDir, site_name, arthelSrcDir);
    } else {
        applyInTreeLayout(site_name, arthelSrcDir);
    }

    projectDirs.showsDir = path.resolve(projectDirs.dataDir, 'shows');
    projectDirs.templateDir = path.resolve(projectDirs.siteDir, 'templates');

    projectDirs.outputDistDir = path.resolve(projectDirs.outputBaseDir, 'dist', site_name);
    projectDirs.outputPrimaryRootDir = path.resolve(projectDirs.outputBaseDir, '_prebuild_output');
    projectDirs.outputPrimarySiteDir = path.resolve(projectDirs.outputPrimaryRootDir, site_name);
    projectDirs.chainDataDir = path.resolve(projectDirs.outputBaseDir, '_prebuild_chain_data');

    projectDirs.initialized = true;
    projectDirs.site = site_name;

    projectDirs.cryptograssUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:4050'
        : 'https://cryptograss.live';

    projectDirs.basePath = getBasePath(site_name);

    return projectDirs;
}

function applyInTreeLayout(site_name, arthelSrcDir) {
    projectDirs.arthelSrcDir = arthelSrcDir;
    projectDirs.srcDir = arthelSrcDir;
    projectDirs.projectRootDir = path.resolve(arthelSrcDir, '..');
    projectDirs.siteDir = path.resolve(arthelSrcDir, 'sites', site_name);
    projectDirs.dataDir = path.resolve(arthelSrcDir, 'data');
    projectDirs.imagesSourceDir = path.join(arthelSrcDir, 'images');
    projectDirs.fetchedAssetsDir = path.join(arthelSrcDir, 'fetched_assets');
    projectDirs.audioDir = path.resolve(arthelSrcDir, '..', 'audio');
    projectDirs.epkDir = path.resolve(arthelSrcDir, '..', 'epk');
    projectDirs.outputBaseDir = path.resolve(projectDirs.projectRootDir, 'output');
    projectDirs.postsConfig = null;
    projectDirs.isConsumerLayout = false;
}

function applyConsumerLayout(config, root, site_name, arthelSrcDir) {
    const at = (configured, fallback) => path.resolve(root, configured ?? fallback);

    projectDirs.arthelSrcDir = arthelSrcDir;
    projectDirs.projectRootDir = root;
    // srcDir is kept for callers that predate the explicit audio/epk/fetched keys.
    projectDirs.srcDir = root;
    projectDirs.siteDir = at(config.siteDir, 'site');
    projectDirs.dataDir = at(config.dataDir, 'data');
    projectDirs.imagesSourceDir = at(config.imagesDir, 'images');
    projectDirs.fetchedAssetsDir = at(config.fetchedAssetsDir, 'fetched_assets');
    projectDirs.audioDir = at(config.audioDir, 'audio');
    projectDirs.epkDir = at(config.epkDir, 'epk');
    projectDirs.outputBaseDir = at(config.outputDir, 'output');
    projectDirs.postsConfig = normalisePostsConfig(config.posts, root);
    projectDirs.isConsumerLayout = true;
}

/**
 * A posts collection is a directory of `<epoch>-<slug>.yaml` files, each
 * optionally accompanied by a `<epoch>-<slug>.md` body. Absent config means
 * the site has no posts and none are rendered.
 */
function normalisePostsConfig(posts, root) {
    if (!posts) return null;
    return {
        dir: path.resolve(root, posts.dir ?? 'posts'),
        indexTemplate: posts.indexTemplate ?? 'pages/posts.njk',
        itemTemplate: posts.itemTemplate ?? 'reuse/single-post.njk',
        indexOutput: posts.indexOutput ?? 'posts/index.html',
        itemOutputPattern: posts.itemOutputPattern ?? 'posts/{slug}.html',
        contextKey: posts.contextKey ?? 'posts',
    };
}

const getBasePath = (site_name) => {
    // For preview builds, use the commit SHA as the base path
    if (process.env.PREVIEW_BUILD === 'true' && process.env.COMMIT_SHA) {
        console.log(`Base path (preview for ${site_name}): `, `/build-previews/${process.env.COMMIT_SHA}/${site_name}`);
        return `/build-previews/${process.env.COMMIT_SHA}/${site_name}`;
    }
    // For production builds, use root
    console.log("Base path (non-preview): ", `/`);
    return '';
};

export function getProjectDirs() {
    if (!projectDirs.initialized) {
        throw new Error("Project directories not initialized. Call initProjectDirs first.");
    }
    return projectDirs;
}

/** Test seam: drop initialization so a different site can be set up. */
export function resetProjectDirs() {
    projectDirs.initialized = false;
    projectDirs.site = null;
}
