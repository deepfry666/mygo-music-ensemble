# Notices

This project is licensed under the GNU Affero General Public License v3.0 or later (see `LICENSE`).
It is not affiliated with or endorsed by NetEase or Spotify, and uses private APIs that may change
without notice.

## Third-party code

### packages/netease

Derived from [AkinoKaede/mygo-music-netease-cloud-music](https://github.com/AkinoKaede/mygo-music-netease-cloud-music)
at commit `7433617d8ee3c405f59416a4da38e38e070f9c6b`, Copyright 2026 Kaede Akino, AGPL-3.0-or-later.

Changes: storage keys and setting names go through `src/env.ts`, which prefixes them when the
package shares a plugin with other platforms. Files that were changed say so in their headers.

`scripts/build.ts` is derived from the same repository's build script.
