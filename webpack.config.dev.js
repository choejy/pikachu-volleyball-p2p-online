const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  devServer: {
    contentBase: './dist'
  },
  entry: { main: './src/main_online.js' },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  plugins: [
    new CopyPlugin([
      { from: 'src/assets', to: 'dist/assets' },
      { from: 'src/style.css' }
    ]),
    new HtmlWebpackPlugin({
      template: './src/index_online.html',
      hash: true
    })
  ]
};
