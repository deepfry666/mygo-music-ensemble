// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

import { accessToken, endSession } from "./auth.ts";
import { fail, t } from "./env.ts";

const API = "https://api.spotify.com/v1";

export interface Paging<T> {
  items: T[];
  next: string | null;
  total?: number;
}

type Query = Record<string, string | number | undefined>;

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "",
  ) {
    super(message);
  }
}

// call asks the Web API, signed in, and answers its JSON, or null for none.
export async function call<T = any>(
  method: string,
  path: string,
  { query, body }: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const url = new URL(path.startsWith("https://") ? path : API + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined) url.searchParams.set(k, String(v));
  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await accessToken(attempt > 0)}`,
      // Names as the listener reads them, such as 周杰倫 for Jay Chou.
      "accept-language": host.language() === "zh-CN" ? "zh-CN,zh;q=0.9,en;q=0.8" : "en",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    res = await fetch(url.href, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status !== 401) break;
  }
  if (res!.status === 401) {
    endSession();
    throw fail("signIn", t("Your Spotify session has ended: sign in again"));
  }
  const text = await res!.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Some writes answer plain text, which says no more than the status.
  }
  if (!res!.ok) {
    const message = data?.error?.message;
    if (res!.status === 429) {
      throw new SpotifyError(t("Spotify is limiting requests: try again in a moment"), 429);
    }
    if (res!.status === 403) {
      throw new SpotifyError(message ? `Spotify: ${message}` : t("Spotify refused this"), 403, "unavailable");
    }
    if (res!.status === 404) {
      throw new SpotifyError(t("Spotify doesn't have this, or won't show it to this app"), 404, "unavailable");
    }
    throw new SpotifyError(message ? `Spotify: ${message}` : `Spotify ${url.pathname}: ${res!.status}`, res!.status);
  }
  return data as T;
}

// pages follows a paging object to the end, or for at most `atMost` pages.
export async function pages<T, R>(
  path: string,
  query: Query,
  pick: (item: T) => R | null | undefined,
  atMost: number,
) {
  const out: R[] = [];
  let next: string | null = path;
  for (let i = 0; next && i < atMost; i++) {
    const page: Paging<T> = await call("GET", next, i === 0 ? { query } : {});
    for (const item of page.items) {
      const r = pick(item);
      if (r) out.push(r);
    }
    next = page.next;
  }
  return out;
}
