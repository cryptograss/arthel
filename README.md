## Crypograss builder

This is a tool to build cryptograss web projects, including the cryptograss.live website, and justinholmes.com, the website of Justin Holmes and the Immutable String Band.

On ubuntu 24+, it requires node 23.x to build.

OS-level dependencies:
`sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`

# To run locally:

```
nvm use 23
npm update
npm install
npm run test
npm run fetch-chain-data
npm run dev:cg (or dev:jh)
npm run build (set the site domain as SITE in environment variables)
```

To document:

* Nunjucks
* Cursor rules
* Blue Railroad Train Squats video fetch
* Dice-rolling wallet generation; cryptograss paper wallets

### Install submodules for happenings


`git submodule add git@github.com:cryptograss/happenings.git src/data/happenings`

### Builds

Build and deployment automation logic is included in the `deployment` directory.

The cryptograss build server, maybelle (https://maybelle.cryptograss.live), builds the production branch every two minutes.  Chain data is fetched for this purpose on alternating minutes, so builds might be as much as 3 minutes out of date.


Pull Requests are built automatically only for members of the cryptograss organization on github.  If you have a Pull Request that you'd like built by maybelle, just ask on our discord and we'll review it for security issues first.


Pull Request which are built are also available as previews.
