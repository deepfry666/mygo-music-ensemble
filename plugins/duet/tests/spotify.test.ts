// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// Duet with Spotify, as built, against made-up answers from Spotify and NetEase.
// Run with PLUGIN_DIR=dist/duet.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { harness, type Call } from "../../../packages/netease/tests/harness.ts";

const neSignedIn = {
  "ne.account": { id: "7", name: "网易用户" },
  "ne.cookies": { MUSIC_U: "test-session", __csrf: "test-csrf" },
};
const spSignedIn = {
  "sp.session": { access: "access-1", refresh: "refresh-1", expiresAt: Date.now() + 3600_000 },
  "sp.me": { id: "me", name: "Spotify User", at: Date.now() },
};
const settings = { "sp.clientId": "client-1" };

// NetEase songs by ID, as /api/v3/song/detail and the search answer them.
const catalog: Record<number, { name: string; ar: string; dt: number }> = {
  101: { name: "晴天 (原唱 周杰伦)", ar: "RyaVocal", dt: 270000 },
  102: { name: "晴天", ar: "周杰伦", dt: 269000 },
  201: { name: "七里香", ar: "周杰伦", dt: 299000 },
};
const neSong = (id: number) => ({
  id,
  name: catalog[id].name,
  ar: [{ id: 1, name: catalog[id].ar }],
  al: { id: 2, name: "Album", picUrl: "" },
  dt: catalog[id].dt,
});

function netease({ path, params }: Call) {
  if (path === "/api/cloudsearch/pc") {
    const ids = String(params.s).includes("七里香") ? [201] : [101, 102];
    return { result: { songs: ids.map(neSong), songCount: ids.length } };
  }
  if (path === "/api/v3/song/detail") {
    const ids = (JSON.parse(String(params.c)) as { id: number }[]).map((x) => x.id);
    return { songs: ids.map(neSong), privileges: ids.map((id) => ({ id, st: 0, pl: 320000 })) };
  }
  if (path === "/api/song/enhance/player/url/v1") {
    const id = Number(String(params.ids).slice(1, -1));
    return { data: [{ id, url: `https://audio.example/${id}.mp3`, type: "mp3", level: "standard" }] };
  }
  if (path === "/api/user/playlist") {
    return { playlist: [{ id: 900, name: "我的歌单", userId: 7, trackCount: 1, creator: { userId: 7 } }], more: false };
  }
  if (path === "/api/nuser/account/get") return { profile: { userId: 7, nickname: "网易用户" } };
  return undefined;
}

const spTrack = (id: string, name: string, artist: string, ms: number) => ({
  id,
  type: "track",
  name,
  duration_ms: ms,
  artists: [{ id: `a-${artist}`, name: artist }],
  album: { id: "al", name: "Album", images: [{ url: "https://i.scdn.co/640", width: 640 }] },
});

const json = (body: unknown, status = 200) => Response.json(body, { status });

test("without a Client ID, Duet is NetEase alone and Spotify's page says what to do", async () => {
  const h = await harness((call) => {
    assert.notEqual(call.url.hostname, "api.spotify.com", "asked Spotify while it isn't set up");
    return netease(call);
  }, { storage: neSignedIn });
  const lists = (await h.plugin.playlists()) as { id: string }[];
  assert.ok(lists.every((p) => p.id.startsWith("ne:")));
  const page = (await h.plugin.browse({ page: "sp:home" })) as { description: string; sections: unknown[] };
  assert.match(page.description, /Client ID/);
  assert.equal(page.sections.length, 0);
  await assert.rejects(h.plugin.browse({ page: "sp:connect" }), { code: "setup" });
  await assert.rejects(h.plugin.search({ query: "sp: 晴天", kind: "tracks", offset: 0 }), { code: "signIn" });
});

