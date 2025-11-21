import { merge } from 'webpack-merge';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import { getProjectDirs } from './locations.js'
import fs from "fs";
import path from "path";
import { runPrimaryBuild } from './primary_builder.js';

// Dynamically import the common webpack config for the project, depending on the site argument
const site = process.env.SITE;

export async function generateProductionConfig() {

    let common;
    if (site === 'justinholmes.com') {
        common = await import('./webpack.justinholmes.common.js');
    } else if (site === 'cryptograss.live') {
        common = await import('./webpack.cryptograss.common.js');
    } else {
        throw new Error('Invalid site argument');
    }

    await runPrimaryBuild();


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
        ], output: {
            filename: '[name].js',
            path: outputDistDir,
        }
    });
}

export default generateProductionConfig;