## Crypograss builder

This is a tool to build cryptograss web projects, including the cryptograss.live website, and justinholmes.com, the website of Justin Holmes and the Immutable String Band.
## Crypograss builder

This is a tool to build cryptograss web projects, including the cryptograss.live website, and justinholmes.com, the website of Justin Holmes and the Immutable String Band.

The templates, which are written in Nunjucks, are in the `templates` folder for each site.
The templates, which are written in Nunjucks, are in the `templates` folder for each site.

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

Other branches are built automatically when pushed.  If you have a branch that you'd like built by maybelle, just ask on our discord and we'll review it for security issues first.

Branches which are built are also available as previews.

#### Build Security

The build server needs access to providers for each of the chains for which data is being read, as well as API access to discord, github, and other places where merch-related metadata and multimedia are held.  Thus, a malicicious actor can submit a pull request which either emits those secrets in logs, or passes those secrets as context to the preview build. For this reason, we only allow    branches to be built, not pull requests.

The jenkins instance on the builder server does not have direct access to the web server; production builds are rsynced by a separate job, by a separate user.




`git submodule add git@github.com:cryptograss/happenings.git src/data/happenings`

