import { merge } from 'webpack-merge';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import { getProjectDirs, initProjectDirs } from './locations.js'
import fs from "fs";
import path from "path";
import { runPrimaryBuild } from './primary_builder.js';

// Dynamically import the common webpack config for the project, depending on the site argument
const site = process.env.SITE;

const commonConfigs = {
    'justinholmes.com': './webpack.justinholmes.common.js',
    'cryptograss.live': './webpack.cryptograss.common.js',
};

export async function generateProductionConfig() {

    if (!commonConfigs[site]) {
        throw new Error('Invalid site argument');
    }

    // The pages are written first, and the common config is loaded after: it lists the pages to
    // emit as it loads, from what is on disk. Loaded first, it listed the build before's pages,
    // so a new page was missing from the first build that had it, and a removed one was asked for
    // once more. (The common config does this init too; a second one for the same site is a no-op.)
    initProjectDirs(site);
    await runPrimaryBuild();
    const common = await import(commonConfigs[site]);


    const { templateDir, outputDistDir, siteDir } = getProjectDirs();
    const frontendJSDir = path.resolve(siteDir, 'js');

    return merge(common['default'], {
        mode: 'production',
        devtool: false,
        optimization: {
            minimize: true,
            minimizer: [new TerserPlugin({
                parallel: true,
                terserOptions: {
                    // Reduce memory usage
                    compress: {
                        passes: 1
                    },
                    mangle: true
                }
            })],
            splitChunks: {
                chunks: 'all',
                maxInitialRequests: 30,
                minSize: 20000,
                maxSize: 244000,
                cacheGroups: {
                    defaultVendors: {
                        test: /[\\/]node_modules[\\/]/,
                        priority: -10,
                        reuseExistingChunk: true,
                    },
                    default: {
                        minChunks: 2,
                        priority: -20,
                        reuseExistingChunk: true,
                    }
                }
            }
        },
        // Increase memory limit for Node
        performance: {
            hints: false
        },
        plugins: [
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify('production'),
            }),
            {
                apply: (compiler) => {
                    compiler.hooks.done.tap('CopyHtaccessPlugin', () => {
                        // Debug logging
                        console.log('Attempting to copy .htaccess');
                        const sourcePath = path.resolve(templateDir, 'shared/.htaccess');
                        const destPath = path.resolve(outputDistDir, '.htaccess');

                        console.log('Frontend JS dir:', frontendJSDir);
                        console.log('Frontend JS dir contents:', fs.readdirSync(frontendJSDir));
                        fs.copyFileSync(sourcePath, destPath);
                    });
                },
            },
        ]
    });
}

export default generateProductionConfig;