// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// Spotify, through its Web API, as one platform of a MyGo Music plugin. It
// reads and changes the listener's library; it plays nothing itself, as the
// Web API gives no audio: the plugin finds each song elsewhere to play it.
//
// Spotify's Development Mode lets an app open only playlists the listener
// made or collaborates on, and gives it no recommendations or radio.

import { call, pages, SpotifyError, type Paging } from "./api.ts";
import { authorize, connect, connectStatus, connected, endSession, hasSession } from "./auth.ts";
import { fail, setting, storage, t } from "./env.ts";
import {
  albumOf,
  artistOf,
  imageOf,
  playlistOf,
  trackOf,
  unique,
  type Album,
  type Playlist,
  type Track,
} from "./models.ts";

const LIKED = "liked";
const trackURI = (id: string) => `spotify:track:${id}`;
const setSaved = (uri: string, on: boolean) =>
  call(on ? "PUT" : "DELETE", "/me/library", { query: { uris: uri } });

async function contains(uris: string[]) {
  const out: boolean[] = [];
  for (let i = 0; i < uris.length; i += 40) {
    out.push(...(await call<boolean[]>("GET", "/me/library/contains", { query: { uris: uris.slice(i, i + 40).join(",") } })));
  }
  return out;
}

// Accounts.

interface Me {
  id: string;
  name: string;
  imageUrl?: string;
  at: number;
}

export async function account() {
  if (!hasSession() || !setting("clientId")) return null;
  let me = storage.get<Me>("me");
  if (!me || Date.now() - me.at > 6 * 3600_000) {
    let answer: any;
    try {
      answer = await call("GET", "/me");
    } catch (e) {
      if (!(e instanceof SpotifyError) || e.status !== 403) throw e;
      endSession();
      throw fail(
        "signIn",
        t(
          "Spotify won't let this account in: add it under User Management in your app's dashboard, and check the app's owner has Premium",
        ),
      );
    }
    me = { id: answer.id, name: answer.display_name || answer.id, imageUrl: imageOf(answer.images), at: Date.now() };
    storage.set("me", me);
  }
  return { id: me.id, name: me.name, imageUrl: me.imageUrl, page: "home" };
}

export async function signIn() {
  await authorize();
  return account();
}

export function signOut() {
  endSession();
}

// A session is of one app: another Client ID needs signing in again, which
// starts at once, in the browser.
export function setSetting({ key, value }: { key: string; value: string }) {
  if (key !== "clientId") return;
  endSession();
  if (value.trim()) connect();
}

// Pages of the plugin's own: "home"; "connect", which starts signing in and
// says to approve it in the browser; and "signout". Their routes carry a
// number, as the app keeps a page it has loaded by its route.

export const fresh = (page: string) => `${page}?n=${Date.now()}`;

export function connectLink() {
  return { title: t("Connect Spotify"), subtitle: t("Opens Spotify in your browser to approve"), page: fresh("connect") };
}

// statusText says what's in the way of using Spotify, or "" for nothing.
export function statusText() {
  if (!setting("clientId")) {
    return t("To use Spotify, paste the Client ID of your Spotify app in this plugin's settings: your browser then opens for you to approve.");
  }
  if (connected()) return "";
  const s = connectStatus();
  if (s.state === "waiting") return t("Waiting for you to approve in the browser. Approved already? Open Spotify again.");
  if (s.state === "failed") return t("Signing in to Spotify didn't work: {message}", { message: s.message });
  return t("Not signed in to Spotify yet.");
}

