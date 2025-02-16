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

To document:

* Nunjucks
* Cursor rules
* Blue Railroad Train Squats video fetch
* Dice-rolling wallet generation; cryptograss paper wallets

### Builds

The cryptograss build server, maybelle, builds the production branch every two minutes.  Chain data is fetched for this purpose on alternating minutes, so builds might be as much as 3 minutes out of date.

Pull Requests are built automatically only for members of the cryptograss organization on github.  If you have a Pull Request that you'd like built by maybelle, just ask on our discord and we'll review it for security issues first.

Pull Request which are built are also available as previews.
