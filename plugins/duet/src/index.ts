// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// Duet: NetEase Cloud Music and Spotify in one plugin, side by side: each keeps
// its own playlists, picks and likes. IDs and pages carry their platform
// ("ne:", "sp:"), see packages/core.
//
// Spotify's Web API gives no audio, so a Spotify song plays as the same song
// on NetEase, with NetEase's lyrics and comments.

import { Platforms, fail, platformOf, tag, untag } from "../../../packages/core/src/namespace.ts";
import * as netease from "../../../packages/netease/src/index.ts";
import { connected as spotifyConnected } from "../../../packages/spotify/src/auth.ts";
import * as spotify from "../../../packages/spotify/src/index.ts";
import { onNetEase, onSpotify } from "./cross.ts";

const platforms = new Platforms({ ne: netease, sp: spotify });
const t = (text: string, values?: Record<string, unknown>) =>
  host.t(text).replace(/\{(\w+)\}/g, (token, key) => (values && key in values ? String(values[key]) : token));

type Params = Record<string, unknown>;
type Account = { id: string; name: string; imageUrl?: string; page?: string } | null;

const spotifyReady = () => spotifyConnected();

// Accounts. Signing in signs in to each platform that isn't yet: NetEase with
// its QR code, then Spotify in the browser, once its Client ID is filled in.

async function accounts() {
  const [ne, sp] = await Promise.all([
    platforms.call("ne", "account") as Promise<Account>,
    spotifyReady() ? (platforms.call("sp", "account").catch(() => null) as Promise<Account>) : null,
  ]);
  return { ne, sp };
}

export async function account() {
  const { ne, sp } = await accounts();
  if (ne && sp) return { ...ne, name: `${ne.name} · ${sp.name}` };
  return ne ?? sp;
}

export async function signIn() {
  if (!(await platforms.call("ne", "account"))) await platforms.call("ne", "signIn");
  if (host.setting("sp.clientId") && !spotifyReady()) await platforms.call("sp", "signIn");
  return account();
}

export async function signOut() {
  await platforms.call("ne", "signOut");
  await platforms.call("sp", "signOut");
}

// Settings are kept as "<platform>.<key>", as plugin.json names them.
export function setSetting({ key, value }: { key: string; value: string }) {
  const [platform, ...rest] = key.split(".");
  if (!rest.length || !platforms.can(platform, "setSetting")) return;
  return platforms.get(platform).setSetting!({ key: rest.join("."), value });
}

// Home is NetEase's, its daily songs first, and what Spotify has on its own page.
export async function home() {
  const page = (await platforms.call("ne", "home")) as { sections?: unknown[] };
  if (!spotifyReady()) return page;
  return {
    ...page,
    sections: [
      ...(page.sections ?? []),
      { title: "Spotify", links: [{ title: t("Your Spotify"), subtitle: t("Recently played, top tracks and playlists"), page: "sp:home" }] },
    ],
  };
}

// Search finds on both, NetEase's first, unless the query starts with "sp:"
// or "ne:" for one of them. Each keeps its own place in the pages that follow.

const cursors = new Map<string, { ne: number | null; sp: number | null }>();
const cursorKey = (query: string, kind: string, offset: number) => `${kind}\u0000${offset}\u0000${query}`;

export async function search({ query, kind, offset = 0 }: { query: string; kind: string; offset?: number }) {
  const only = /^\s*(sp|spotify|ne|netease|网易云?)\s*[:：]\s*/i.exec(query);
  if (only) {
    const p = /^(sp|spotify)$/i.test(only[1]) ? "sp" : "ne";
    if (p === "sp" && !spotifyReady()) throw fail("signIn", t("Sign in to Spotify first"));
    return platforms.call(p, "search", { query: query.slice(only[0].length), kind, offset });
  }
  const at = offset === 0 ? { ne: 0, sp: spotifyReady() ? 0 : null } : cursors.get(cursorKey(query, kind, offset));
  if (!at) return { [kind]: [], more: false };
  const ask = (p: "ne" | "sp", from: number | null) =>
    from === null
      ? Promise.resolve({ items: [] as unknown[], next: null })
      : (platforms.call(p, "search", { query, kind, offset: from }) as Promise<Record<string, unknown>>).then(
          (r) => {
            const items = (r[kind] as unknown[]) ?? [];
            return { items, next: r.more ? from + items.length : null };
          },
          (e) => {
            if (p === "ne") throw e;
            return { items: [] as unknown[], next: null };
          },
        );
  const [ne, sp] = await Promise.all([ask("ne", at.ne), ask("sp", at.sp)]);
  const items = [...ne.items, ...sp.items];
  const more = ne.next !== null || sp.next !== null;
  if (more) cursors.set(cursorKey(query, kind, offset + items.length), { ne: ne.next, sp: sp.next });
  if (cursors.size > 200) cursors.delete(cursors.keys().next().value!);
  return { [kind]: items, more };
}