export async function browse({ page }: { page: string }) {
  const [name] = page.split("?");
  if (name === "connect") {
    if (!setting("clientId")) throw fail("setup", t("Paste the Client ID of your Spotify app in the plugin's settings first"));
    if (!connected()) connect();
    return {
      title: t("Connect Spotify"),
      description: connected()
        ? t("Signed in to Spotify.")
        : t("Approve access in the browser window that opened, then come back and open Spotify."),
      sections: [{ links: [{ title: t("Open Spotify"), page: fresh("home") }, connectLink()] }],
    };
  }
  if (name === "signout") {
    endSession();
    return { title: "Spotify", description: t("Signed out of Spotify."), sections: [{ links: [connectLink()] }] };
  }
  if (name !== "home") throw fail("unavailable", t("No such page"));
  if (!connected()) {
    return {
      title: "Spotify",
      description: statusText(),
      sections: setting("clientId") ? [{ links: [connectLink(), { title: t("Open Spotify"), page: fresh("home") }] }] : [],
    };
  }
  const [recent, top, artists, albums, lists] = await Promise.allSettled([
    call<Paging<any>>("GET", "/me/player/recently-played", { query: { limit: 50 } }),
    call<Paging<any>>("GET", "/me/top/tracks", { query: { limit: 20, time_range: "short_term" } }),
    call<Paging<any>>("GET", "/me/top/artists", { query: { limit: 20 } }),
    call<Paging<any>>("GET", "/me/albums", { query: { limit: 20 } }),
    playlists(),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const me = await account();
  return {
    title: "Spotify",
    subtitle: me?.name,
    imageUrl: me?.imageUrl,
    sections: [
      {
        title: t("Recently Played"),
        tracks: unique((ok(recent)?.items || []).map((i) => trackOf(i.track)).filter((x): x is Track => !!x)),
        empty: t("Nothing played lately"),
      },
      {
        title: t("Your Top Tracks"),
        tracks: (ok(top)?.items || []).map((x) => trackOf(x)).filter((x): x is Track => !!x),
      },
      { title: t("Your Top Artists"), artists: (ok(artists)?.items || []).map(artistOf).filter(Boolean) },
      { title: t("Saved Albums"), albums: (ok(albums)?.items || []).map((i) => albumOf(i.album)).filter(Boolean) },
      { title: t("Your Spotify Playlists"), playlists: ok(lists) || [] },
    ],
  };
}

// Search. Development Mode answers at most 10 of each kind a page.

export async function search({ query, kind, offset = 0 }: { query: string; kind: string; offset?: number }) {
  const type = { tracks: "track", albums: "album", artists: "artist", playlists: "playlist" }[kind];
  if (!type) return { [kind]: [], more: false };
  const r = await call("GET", "/search", { query: { q: query, type, limit: 10, offset } });
  const page = r[`${type}s`] as Paging<any>;
  const pick = { track: (x: any) => trackOf(x), album: albumOf, artist: artistOf, playlist: playlistOf }[type]!;
  return { [kind]: (page?.items || []).map(pick).filter(Boolean), more: Boolean(page?.next) };
}

// Albums and artists.

export async function album({ id }: { id: string }) {
  const [a, [saved]] = await Promise.all([call("GET", `/albums/${id}`), contains([`spotify:album:${id}`])]);
  const items = [...a.tracks.items];
  for (let next = a.tracks.next, i = 0; next && i < 10; i++) {
    const page: Paging<any> = await call("GET", next);
    items.push(...page.items);
    next = page.next;
  }
  return {
    album: { ...albumOf(a)!, saved },
    tracks: items.map((x) => trackOf(x, a)).filter(Boolean),
  };
}

export async function artist({ id }: { id: string }) {
  const a = await call("GET", `/artists/${id}`);
  const [albums, found] = await Promise.all([
    pages(`/artists/${id}/albums`, { include_groups: "album,single", limit: 10 }, albumOf, 3),
    // Development Mode has no top tracks: these are what a search finds of theirs.
    call("GET", "/search", { query: { q: `artist:"${a.name}"`, type: "track", limit: 10 } }),
  ]);
  const tracks = (found.tracks?.items || [])
    .filter((x: any) => x?.artists?.some((y: any) => y.id === id))
    .map((x: any) => trackOf(x));
  return { artist: artistOf(a), tracks, albums };
}

export const saveAlbum = ({ id, on }: { id: string; on: boolean }) => setSaved(`spotify:album:${id}`, on);

export async function savedAlbums({ offset = 0 }: { offset?: number }) {
  const r = await call<Paging<any>>("GET", "/me/albums", { query: { limit: 50, offset } });
  const albums = r.items.map((i) => albumOf(i.album)).filter((x): x is Album => !!x);
  return { albums: albums.map((x) => ({ ...x, saved: true })), more: Boolean(r.next) };
}

// The library: liked songs, as a playlist that's the listener's but kept by
// Spotify, and their playlists.

export async function liked({ offset = 0 }: { offset?: number }) {
  const r = await call<Paging<any>>("GET", "/me/tracks", { query: { limit: 50, offset } });
  return { tracks: r.items.map((i) => trackOf(i.track)).filter(Boolean), more: Boolean(r.next) };
}

export async function isLiked({ ids }: { ids: string[] }) {
  const found = await contains(ids.map(trackURI));
  return Object.fromEntries(ids.map((id, i) => [id, Boolean(found[i])]));
}

export const like = ({ id, on }: { id: string; on: boolean }) => setSaved(trackURI(id), on);

const likedPlaylist = (): Playlist => ({ id: LIKED, name: t("Spotify Liked Songs"), mine: true, fixed: true });

export async function playlists() {
  const lists = await pages("/me/playlists", { limit: 50 }, playlistOf, 10);
  return [likedPlaylist(), ...lists];
}

export async function playlist({ id }: { id: string }) {
  if (id === LIKED) {
    const tracks = await pages("/me/tracks", { limit: 50 }, (i: any) => trackOf(i.track), 20);
    return { ...likedPlaylist(), trackCount: tracks.length, tracks };
  }
  let p;
  try {
    p = await call("GET", `/playlists/${id}`);
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 403 || e.status === 404)) {
      throw fail("unavailable", t("Spotify only lets this app open playlists you made or collaborate on"));
    }
    throw e;
  }
  const tracks = await pages(`/playlists/${id}/items`, { limit: 50 }, (i: any) => trackOf(i.item || i.track), 40);
  return { ...playlistOf(p)!, trackCount: tracks.length, tracks };
}

