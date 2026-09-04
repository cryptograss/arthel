# Posts, and running arthel from another repo

Two related changes live here. They are the groundwork for pulling
justinholmes.com and cryptograss.live out of arthel into their own repos, so
that arthel becomes a build engine rather than an engine with two websites
inside it.

Nothing about the current in-tree build changes. Both sites still build exactly
as they did.

## Writing a post

A **posts collection** is a directory of files named `<epoch>-<slug>.yaml`,
each optionally paired with a `<epoch>-<slug>.md` holding the body:

```
posts/
├── 1767225600-why-car-lanes-divide-us.yaml
├── 1767225600-why-car-lanes-divide-us.md
├── 1735689600-a-quieter-one.yaml
└── 1735689600-a-quieter-one.md
```

The `<epoch>` is a unix timestamp. It is what orders the collection and what
gives the post its date, so there is no date field to keep in sync and no way
for the filename and the displayed date to disagree. Get one with:

```sh
date +%s
```

The `.yaml` holds whatever the templates want — at minimum a title:

```yaml
title: Why Car Lanes Divide Us
blurb: Bike lanes are just car lanes seen from the other side of the paint.
```

The `.md` holds the body. It is rendered through nunjucks *first* and then
through marked, so a post can use the same template helpers the rest of the
site has.

Each post arrives at the templates with these fields filled in:

| field            | meaning                                          |
|------------------|--------------------------------------------------|
| `epoch`          | the unix timestamp from the filename             |
| `slug`           | everything after the first dash                  |
| `iso_date`       | `2026-01-01`                                     |
| `local_datetime` | a human-readable date                            |
| `body`           | rendered HTML, absent if there is no `.md`       |

Posts reach the index template newest first.

A file that is not named `<epoch>-<slug>.yaml` is an error rather than a
silent skip, because a post that quietly fails to publish is worse than a
build that stops.

## Configuring a collection

Sites built from arthel's own tree get their collection by name:
cryptograss.live keeps its `happenings`, with the index still doubling as the
front page. That is the only in-tree default, and it exists so the old
behaviour is preserved exactly.

Anything else declares a collection in `arthel.config.json`:

```json
{
  "site": "justinholmes.com",
  "posts": {
    "dir": "posts",
    "indexTemplate": "pages/blog.njk",
    "itemTemplate": "reuse/single-post.njk",
    "indexOutput": "blog/index.html",
    "itemOutputPattern": "blog/{slug}.html"
  }
}
```

Omit `posts` entirely and the site has no posts; nothing is rendered.

## Running arthel from another repo

`src/build_logic/locations.js` used to derive every path from arthel's own
location on disk, which is why nothing could live outside this repo. It now
supports two layouts.

**In-tree** is the old one, and is still what happens when no config is found:
the site is at `src/sites/<site>`, content at `src/data` and `src/images`,
media at `audio/` and `epk/`.

**Consumer** is the new one. A separate site repo owns its own templates and
content and describes them at its root:

```json
{
  "site": "justinholmes.com",
  "siteDir": "site",
  "dataDir": "data",
  "imagesDir": "images",
  "audioDir": "audio",
  "outputDir": "output"
}
```

Every key is optional and defaults to the name shown. Paths resolve against
the directory holding the config file.

The config is found by walking up from the working directory, or by pointing
`$ARTHEL_CONFIG` straight at it. A webpack config, which runs before any npm
script has set a working directory, can hand arthel the config directly
instead:

```js
import { initProjectDirs } from 'arthel/locations';
initProjectDirs({ site: 'justinholmes.com', rootDir: import.meta.dirname });
```

Every path key `getProjectDirs()` exported before still exists and still means
the same thing, so the twenty-six modules that consume it did not need to
change. Three keys were added — `audioDir`, `epkDir` and `arthelSrcDir` —
replacing the `path.resolve(srcDir, '../audio')` arithmetic that assumed
content sat next to the engine.

## Still to do

- `package.json` is still named `justinholmes.com-and-cryptograss-tools` and
  has no `exports` map, so arthel cannot yet be installed as a dependency.
  That belongs with the actual repo split, where an install can be tested end
  to end rather than guessed at.
- The `if (site === "cryptograss.live")` branches in `primary_builder.js` are
  still there. Posts was the first one lifted out; the Blue Railroad and
  SetStone chapters are the remaining ones, and they are a bigger job because
  they carry chain logic with them.
