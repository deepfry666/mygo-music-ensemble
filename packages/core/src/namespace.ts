// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// One plugin, several platforms. Every ID and page the app sees carries the
// platform it came from, "ne:123" or "sp:4uLU6hMC", so a call that names one
// goes back to that platform, with the prefix taken off again. A platform's
// own code never sees a prefix.

export type Platform = string;
// A platform's exports, as its package defines them.
export type Exports = Record<string, ((params?: any) => unknown) | undefined>;

// The fields of what platforms answer that hold an ID or a page, at any depth:
// tracks, albums, artists, playlists, shows, stations, links, comments,
// sections' morePage, shows' publisherPage and accounts' page.
const tagged = new Set(["id", "showId", "page", "morePage", "publisherPage", "trackId"]);
// The parameters the app passes that name one, or a list of them.
const one = ["id", "trackId", "commentId", "page"];
const many = ["ids", "trackIds"];

export function fail(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

export function tag(platform: Platform, value: string) {
  return value ? `${platform}:${value}` : value;
}

// platformOf is the platform an ID or page names, or "" for none.
export function platformOf(value: unknown) {
  return /^([a-z]+):/.exec(String(value ?? ""))?.[1] ?? "";
}

export function untag(platform: Platform, value: unknown) {
  const text = String(value ?? "");
  if (!text.startsWith(`${platform}:`)) throw fail("unavailable", `Not of ${platform}: ${text}`);
  return text.slice(platform.length + 1);
}

// tagDeep marks every ID and page in what a platform answered as its own.
export function tagDeep<T>(platform: Platform, value: T): T {
  if (Array.isArray(value)) return value.map((v) => tagDeep(platform, v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = tagged.has(key) && typeof v === "string" ? tag(platform, v) : tagDeep(platform, v);
    }
    return out as T;
  }
  return value;
}

// untagParams takes the platform's prefix off what the app asks with.
export function untagParams(platform: Platform, params: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ...params };
  for (const key of one) if (key in out) out[key] = untag(platform, out[key]);
  for (const key of many) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map((v) => untag(platform, v));
  }
  return out;
}

// The parameter that says which platform a call is for.
function subject(params: Record<string, unknown> = {}) {
  for (const key of ["id", "trackId", "page"]) if (key in params) return params[key];
  for (const key of many) if (Array.isArray(params[key])) return (params[key] as unknown[])[0];
  return undefined;
}

export class Platforms {
  constructor(private readonly all: Record<Platform, Exports>) {}

  names() {
    return Object.keys(this.all);
  }

  get(platform: Platform) {
    const exports = this.all[platform];
    if (!exports) throw fail("unavailable", `No such platform: ${platform}`);
    return exports;
  }

  can(platform: Platform, name: string) {
    return typeof this.all[platform]?.[name] === "function";
  }

  // call runs name on platform with params as the app gave them, and answers
  // what it did as the app should see it.
  async call(platform: Platform, name: string, params?: Record<string, unknown>) {
    const fn = this.get(platform)[name];
    if (typeof fn !== "function") throw fail("unsupported", `${platform} can't ${name}`);
    return tagDeep(platform, await fn(untagParams(platform, params)));
  }

  // byID makes an export that goes to the platform the call's ID names.
  byID(name: string) {
    return (params: Record<string, unknown> = {}) =>
      this.call(platformOf(subject(params)), name, params);
  }
}