export async function createPlaylist({ name }: { name: string }) {
  const p = playlistOf(await call("POST", "/me/playlists", { body: { name, public: false } }))!;
  return { ...p, mine: true, saved: undefined, trackCount: 0, tracks: [] };
}

export async function renamePlaylist({ id, name }: { id: string; name: string }) {
  await call("PUT", `/playlists/${id}`, { body: { name } });
}

// A playlist is let go of, as Spotify has it: no one deletes one there.
export const deletePlaylist = ({ id }: { id: string }) => setSaved(`spotify:playlist:${id}`, false);
export const savePlaylist = ({ id, on }: { id: string; on: boolean }) => setSaved(`spotify:playlist:${id}`, on);

export async function addToPlaylist({ id, trackIds }: { id: string; trackIds: string[] }) {
  if (id === LIKED) throw fail("unsupported", t("Use song hearts to change your liked songs"));
  for (let i = 0; i < trackIds.length; i += 100) {
    await call("POST", `/playlists/${id}/items`, { body: { uris: trackIds.slice(i, i + 100).map(trackURI) } });
  }
}

export async function removeFromPlaylist({ id, trackIds }: { id: string; trackIds: string[] }) {
  if (id === LIKED) throw fail("unsupported", t("Use song hearts to change your liked songs"));
  for (let i = 0; i < trackIds.length; i += 100) {
    const items = trackIds.slice(i, i + 100).map((x) => ({ uri: trackURI(x) }));
    await call("DELETE", `/playlists/${id}/items`, { body: { items } });
  }
}

export async function movePlaylistTrack({ id, from, to }: { id: string; from: number; to: number }) {
  if (id === LIKED) throw fail("unsupported", t("Use song hearts to change your liked songs"));
  await call("PUT", `/playlists/${id}/items`, { body: { range_start: from, insert_before: to > from ? to + 1 : to } });
}
