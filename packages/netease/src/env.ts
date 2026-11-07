// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// What this package keeps in host storage and reads from the plugin's settings,
// under a prefix of its own when it shares one plugin with other platforms, so
// their keys can't collide. The prefix is fixed at build time: empty for the
// standalone NetEase build, "ne." inside the NetEase + Spotify plugin.
declare const __NETEASE_NS__: string | undefined;
const ns = typeof __NETEASE_NS__ === "string" ? __NETEASE_NS__ : "";

export const storage = {
  get: (key: string): unknown => host.storage.get(ns + key),
  set: (key: string, value: unknown) => host.storage.set(ns + key, value),
  remove: (key: string) => host.storage.remove(ns + key),
};

export const setting = (key: string) => host.setting(ns + key);
