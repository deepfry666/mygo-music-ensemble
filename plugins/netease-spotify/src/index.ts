// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// NetEase Cloud Music and Spotify in one plugin, side by side: each keeps its
// own playlists, picks and likes, and a song plays from where it came from.
// IDs and pages carry their platform ("ne:", "sp:"), see packages/core.
//
// Stage 1: NetEase only. Spotify joins as "sp" in stage 2.

import { Platforms, platformOf, tag, untag } from "../../../packages/core/src/namespace.ts";
import * as netease from "../../../packages/netease/src/index.ts";

const platforms = new Platforms({ ne: netease });

// The platform for what isn't of any one song or page: new playlists, the
// paged lists and Home, until there's more than one to choose from.
const main = "ne";

// everyone asks each platform that can, and puts their lists together.
async function everyone(name: string, params?: Record<string, unknown>) {
  const lists = await Promise.all(
    platforms
      .names()
      .filter((p) => platforms.can(p, name))
      .map((p) => platforms.call(p, name, params) as Promise<unknown[]>),
  );
  return lists.flat();
}

const onMain = (name: string) => (params?: Record<string, unknown>) =>
  platforms.call(main, name, params);

// Accounts. Stage 2 signs in to each platform that isn't yet, in turn.
export const account = onMain("account");
export const signIn = onMain("signIn");
export async function signOut() {
  for (const p of platforms.names()) if (platforms.can(p, "signOut")) await platforms.get(p).signOut!();
}

// Settings are kept as "<platform>.<key>", as plugin.json names them.
export function setSetting({ key, value }: { key: string; value: string }) {
  const [platform, ...rest] = key.split(".");
  if (!rest.length || !platforms.can(platform, "setSetting")) return;
  return platforms.get(platform).setSetting!({ key: rest.join("."), value });
}

// Pages and what isn't of one song.
export const home = onMain("home");
export const search = onMain("search");
export const suggest = onMain("suggest");
export const recent = onMain("recent");
export const liked = onMain("liked");
export const savedAlbums = onMain("savedAlbums");
export const createPlaylist = onMain("createPlaylist");
export const playlists = () => everyone("playlists");
export const shows = () => everyone("shows");
export const stations = () => everyone("stations");

export async function isLiked({ ids }: { ids: string[] }) {
  const byPlatform = new Map<string, string[]>();
  for (const id of ids) {
    const p = platformOf(id);
    if (platforms.can(p, "isLiked")) byPlatform.set(p, [...(byPlatform.get(p) ?? []), id]);
  }
  const answer: Record<string, boolean> = {};
  for (const [p, some] of byPlatform) {
    const liked = (await platforms.get(p).isLiked!({ ids: some.map((id) => untag(p, id)) })) as Record<
      string,
      boolean
    >;
    for (const [id, on] of Object.entries(liked)) answer[tag(p, id)] = on;
  }
  return answer;
}

// Everything that names a song, album, artist, playlist, show, station or
// page goes to the platform it's of.
export const browse = platforms.byID("browse");
export const album = platforms.byID("album");
export const artist = platforms.byID("artist");
export const followArtist = platforms.byID("followArtist");
export const saveAlbum = platforms.byID("saveAlbum");
export const playlist = platforms.byID("playlist");
export const savePlaylist = platforms.byID("savePlaylist");
export const renamePlaylist = platforms.byID("renamePlaylist");
export const deletePlaylist = platforms.byID("deletePlaylist");
export const addToPlaylist = platforms.byID("addToPlaylist");
export const removeFromPlaylist = platforms.byID("removeFromPlaylist");
export const movePlaylistTrack = platforms.byID("movePlaylistTrack");
export const like = platforms.byID("like");
export const likeEpisode = platforms.byID("likeEpisode");
export const played = platforms.byID("played");
export const show = platforms.byID("show");
export const subscribeShow = platforms.byID("subscribeShow");
export const stationNext = platforms.byID("stationNext");
export const comments = platforms.byID("comments");
export const likeComment = platforms.byID("likeComment");
export const postComment = platforms.byID("postComment");
export const lyrics = platforms.byID("lyrics");
export const stream = platforms.byID("stream");
