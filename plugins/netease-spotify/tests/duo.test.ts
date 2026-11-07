// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// The NetEase + Spotify plugin, as built: IDs and pages carry their platform,
// and the NetEase package keeps its storage and settings under "ne.".
// Run with PLUGIN_DIR=dist/netease-spotify.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { harness, pluginDirectory, song, songDetails } from "../../../packages/netease/tests/harness.ts";

const signedIn = {
  "ne.account": { id: "7", name: "Listener" },
  "ne.cookies": { MUSIC_U: "test-session", __csrf: "test-csrf" },
};

test("search answers NetEase songs with ne: IDs, which play back from NetEase", async () => {
  const h = await harness(({ path, params }) => {
    if (path === "/api/cloudsearch/pc") return { result: { songs: [song(1)], songCount: 1 } };
    if (path === "/api/v3/song/detail") return songDetails(params);
    if (path === "/api/song/enhance/player/url/v1") {
      assert.equal(params.ids, "[1]");
      return { data: [{ id: 1, url: "http://audio.example/1.mp3", type: "mp3", level: "standard" }] };
    }
  });
  const { tracks } = await h.plugin.search({ query: "a", kind: "tracks", offset: 0 });
  assert.equal(tracks[0].id, "ne:1");
  assert.equal(tracks[0].album.id, "ne:20");
  assert.equal(tracks[0].artists[0].id, "ne:10");
  const audio = await h.plugin.stream({ id: tracks[0].id });
  assert.equal(audio.url, "https://audio.example/1.mp3");
});

test("an ID of no platform this plugin has is unavailable", async () => {
  const h = await harness(() => undefined);
  await assert.rejects(h.plugin.stream({ id: "1" }), { code: "unavailable" });
  await assert.rejects(h.plugin.album({ id: "xx:1" }), { code: "unavailable" });
});

test("the NetEase session is kept under ne., and only there", async () => {
  const before = await harness(() => undefined, {
    storage: { account: { id: "7", name: "Old" }, cookies: { MUSIC_U: "unprefixed" } },
  });
  assert.equal(await before.plugin.account(), null);

  const h = await harness(
    ({ path, options }) => {
      if (path === "/api/nuser/account/get") {
        assert.match(options.headers.Cookie, /MUSIC_U=test-session/);
        return { profile: { userId: 7, nickname: "Listener" } };
      }
    },
    { storage: signedIn },
  );
  const me = await h.plugin.account();
  assert.equal(me?.id, "ne:7");
  assert.equal(me?.page, "ne:profile");
  assert.equal(h.state.has("account"), false);
});

test("hearts answer for each song by its ne: ID", async () => {
  const h = await harness(
    ({ path }) => {
      if (path === "/api/song/like/get") return { ids: [1] };
    },
    { storage: signedIn },
  );
  assert.deepEqual(await h.plugin.isLiked({ ids: ["ne:1", "ne:2"] }), { "ne:1": true, "ne:2": false });
});

test("settings are named ne.<key> and checked by NetEase", async () => {
  const h = await harness(
    ({ path, params }) => {
      if (path === "/api/song/enhance/player/url/v1") {
        assert.equal(params.level, "lossless");
        return { data: [{ id: 1, url: "https://audio.example/1.flac", type: "flac", level: "lossless" }] };
      }
    },
    { settings: { "ne.quality": "lossless" } },
  );
  assert.throws(() => h.plugin.setSetting({ key: "ne.quality", value: "loud" }), { code: "setup" });
  assert.equal((await h.plugin.stream({ id: "ne:1" })).type, "flac");
});

test("pages go to their platform, and the pages they link to are tagged", async () => {
  const h = await harness(({ path }) => {
    if (path === "/api/toplist/detail") {
      return { list: [{ id: 30, name: "Hot", coverImgUrl: "", updateFrequency: "" }] };
    }
  });
  const page = await h.plugin.browse({ page: "ne:charts" });
  const ids = JSON.stringify(page).match(/"(id|page|morePage)":"[^"]*"/g) ?? [];
  assert.ok(ids.length > 0);
  for (const field of ids) assert.match(field, /:"(ne:|")/, field);
});

test("the manifest's pages and settings are all of a platform", async () => {
  const manifest = JSON.parse(await readFile(`${pluginDirectory}/plugin.json`, "utf8"));
  for (const item of manifest.navigation) if (item.page) assert.match(item.page, /^ne:/);
  for (const s of manifest.settings) assert.match(s.key, /^ne\./);
  const zh = JSON.parse(await readFile(`${pluginDirectory}/locales/zh-CN.json`, "utf8"));
  for (const text of [manifest.name, ...manifest.settings.map((s: { label: string }) => s.label)]) {
    assert.ok(zh[text], `no translation of ${text}`);
  }
});
