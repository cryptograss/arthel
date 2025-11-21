import common from './webpack.justinholmes.common.js';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import { getProjectDirs } from './locations.js';
import path from 'path';

import { runPrimaryBuild } from './primary_builder.js';

const { outputDistDir, outputPrimaryRootDir, outputPrimarySiteDir, srcDir } = getProjectDirs();

async function dev_config() {
    await runPrimaryBuild();

    return merge(common, {

        devServer: {
            devMiddleware: {
                writeToDisk: true,
            },
            port: 4000,
            allowedHosts: 'all',
            historyApiFallback: {
                rewrites: [
                    { from: /\/$/, to: '/index.html' },
                    {
                        from: /^\/([^.]+)$/, to: function (context) {
                            // Only rewrite URLs that don't contain a dot (no file extension)
                            // This will match '/things' but not '/things.css' or '/things.js'
                            return '/' + context.match[1] + '.html';
                        }
                    },
                ],
            },
            // TODO: Enforce this matching the CopyPlugin
            static: [{
                directory: path.join(outputPrimaryRootDir, 'assets'),
                publicPath: '/assets',
            },
            {
                directory: path.join(outputPrimarySiteDir, 'api'),
                publicPath: '/api',
            },]
        },
        watchOptions: {
            ignored: ['**/.restart-server'],
        },
        mode: 'development',
        devtool: 'eval-source-map',
        plugins: [
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify('development'),
            }),
        ]
    });
}

export default dev_config;