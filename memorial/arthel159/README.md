# arthel159

Kuba Hejhal's pull request #159, "Custom chartifact audio player",
opened 6 July 2024 and merged in November 2026: the last of his work
to reach main.

Four commits, his, unchanged:

- `6d9bf2c` 2024-07-05 12:33 +0200: include audio assets in the webpack build
- `f91df17` 2024-07-05 12:37 +0200: basic html audio player playing 44 silver
- `af49656` 2024-07-05 18:30 +0200: rudimentary player
- `a180946` 2024-07-06 15:08 +0200: player playing state is preserved across songs

The two files he changed no longer exist where he changed them: main
moved from Handlebars to Nunjucks, and the sites into `src/sites/`.
So they are kept here as they stood at `a180946`:

- `cryptograss.hbs`: the cryptograss page, with his player on it:
  the Vowel Sounds cover, previous / play / next, a progress bar, and
  a playlist of Silver .44 and August.
- `webpack.common.js`: the build, copying `src/audio` into the site.

His sketch of the player he meant this to become is arthel issue #160.
Rabbithole grew from here.

Kuba: https://pickipedia.xyz/wiki/Kuba_Hejhal
