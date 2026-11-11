import {glob} from 'glob';
import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import {fileURLToPath} from "url";

// TODO: these names can be dehydrated to at most once for all the runtimey stuff
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Base directory with index, etc.
const preBuildOutputDirectory = path.resolve(__dirname, '../../_prebuild_output');

// Pattern to match all HTML files recursively within the prebuilt directory
const templatesPattern = path.join(preBuildOutputDirectory, '**/*.html');

// Use glob to find matching files
const templateFiles = glob.sync(templatesPattern);

// Create HtmlWebpackPlugin instances
const htmlPluginInstances = templateFiles.map(templatePath => {
    // Compute the output filename by maintaining the relative directory structure
    const relativePath = path.relative(preBuildOutputDirectory, templatePath);

    if (relativePath.startsWith('music/vowel-sounds')) {
        var chunks = ['vowel_sounds'];
    } else if (relativePath.startsWith('sign')) {
        var chunks = ['main', 'signing'];
    } else {
        var chunks = ['main'];
    }

    return new HtmlWebpackPlugin({
        template: templatePath, // Path to the source template
        filename: relativePath, // Preserve the directory structure in the output
        inject: "body",
        chunks: chunks, // Only include the chunk for this template
    });
});


const common = {
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, '../../_prebuild_output/assets'),
                    to: path.resolve(__dirname, '../../dist/assets')
                },

                {
                    from: path.resolve(__dirname, '../../src/audio'),
                    to: path.resolve(__dirname, '../../dist/audio')
                },
            ]
        }),
        new MiniCssExtractPlugin({
            filename: '[name].[contenthash].css',
        }),
        ...htmlPluginInstances,
    ],
    entry: {
        main: './src/js/index.js',
        vowel_sounds: './src/js/vowel_sounds.js',
        help: './src/js/help.js',
        signing: './src/js/jhmusic_signing.js',
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

export default common;