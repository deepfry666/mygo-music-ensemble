// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// The same song on the other platform: a Spotify song to play from NetEase,
// and either's song to add to the other's playlist. What's found is kept, and
// so is what isn't, for a week, as a search is slower than a lookup.

import { best, queries, type Song } from "../../../packages/match/src/match.ts";
import { details } from "../../../packages/netease/src/tracks.ts";
import * as netease from "../../../packages/netease/src/index.ts";
import { searchTracks, trackInfo } from "../../../packages/spotify/src/lookup.ts";

const MISS_FOR = 7 * 24 * 3600_000;

interface Kept {
  to: string | null; // the untagged ID on the other platform
  at: number;
}

const key = (from: string, id: string) => `duet.match.${from}:${id}`;

function kept(from: string, id: string): Kept | undefined {
  const k = host.storage.get(key(from, id)) as Kept | undefined;
  if (!k) return undefined;
  if (k.to === null && Date.now() - k.at > MISS_FOR) return undefined;
  return k;
}

function keep(from: string, id: string, to: string | null) {
  host.storage.set(key(from, id), { to, at: Date.now() } satisfies Kept);
}

async function find(target: Song, search: (q: string) => Promise<Song[]>) {
  for (const q of queries(target)) {
    const found = best(target, await search(q));
    if (found) return found.song.id;
  }
  return null;
}

const searchNetEase = async (q: string) =>
  ((await netease.search({ query: q, kind: "tracks", offset: 0 })) as { tracks?: Song[] }).tracks ?? [];

// onNetEase answers the NetEase song a Spotify song is, by their IDs without
// prefixes, or null.
export async function onNetEase(spotifyID: string) {
  const k = kept("sp", spotifyID);
  if (k) return k.to;
  const to = await find(await trackInfo(spotifyID), searchNetEase);
  keep("sp", spotifyID, to);
  return to;
}

// onSpotify answers the Spotify songs NetEase songs are, null for those it
// didn't find.
export async function onSpotify(neteaseIDs: string[]) {
  const out = new Map<string, string | null>();
  const unknown = neteaseIDs.filter((id) => {
    const k = kept("ne", id);
    if (k) out.set(id, k.to);
    return !k;
  });
  if (unknown.length) {
    for (const song of (await details(unknown)) as Song[]) {
      const to = await find(song, searchTracks);
      keep("ne", song.id, to);
      out.set(song.id, to);
    }
  }
  return neteaseIDs.map((id) => out.get(id) ?? null);
}
