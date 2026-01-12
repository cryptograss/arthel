import { fileURLToPath } from "url";
import path from "path";

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

// Reset function for testing - allows reinitialization with different settings
export function resetProjectDirs() {
    projectDirs.initialized = false;
    projectDirs.site = null;
    // Clear all properties except initialized and site
    for (const key of Object.keys(projectDirs)) {
        if (key !== 'initialized' && key !== 'site') {
            delete projectDirs[key];
        }
    }
}

export function initProjectDirs(site_name) {
    // Prevent multiple initializations
    if (projectDirs.initialized) {
        if (projectDirs.site !== site_name) {
            throw new Error(`Project directories already initialized for ${projectDirs.site}, cannot reinitialize for ${site_name}`);
        }
        return projectDirs; // Return existing if already initialized for same site
    }

    const __filename = fileURLToPath(import.meta.url);
    projectDirs.srcDir = path.resolve(__filename, '../..');
    projectDirs.projectRootDir = path.resolve(projectDirs.srcDir, '..');
    projectDirs.siteDir = path.resolve(projectDirs.srcDir, 'sites', site_name);

    // Templates directories 
    projectDirs.templateDir = path.resolve(projectDirs.siteDir, 'templates');

    // Data directories
    projectDirs.dataDir = path.resolve(projectDirs.srcDir, 'data');
    projectDirs.showsDir = path.resolve(projectDirs.dataDir, 'shows');
    projectDirs.imagesSourceDir = path.join(projectDirs.srcDir, 'images');
    projectDirs.fetchedAssetsDir = path.join(projectDirs.srcDir, 'fetched_assets');

    // Output directories
    projectDirs.outputBaseDir = path.resolve(projectDirs.projectRootDir, 'output');

    projectDirs.outputDistDir = path.resolve(projectDirs.outputBaseDir,
        'dist', site_name);

    // Allow override for testing via environment variable
    projectDirs.outputPrimaryRootDir = process.env.OUTPUT_PRIMARY_ROOT_DIR
        ? path.resolve(process.env.OUTPUT_PRIMARY_ROOT_DIR)
        : path.resolve(projectDirs.outputBaseDir, '_prebuild_output');

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
