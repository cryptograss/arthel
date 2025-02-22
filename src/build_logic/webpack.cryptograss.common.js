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

const templatesPattern = path.join(outputPrimarySiteDir, '**/*.html');
const templateFiles = glob.sync(templatesPattern);

const htmlPluginInstances = templateFiles.map(templatePath => {
    const relativePath = path.relative(outputPrimarySiteDir, templatePath);

    // if (relativePath.startsWith('cryptograss/tools/add-live-set')) {
    //     var chunks = ['main', 'add_live_set'];
    // } else if (relativePath.startsWith('cryptograss/bazaar/setstones')) {
    //     var chunks = ['main', 'strike_set_stone'];
    // } else if (relativePath.startsWith('cryptograss/shows/')) {
    //     var chunks = ['main', 'strike_set_stone'];
    // } else if (relativePath.startsWith('cryptograss/tools/generate_art')) {
    //     var chunks = ['main', 'shapes'];
    // } else if (relativePath.startsWith('cryptograss/tools/add-show-for-stone-minting')) {
    //     var chunks = ['main', 'add_show_for_stone_minting'];
    // } else if (relativePath.startsWith('cryptograss/tools/setstone-color-palette')) {
    //     var chunks = ['main', 'setstone_color_palette'];
    // } else if (relativePath.startsWith('cryptograss/tools/sign-things')) {
    //     var chunks = ['main', 'signing'];
    // } else if (relativePath.startsWith('cryptograss/blue-railroad-test')) {
    //     var chunks = ['main', 'blue_railroad'];
    // } else {

    // }

    var chunks = ['main'];

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