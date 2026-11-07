// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// Spotify keeps what it stores, and reads its settings, under "sp.", apart from
// the other platforms of the plugin.

export const storage = {
  get: <T>(key: string): T | undefined => host.storage.get(`sp.${key}`) as T | undefined,
  set: (key: string, value: unknown) => host.storage.set(`sp.${key}`, value),
  remove: (key: string) => host.storage.remove(`sp.${key}`),
};

export const setting = (key: string) => (host.setting(`sp.${key}`) || "").trim();

export const t = (text: string, values?: Record<string, unknown>) =>
  host.t(text).replace(/\{(\w+)\}/g, (token, key) => (values && key in values ? String(values[key]) : token));

export function fail(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}
