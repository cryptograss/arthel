## Justin Holmes website, cryptograss tools

This is a self-building static site, built with node.js and designed to be hosted on a static site host (currently, nearlyfreespeech.net).

On ubuntu 24+, it requires node 22.X or 23.x to build.

OS-level dependencies:
`sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`

# To run locally:

```
nvm use 23 
npm update
npm install
npm run test
npm run devserver
npm run build
```

### Adding a new page
To add a new page, include it in the `src/data/pages.yaml`

If the page has a custom javascript, create a new file in `src/js/`, include it in the `webpack.common.js` file in the `entry` section and adjust the `chunks` array to inject the correct js chunk into the page template.

To document:

* Nunjucks
* Cursor rules
* Blue Railroad Train Squats video fetch
* Dice-rolling wallet generation; cryptograss paper wallets

### Builds

The cryptograss build server, maybelle, builds the production branch every two minutes.

Pull Requests are built automatically only for members of the cryptograss organization on github.  If you have a Pull Request that you'd like built by maybelle, just ask on our discord and we'll review it for security issues first.