test("signing in to Spotify uses PKCE and keeps the session under sp.", async () => {
  let challenge = "";
  const h = await harness(
    (call) => {
      if (call.url.hostname === "accounts.spotify.com") {
        const form = new URLSearchParams(String(call.options.body));
        assert.equal(form.get("grant_type"), "authorization_code");
        assert.equal(form.get("code"), "the-code");
        assert.equal(form.get("client_id"), "client-1");
        const verifier = form.get("code_verifier")!;
        assert.equal(createHash("sha256").update(verifier).digest("base64url"), challenge);
        return json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
      }
      if (call.url.hostname === "api.spotify.com" && call.path === "/v1/me") {
        assert.equal(call.options.headers.authorization, "Bearer access-1");
        return json({ id: "me", display_name: "Spotify User", images: [] });
      }
      return netease(call);
    },
    { storage: neSignedIn, settings },
  );
  let redirected: (q: Record<string, string>) => void = () => {};
  const host = h.host as unknown as Record<string, unknown>;
  host.waitForRedirect = (o: { port: number; path: string }) => {
    assert.equal(o.port, 43110);
    assert.equal(o.path, "/callback");
    return new Promise((resolve) => (redirected = resolve));
  };
  host.openURL = (address: string) => {
    const url = new URL(address);
    assert.equal(url.origin + url.pathname, "https://accounts.spotify.com/authorize");
    assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:43110/callback");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.match(url.searchParams.get("scope")!, /playlist-modify-private/);
    challenge = url.searchParams.get("code_challenge")!;
    setTimeout(() => redirected({ code: "the-code", state: url.searchParams.get("state")! }), 0);
  };
  const me = (await h.plugin.signIn()) as { id: string; name: string };
  assert.equal(me.id, "ne:7");
  assert.equal(me.name, "网易用户 · Spotify User");
  assert.equal((h.state.get("sp.session") as { refresh: string }).refresh, "refresh-1");
  assert.equal(h.state.has("session"), false);
});

test("an expired Spotify token is refreshed once and kept", async () => {
  let refreshed = 0;
  const h = await harness(
    (call) => {
      if (call.url.hostname === "accounts.spotify.com") {
        refreshed++;
        assert.equal(new URLSearchParams(String(call.options.body)).get("refresh_token"), "refresh-1");
        return json({ access_token: "access-2", expires_in: 3600 });
      }
      if (call.path === "/v1/me/playlists") {
        assert.equal(call.options.headers.authorization, "Bearer access-2");
        return json({ items: [], next: null });
      }
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn, "sp.session": { access: "old", refresh: "refresh-1", expiresAt: 0 } }, settings },
  );
  await h.plugin.playlists();
  assert.equal(refreshed, 1);
  const s = h.state.get("sp.session") as { access: string; refresh: string };
  assert.equal(s.access, "access-2");
  assert.equal(s.refresh, "refresh-1");
});

test("both platforms' playlists are listed, Spotify's marked, its liked songs fixed", async () => {
  const h = await harness(
    (call) => {
      if (call.path === "/v1/me/playlists") {
        return json({
          items: [
            { id: "p1", name: "Road Trip", owner: { id: "me" }, items: { total: 3 }, images: [] },
            { id: "p2", name: "Someone's", owner: { id: "them" }, images: [] },
          ],
          next: null,
        });
      }
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn }, settings },
  );
  const lists = (await h.plugin.playlists()) as { id: string; name: string; mine?: boolean; fixed?: boolean }[];
  const sp = lists.filter((p) => p.id.startsWith("sp:"));
  assert.ok(lists.some((p) => p.id.startsWith("ne:")));
  assert.deepEqual(
    sp.map((p) => [p.id, p.name, Boolean(p.mine), Boolean(p.fixed)]),
    [
      ["sp:liked", "Spotify Liked Songs · Spotify", true, true],
      ["sp:p1", "Road Trip · Spotify", true, false],
      ["sp:p2", "Someone's · Spotify", false, false],
    ],
  );
});

test("a Spotify song plays as the same song on NetEase, found once and remembered", async () => {
  let looked = 0;
  const h = await harness(
    (call) => {
      if (call.path === "/v1/tracks/sp1") {
        looked++;
        return json(spTrack("sp1", "晴天", "Jay Chou", 269500));
      }
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn }, settings },
  );
  const audio = (await h.plugin.stream({ id: "sp:sp1", quality: "standard" })) as { url: string };
  assert.equal(audio.url, "https://audio.example/102.mp3");
  await h.plugin.stream({ id: "sp:sp1", quality: "standard" });
  assert.equal(looked, 1);
  assert.deepEqual(h.state.get("duet.match.sp:sp1"), { to: "102", at: (h.state.get("duet.match.sp:sp1") as { at: number }).at });
  const words = h.calls.filter((c) => c.path === "/api/cloudsearch/pc").length;
  await h.plugin.lyrics({ id: "sp:sp1" }).catch(() => {});
  assert.equal(h.calls.filter((c) => c.path === "/api/cloudsearch/pc").length, words, "searched again for lyrics");
});

