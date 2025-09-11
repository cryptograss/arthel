## Arthel, the cryptograss domain builder

Named for Arthel Lane "Doc" Watson, arthel is a toolchain to release and monetize IP-unencumbered, DRM-free music and show- and record-related merch on the ethereum blockchain.  It is chiefly built for musicians making bluegrass, old-time, and traditional music, but may be useful to others as well.

It also includes the tools to build web frontends integrating the above, and is used to build the cryptograss.live website, and justinholmes.com, the website of Justin Holmes and the Immutable String Band.

## Main features

* Setlist parser
* Blockchain data fetcher and parser
* Show, set, ensemble, and song metadata formats and serialization tooling
* Set stone generation and display
* Revealer frontend, and revealer artifact display
* Blue Railroad Train Squats video and metadata fetch
* Dice-rolling wallet generation; cryptograss paper wallets

The templates, which are written in Nunjucks, are in the `templates` folder for each site.


## Running it

On ubuntu 24+, it requires node 22.X or 23.x to build.

OS-level dependencies:
`sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`

### To run locally:

```
nvm use 23
npm update
npm install
npm run test
npm run fetch-chain-data
npm run dev:cg (or dev:jh)
```



### Builds

The cryptograss build server, maybelle, builds the production branch every two minutes.  Chain data is fetched for this purpose on alternating minutes, so builds might be as much as 3 minutes out of date.

Other branches are built automatically when pushed.  If you have a branch that you'd like built by maybelle, just ask on our discord and we'll review it for security issues first.

Branches which are built are also available as previews.

#### Build Security

The build server needs access to providers for each of the chains for which data is being read, as well as API access to discord, github, and other places where merch-related metadata and multimedia are held.  Thus, a malicicious actor can submit a pull request which either emits those secrets in logs, or passes those secrets as context to the preview build. For this reason, we only allow    branches to be built, not pull requests.

The jenkins instance on the builder server does not have direct access to the web server; production builds are rsynced by a separate job, by a separate user.


### Submodules

Currently, the only submodule is the happenings data, which is used to announce news and events.

It is a private repo, so you'll need to be added to the cryptograss org to clone it.

`git submodule add git@github.com:cryptograss/happenings.git src/data/happenings`