const onNE = (name: string) => (params?: Params) => platforms.call("ne", name, params);
export const suggest = onNE("suggest");
export const recent = onNE("recent");
export const liked = onNE("liked");
export const savedAlbums = onNE("savedAlbums");
export const createPlaylist = onNE("createPlaylist");
export const stations = onNE("stations");
export const shows = onNE("shows");

// Both platforms' playlists, Spotify's marked as such.
export async function playlists() {
  const ne = (await platforms.call("ne", "playlists")) as unknown[];
  if (!spotifyReady()) return ne;
  let sp: { name: string }[] = [];
  try {
    sp = (await platforms.call("sp", "playlists")) as { name: string }[];
  } catch {
    // NetEase's still list while Spotify can't be reached.
  }
  return [...ne, ...sp.map((p) => ({ ...p, name: `${p.name} · Spotify` }))];
}

export async function isLiked({ ids }: { ids: string[] }) {
  const byPlatform = new Map<string, string[]>();
  for (const id of ids) {
    const p = platformOf(id);
    if (platforms.can(p, "isLiked")) byPlatform.set(p, [...(byPlatform.get(p) ?? []), id]);
  }
  const answer: Record<string, boolean> = {};
  for (const [p, some] of byPlatform) {
    if (p === "sp" && !spotifyReady()) continue;
    const liked = (await platforms.get(p).isLiked!({ ids: some.map((id) => untag(p, id)) })) as Record<string, boolean>;
    for (const [id, on] of Object.entries(liked)) answer[tag(p, id)] = on;
  }
  return answer;
}

// A Spotify song plays as the same song on NetEase, which also has its words
// and what people said of it.

async function asNetEase(id: unknown) {
  const value = String(id);
  if (platformOf(value) !== "sp") return value;
  const found = await onNetEase(untag("sp", value));
  if (!found) throw fail("unavailable", t("This song isn't on NetEase Cloud Music, so it can't be played here"));
  return tag("ne", found);
}

export const stream = async (p: Params) => platforms.call("ne", "stream", { ...p, id: await asNetEase(p.id) });
export const lyrics = async (p: Params) => platforms.call("ne", "lyrics", { ...p, id: await asNetEase(p.id) });
export const comments = async (p: Params) =>
  platforms.call("ne", "comments", { ...p, trackId: await asNetEase(p.trackId) });
export const likeComment = async (p: Params) =>
  platforms.call("ne", "likeComment", { ...p, trackId: await asNetEase(p.trackId) });
export const postComment = async (p: Params) =>
  platforms.call("ne", "postComment", { ...p, trackId: await asNetEase(p.trackId) });

export async function played({ id }: { id: string }) {
  if (platformOf(id) === "ne") await platforms.call("ne", "played", { id });
}

// Songs of one platform added to the other's playlist go as the same songs
// there. Those it can't find are left out, and said so.
export async function addToPlaylist({ id, trackIds }: { id: string; trackIds: string[] }) {
  const to = platformOf(id);
  const own = trackIds.filter((x) => platformOf(x) === to);
  const others = trackIds.filter((x) => platformOf(x) !== to);
  let found: string[] = [];
  if (others.length) {
    if (to === "sp") {
      const theirs = others.filter((x) => platformOf(x) === "ne").map((x) => untag("ne", x));
      found = (await onSpotify(theirs)).filter((x): x is string => !!x).map((x) => tag("sp", x));
    } else if (to === "ne") {
      for (const x of others.filter((x) => platformOf(x) === "sp")) {
        const n = await onNetEase(untag("sp", x));
        if (n) found.push(tag("ne", n));
      }
    }
  }
  const all = [...own, ...found];
  if (all.length) await platforms.call(to, "addToPlaylist", { id, trackIds: all });
  const missing = trackIds.length - all.length;
  if (missing) {
    const where = to === "sp" ? "Spotify" : t("NetEase Cloud Music");
    throw new Error(t("Added {added}; {missing} couldn't be found on {where}", { added: all.length, missing, where }));
  }
}

// Everything else that names a song, album, artist, playlist or page goes to
// the platform it's of.
export const browse = platforms.byID("browse");
export const album = platforms.byID("album");
export const artist = platforms.byID("artist");
export const followArtist = platforms.byID("followArtist");
export const saveAlbum = platforms.byID("saveAlbum");
export const playlist = platforms.byID("playlist");
export const savePlaylist = platforms.byID("savePlaylist");
export const renamePlaylist = platforms.byID("renamePlaylist");
export const deletePlaylist = platforms.byID("deletePlaylist");
export const removeFromPlaylist = platforms.byID("removeFromPlaylist");
export const movePlaylistTrack = platforms.byID("movePlaylistTrack");
export const like = platforms.byID("like");
export const likeEpisode = platforms.byID("likeEpisode");
export const show = platforms.byID("show");
export const subscribeShow = platforms.byID("subscribeShow");
export const stationNext = platforms.byID("stationNext");
