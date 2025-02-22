import { initProjectDirs, getProjectDirs } from './locations.js';
const dirs = initProjectDirs("justinholmes.com");

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';



const { outputDistDir, outputPrimaryRootDir, outputPrimarySiteDir, siteDir, site, srcDir } = getProjectDirs();

// Make sure the output directory exists
fs.mkdirSync(outputDistDir, { recursive: true });

const templatesPattern = path.join(outputPrimarySiteDir, '**/*.html');
const templateFiles = glob.sync(templatesPattern);

const htmlPluginInstances = templateFiles.map(templatePath => {
    const relativePath = path.relative(outputPrimarySiteDir, templatePath);

    // Only JH.com specific routes
    if (relativePath.startsWith('music/vowel-sounds')) {
        var chunks = ['vowel_sounds'];
    } else if (relativePath.startsWith('sign')) {
        var chunks = ['main', 'signing'];
    } else if (relativePath.startsWith('shows/')) {
        var chunks = ['main', 'strike_set_stone'];
    } else if (relativePath.startsWith('magichat')) {
        var chunks = ['main', 'magic_hat'];
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

const frontendJSDir = path.resolve(siteDir, 'js');

export default {
    output: { path: outputDistDir },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(outputPrimaryRootDir, 'assets'),
                    to: path.resolve(outputDistDir, 'assets')
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
            ]
        }),
        new MiniCssExtractPlugin({
            filename: '[name].[contenthash].css',
        }),
        ...htmlPluginInstances,
    ],

    entry: {
        main: `${frontendJSDir}/index.js`,
        vowel_sounds: `${frontendJSDir}/vowel_sounds.js`,
        help: `${frontendJSDir}/help.js`,
        signing: `${frontendJSDir}/jhmusic_signing.js`,
        magic_hat: `${frontendJSDir}/magic_hat.js`,
        strike_set_stone: `${frontendJSDir}/strike_set_stones.js`,
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ]
    },
};