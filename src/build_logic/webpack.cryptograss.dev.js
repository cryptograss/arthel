import common from './webpack.cryptograss.common.js';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import path from 'path';
import { getProjectDirs } from './locations.js';

import { runPrimaryBuild } from './primary_builder.js';

const { outputDistDir, outputPrimaryRootDir, srcDir } = getProjectDirs();

async function dev_config() {
    await runPrimaryBuild();

    return merge(common, {

        devServer: {
            devMiddleware: {
                writeToDisk: true,
            },
            port: 4050,
            historyApiFallback: {
                rewrites: [
                    { from: /\/$/, to: '/index.html' },
                    {
                        from: /\/(.+)$/, to: function (context) {
                            // Rewrite URLs like '/things' to '/things.html'
                            return '/' + context.match[1] + '.html';
                        }
                    },
                ],
            },
            // TODO: Enforce this matching the CopyPlugin
            // TODO: Handle assets per site #198
            static: [{
                directory: path.join(outputPrimaryRootDir, 'assets'),
                publicPath: '/assets',
            }],
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