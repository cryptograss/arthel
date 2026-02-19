import { initProjectDirs, getProjectDirs } from './locations.js';
initProjectDirs("cryptograss.live");

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const { outputPrimarySiteDir, outputPrimaryRootDir, outputDistDir, siteDir, srcDir } = getProjectDirs();

// Make sure the output directory exists
fs.mkdirSync(outputDistDir, { recursive: true });

// Build HTML plugin instances dynamically (called after prebuild completes)
function buildHtmlPluginInstances() {
    const templatesPattern = path.join(outputPrimarySiteDir, '**/*.{html,xml}');
    const templateFiles = glob.sync(templatesPattern);

    return templateFiles.map(templatePath => {
        const relativePath = path.relative(outputPrimarySiteDir, templatePath);

        if (relativePath.startsWith('tools/oracle-of-bluegrass-bacon')) {
            var chunks = ['main', 'oracle_client'];
        } else if (relativePath.startsWith('blox-office/admin/mint/') || relativePath.startsWith('blox-office/admin/upgrade/')) {
            var chunks = ['main', 'mint_submission'];
        } else if (relativePath.startsWith('blox-office/admin/burn-token')) {
            var chunks = ['main', 'burn_token'];
        } else if (relativePath.startsWith('tools/upload-video')) {
            var chunks = ['main', 'upload_video'];
        } else if (relativePath.startsWith('tools/upload')) {
            var chunks = ['main', 'upload'];
        } else {
            var chunks = ['main'];
        }

        return new HtmlWebpackPlugin({
            template: templatePath,
            filename: relativePath,
            inject: "body",
            chunks: chunks,
        });
    });
}

const frontendJSDir = path.resolve(siteDir, 'js');

// Export a function that builds the config (to run glob after prebuild)
export function buildConfig() {
    const htmlPluginInstances = buildHtmlPluginInstances();
    return {
    output: { path: outputDistDir },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(outputPrimaryRootDir, 'assets'),
                    to: path.resolve(outputDistDir, 'assets')
                },
                {
                    from: path.resolve(outputPrimarySiteDir, 'assets'),
                    to: path.resolve(outputDistDir, 'assets')

                },
                {
                    from: path.resolve(outputPrimarySiteDir, 'setstones'),
                    to: path.resolve(outputDistDir, 'setstones'),
                    noErrorOnMissing: true
                },
                {
                    from: path.resolve(srcDir, 'fetched_assets'),
                    to: path.resolve(outputDistDir, 'assets/fetched'),
                    globOptions: {
                        dot: true,
                        gitignore: true,
                        ignore: ['**/.gitkeep', '**/.DS_Store'],
                    },
                    noErrorOnMissing: true
                },
                {
                    from: path.resolve(siteDir, 'api'),
                    to: path.resolve(outputDistDir, 'api'),
                    noErrorOnMissing: true
                },
                {
                    from: path.resolve(outputPrimarySiteDir, 'api'),
                    to: path.resolve(outputDistDir, 'api'),
                    noErrorOnMissing: true
                },
                {
                    from: path.resolve(srcDir, '../audio'),
                    to: path.resolve(outputDistDir, 'audio'),
                    noErrorOnMissing: true
                },
            ]
        }),
        new MiniCssExtractPlugin({
            filename: '[name].[contenthash].css',
        }),
        ...htmlPluginInstances,
    ],
    entry: {
        main: `${frontendJSDir}/index.js`,
        strike_set_stone: `${frontendJSDir}/bazaar/strike_set_stones.js`,
        add_live_set: `${frontendJSDir}/tools/add_live_set.js`,
        add_show_for_stone_minting: `${frontendJSDir}/tools/add_show_for_stone_minting.js`,
        shapes: `${frontendJSDir}/shapes.js`,
        blue_railroad: `${frontendJSDir}/bazaar/blue_railroad.js`,
        oracle_client: `${frontendJSDir}/oracle_client.js`,
        mint_submission: `${frontendJSDir}/mint-submission.js`,
        burn_token: `${frontendJSDir}/burn-token.js`,
        upload: `${frontendJSDir}/upload.js`,
        upload_video: `${frontendJSDir}/upload-video.js`,
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ]
    },
    resolve: {
        fallback: {
            // Optional wagmi connector dependencies - not needed for basic wallet connection
            '@base-org/account': false,
            '@gemini-wallet/core': false,
            'porto': false,
            'porto/internal': false,
        }
    },
    };
}

// Keep default export for backwards compatibility with prod build
export default buildConfig();