'use strict';
const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const config = require('./scripts/build/plugins');
module.exports = (_, argv = {}) => {
  const production = argv.mode === 'production';
  return {
    mode: production ? 'production' : 'development',
    entry: { app: './client/index.js' },
    output: { path: path.resolve(__dirname, 'static/prd'), publicPath: '/prd/', filename: '[name].[contenthash:12].js', clean: true },
    devtool: production ? 'source-map' : 'eval-cheap-module-source-map',
    resolve: {
      alias: {
        client: path.resolve(__dirname, 'client'), common: path.resolve(__dirname, 'common'), exts: path.resolve(__dirname, 'exts'),
        '../server/yapi$': false, '../server/utils/sandbox$': false,
        'antd$': path.resolve(__dirname, 'client/compat/antd.js'),
        'antd-modern': path.dirname(require.resolve('antd/package.json')),
        'react-router$': path.resolve(__dirname, 'client/compat/router.js'),
        'react-router-dom$': path.resolve(__dirname, 'client/compat/router.js'),
        'router-modern$': require.resolve('react-router')
      },
      fallback: { fs: false, net: false, tls: false, dns: false, child_process: false, module: false, os: false, crypto: false, https: false, http: false, zlib: false, vm: false, constants: false,
        buffer: require.resolve('buffer/'), stream: require.resolve('stream-browserify'), util: require.resolve('util/'),
        assert: require.resolve('assert/'), path: require.resolve('path-browserify'), url: require.resolve('url/') }
    },
    module: { rules: [
      { test: /\.[cm]?jsx?$/, exclude: /node_modules|common[\\/]tui-editor/, use: { loader: 'babel-loader', options: {
        babelrc: false, configFile: false, presets: [['@babel/preset-env', { targets: '> 0.5%, not dead', modules: 'commonjs' }], ['@babel/preset-react', { runtime: 'automatic' }]],
        plugins: [['@babel/plugin-proposal-decorators', { legacy: true }], ['@babel/plugin-transform-class-properties', { loose: true }]]
      }} },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
      { test: /\.s[ac]ss$/, use: [MiniCssExtractPlugin.loader, 'css-loader', { loader: 'sass-loader', options: { sassOptions: { silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions'] } } }] },
      { test: /\.less$/, use: [MiniCssExtractPlugin.loader, 'css-loader', 'less-loader'] },
      { test: /\.(gif|jpe?g|png|woff2?|eot|ttf|svg)$/, type: 'asset', parser: { dataUrlCondition: { maxSize: 8192 } } }
    ] },
    plugins: [new MiniCssExtractPlugin({ filename: '[name].[contenthash:12].css' }),
      new HtmlWebpackPlugin({ template: 'static/index.template.html', filename: 'index.html', inject: 'body' }),
      new webpack.DefinePlugin({ 'process.env.version': JSON.stringify(require('./package.json').version), 'process.env.versionNotify': JSON.stringify(config.versionNotify) }),
      new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'], process: require.resolve('process/browser.js') }),
      new webpack.ContextReplacementPlugin(/moment[\\/]locale$/, /zh-cn|en-gb/)
    ],
    optimization: { splitChunks: { chunks: 'all' }, runtimeChunk: 'single' },
    performance: { hints: false },
    devServer: { host: '127.0.0.1', port: 4000, static: { directory: path.resolve(__dirname, 'static') },
      devMiddleware: { publicPath: '/prd/' }, historyApiFallback: { index: '/prd/index.html' },
      proxy: [{ context: ['/api', '/mock', '/ws'], target: 'http://127.0.0.1:3000', ws: true }] }
  };
};
