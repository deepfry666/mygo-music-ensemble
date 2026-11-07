// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// What Spotify answers, as MyGo Music has it. IDs are Spotify's own; the
// plugin tags them "sp:".

import { storage } from "./env.ts";

export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
}
export interface Album {
  id: string;
  name: string;
  imageUrl?: string;
  artists?: Artist[];
  released?: string;
  saved?: boolean;
}
export interface Track {
  id: string;
  name: string;
  artists: Artist[];
  album: Album;
  duration: number;
  url?: string;
  unavailable?: boolean;
}
export interface Playlist {
  id: string;
  name: string;
  imageUrl?: string;
  description?: string;
  owner?: string;
  trackCount?: number;
  mine?: boolean;
  fixed?: boolean;
  saved?: boolean;
  tracks?: Track[];
}

type Image = { url: string; width?: number | null };

// imageOf picks the smallest picture at least 300 across, or the largest:
// the app decodes the whole of each one it shows.
export function imageOf(images?: Image[] | null) {
  if (!images?.length) return undefined;
  const sized = images.filter((i) => (i.width ?? 0) >= 300).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sized[0] ?? images[0]).url;
}

export const artistsOf = (list?: any[]): Artist[] =>
  (list || []).map((a) => ({ id: a.id || "", name: a.name || "" }));

export const artistOf = (a: any): Artist | null =>
  a?.id ? { id: a.id, name: a.name, imageUrl: imageOf(a.images) } : null;

export function albumOf(a: any): Album | null {
  if (!a?.id) return null;
  return {
    id: a.id,
    name: a.name,
    imageUrl: imageOf(a.images),
    artists: artistsOf(a.artists),
    released: a.release_date,
  };
}

// What's known of the tracks shown lately, so playing one needn't ask
// Spotify again what it is.
const known = new Map<string, Track>();

export function trackOf(t: any, album?: any): Track | null {
  if (!t?.id || t.type === "episode") return null;
  const track: Track = {
    id: t.id,
    name: t.name,
    artists: artistsOf(t.artists),
    album: albumOf(album || t.album) || { id: "", name: "" },
    duration: t.duration_ms ?? 0,
    url: t.external_urls?.spotify,
    unavailable: t.is_playable === false || undefined,
  };
  if (known.size > 5000) known.clear();
  known.set(track.id, track);
  return track;
}

export const knownTrack = (id: string) => known.get(id);

export function playlistOf(p: any): Playlist | null {
  if (!p?.id) return null;
  const mine = p.owner?.id === storage.get<{ id: string }>("me")?.id || p.collaborative;
  return {
    id: p.id,
    name: p.name,
    imageUrl: imageOf(p.images),
    description: p.description || undefined,
    owner: p.owner?.display_name || p.owner?.id,
    trackCount: (p.items || p.tracks)?.total,
    mine: mine || undefined,
    saved: mine ? undefined : true,
  };
}

export const unique = <T extends { id: string }>(list: T[]) => [...new Map(list.map((x) => [x.id, x])).values()];
