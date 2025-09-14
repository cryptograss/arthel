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

const templatesPattern = path.join(outputPrimarySiteDir, '**/*.{html,xml}');
const templateFiles = glob.sync(templatesPattern);

const htmlPluginInstances = templateFiles.map(templatePath => {
    const relativePath = path.relative(outputPrimarySiteDir, templatePath);

    if (relativePath.startsWith('tools/oracle-of-bluegrass-bacon')) {
        var chunks = ['main', 'oracle_client'];
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
        chartifact_player: `${frontendJSDir}/chartifact_player.js`,
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