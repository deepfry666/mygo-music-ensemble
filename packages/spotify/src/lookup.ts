// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// What the plugin asks Spotify to find a song on another platform, or one of
// another platform's songs on Spotify. Not plugin exports.

import { call, type Paging } from "./api.ts";
import { knownTrack, trackOf, type Track } from "./models.ts";

export async function trackInfo(id: string): Promise<Track> {
  return knownTrack(id) ?? trackOf(await call("GET", `/tracks/${id}`))!;
}

export async function searchTracks(q: string): Promise<Track[]> {
  const r = await call<{ tracks?: Paging<any> }>("GET", "/search", { query: { q, type: "track", limit: 10 } });
  return (r.tracks?.items || []).map((x) => trackOf(x)).filter((x): x is Track => !!x);
}