test("a Spotify song NetEase doesn't have is unavailable, and that's remembered too", async () => {
  const h = await harness(
    (call) => {
      if (call.path === "/v1/tracks/sp9") return json(spTrack("sp9", "Nowhere Song", "Nobody", 200000));
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn }, settings },
  );
  await assert.rejects(h.plugin.stream({ id: "sp:sp9" }), { code: "unavailable" });
  assert.equal((h.state.get("duet.match.sp:sp9") as { to: unknown }).to, null);
});

test("a NetEase song added to a Spotify playlist goes as the same song on Spotify", async () => {
  let added: unknown;
  const h = await harness(
    (call) => {
      if (call.path === "/v1/search") {
        assert.equal(call.url.searchParams.get("type"), "track");
        return json({ tracks: { items: [spTrack("spQ", "七里香", "Jay Chou", 299500)], next: null } });
      }
      if (call.path === "/v1/playlists/p1/items" && call.options.method === "POST") {
        added = JSON.parse(String(call.options.body));
        return json({ snapshot_id: "s" }, 201);
      }
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn }, settings },
  );
  await h.plugin.addToPlaylist({ id: "sp:p1", trackIds: ["ne:201"] });
  assert.deepEqual(added, { uris: ["spotify:track:spQ"] });
});

test("songs that can't be found are left out of the playlist, and said so", async () => {
  let posted = 0;
  const h = await harness(
    (call) => {
      if (call.path === "/v1/search") return json({ tracks: { items: [], next: null } });
      if (call.path === "/v1/playlists/p1/items") posted++;
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn }, settings },
  );
  await assert.rejects(h.plugin.addToPlaylist({ id: "sp:p1", trackIds: ["ne:201"] }), /Added 0; 1 couldn't be found on Spotify/);
  assert.equal(posted, 0);
});

test("search finds on both, NetEase's first, and pages each on its own", async () => {
  const h = await harness(
    (call) => {
      if (call.path === "/v1/search") {
        const offset = Number(call.url.searchParams.get("offset"));
        return json({
          tracks: {
            items: [spTrack(`s${offset}`, "七里香", "Jay Chou", 299500)],
            next: offset === 0 ? "https://api.spotify.com/v1/search?offset=1" : null,
          },
        });
      }
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn }, settings },
  );
  const first = (await h.plugin.search({ query: "七里香", kind: "tracks", offset: 0 })) as {
    tracks: { id: string }[];
    more: boolean;
  };
  assert.deepEqual(first.tracks.map((x) => x.id), ["ne:201", "sp:s0"]);
  assert.equal(first.more, true);
  const second = (await h.plugin.search({ query: "七里香", kind: "tracks", offset: 2 })) as {
    tracks: { id: string }[];
    more: boolean;
  };
  assert.deepEqual(second.tracks.map((x) => x.id), ["sp:s1"]);
  assert.equal(second.more, false);
  const onlySpotify = (await h.plugin.search({ query: "sp: 七里香", kind: "tracks", offset: 0 })) as {
    tracks: { id: string }[];
  };
  assert.deepEqual(onlySpotify.tracks.map((x) => x.id), ["sp:s0"]);
});

test("Spotify hearts are asked of Spotify, NetEase's of NetEase", async () => {
  const h = await harness(
    (call) => {
      if (call.path === "/v1/me/library/contains") {
        assert.equal(call.url.searchParams.get("uris"), "spotify:track:a,spotify:track:b");
        return json([true, false]);
      }
      if (call.path === "/api/song/like/get") return { ids: [201] };
      return netease(call);
    },
    { storage: { ...neSignedIn, ...spSignedIn }, settings },
  );
  assert.deepEqual(await h.plugin.isLiked({ ids: ["sp:a", "ne:201", "sp:b"] }), {
    "sp:a": true,
    "sp:b": false,
    "ne:201": true,
  });
});

// Signing in to Spotify once NetEase is: the app offers no Sign In then.

function browserMock(h: { host: unknown }) {
  const host = h.host as Record<string, unknown>;
  const opened: string[] = [];
  let waits = 0;
  let redirected: (q: Record<string, string>) => void = () => {};
  host.waitForRedirect = () => {
    waits++;
    return new Promise((resolve) => (redirected = resolve));
  };
  host.openURL = (address: string) => opened.push(address);
  const approve = () => {
    const url = new URL(opened.at(-1)!);
    redirected({ code: "the-code", state: url.searchParams.get("state")! });
  };
  return { opened, waits: () => waits, approve };
}

const spotifyAccounts = (call: Call) => {
  if (call.url.hostname === "accounts.spotify.com") {
    return json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
  }
  if (call.path === "/v1/me") return json({ id: "me", display_name: "Spotify User", images: [] });
  return netease(call);
};

test("filling in the Client ID opens Spotify's approval in the browser, at once", async () => {
  const s = { ...settings };
  const h = await harness(spotifyAccounts, { storage: neSignedIn, settings: s });
  const b = browserMock(h);
  h.plugin.setSetting({ key: "sp.clientId", value: "client-1" });
  assert.equal(b.opened.length, 1);
  assert.match(b.opened[0], /^https:\/\/accounts\.spotify\.com\/authorize\?.*client_id=client-1/);
  // Asked again while it waits, as the browser's page was closed: opened again, still one sign-in.
  const page = (await h.plugin.browse({ page: "sp:connect?n=1" })) as { description: string };
  assert.match(page.description, /browser/);
  assert.equal(b.opened.length, 2);
  assert.equal(b.waits(), 1);
  b.approve();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal((h.state.get("sp.session") as { access: string }).access, "access-1");
  const me = (await h.plugin.account()) as { name: string; page: string };
  assert.equal(me.name, "网易用户 · Spotify User");
  assert.equal(me.page, "duet:accounts");
});

test("My Page lists both accounts, and how to sign in to Spotify or out of it", async () => {
  type Page = { sections: { title: string; links: { title: string; page: string }[]; empty: string }[] };
  const none = await harness(netease, { storage: neSignedIn });
  const a = (await none.plugin.browse({ page: "duet:accounts" })) as Page;
  assert.equal(a.sections[0].links[0].page, "ne:profile");
  assert.equal(a.sections[1].links.length, 0);
  assert.match(a.sections[1].empty, /Client ID/);

  const ready = await harness(netease, { storage: neSignedIn, settings });
  const b = (await ready.plugin.browse({ page: "duet:accounts" })) as Page;
  assert.match(b.sections[1].links[0].page, /^sp:connect\?n=\d+$/);

  const both = await harness(netease, { storage: { ...neSignedIn, ...spSignedIn }, settings });
  const c = (await both.plugin.browse({ page: "duet:accounts" })) as Page;
  assert.deepEqual(
    c.sections[1].links.map((l) => l.page.replace(/\d+$/, "")),
    ["sp:home?n=", "sp:signout?n="],
  );
  await both.plugin.browse({ page: c.sections[1].links[1].page });
  assert.equal(both.state.has("sp.session"), false);
  assert.ok(both.state.has("ne.cookies"), "signing out of Spotify signed out of NetEase too");
});

test("a sign-in Spotify turns down says so on the Spotify page", async () => {
  const h = await harness(
    (call) => {
      if (call.url.hostname === "accounts.spotify.com") return json({ error: "invalid_client", error_description: "Invalid client" }, 400);
      return netease(call);
    },
    { storage: neSignedIn, settings },
  );
  const b = browserMock(h);
  await h.plugin.browse({ page: "sp:connect?n=1" });
  b.approve();
  await new Promise((r) => setTimeout(r, 10));
  const page = (await h.plugin.browse({ page: "sp:home?n=2" })) as { description: string };
  assert.match(page.description, /didn't work: Invalid client/);
});
