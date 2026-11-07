// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// Finding a song of one platform among another's search results: by its
// title, its artists and its length, and not by a cover, a live recording or
// an instrumental of it when it isn't one.

export interface Song {
  id: string;
  name: string;
  artists: { name: string }[];
  duration: number; // milliseconds
  unavailable?: boolean;
}

// The kinds of recording that are another song, as a match goes.
const VERSIONS: [string, RegExp][] = [
  ["live", /\blive\b|现场|現場|演唱会|演唱會|音乐会/i],
  ["instrumental", /instrumental|伴奏|纯音乐|純音樂|off ?vocal|karaoke|卡拉ok/i],
  ["remix", /\bremix\b|\bdj\b|混音|重混/i],
  ["cover", /\bcover\b|翻唱|原唱|翻自/i],
  ["acoustic", /acoustic|不插电|不插電/i],
  ["sped", /sped ?up|slowed|加速版|降速版|0\.8x|1\.2x/i],
  ["demo", /\bdemo\b/i],
];

export function versions(text: string) {
  return new Set(VERSIONS.filter(([, re]) => re.test(text)).map(([name]) => name));
}

// The title without what says which recording it is: brackets, and what
// follows " - ", as in "Yesterday - Remastered 2009".
export function bareTitle(name: string) {
  return normalize(
    name
      .replace(/[(（[【〔<《].*?[)）\]】〕>》]/g, " ")
      .replace(/\s[-–—]\s.*$/, " ")
      .replace(/\b(feat|ft)\.?\s.*$/i, " "),
  );
}

export function normalize(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigrams(text: string) {
  const out = new Map<string, number>();
  const chars = [...text];
  if (chars.length < 2) out.set(text, 1);
  for (let i = 0; i < chars.length - 1; i++) {
    const g = chars[i] + chars[i + 1];
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

// dice is how much of two texts' letter pairs they share, 0 to 1.
export function dice(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  let shared = 0;
  for (const [g, n] of x) shared += Math.min(n, y.get(g) ?? 0);
  const total = [...x.values()].reduce((s, n) => s + n, 0) + [...y.values()].reduce((s, n) => s + n, 0);
  return (2 * shared) / total;
}

export interface Scored<T extends Song> {
  song: T;
  score: number;
}

// score says how likely candidate is target, the higher the likelier; below
// ACCEPT, it isn't.
export function score(target: Song, candidate: Song) {
  const a = bareTitle(target.name);
  const b = bareTitle(candidate.name);
  let s = 0;
  const title = dice(a, b);
  if (a === b) s += 50;
  else if (a && b && (a.includes(b) || b.includes(a))) s += 30;
  else if (title >= 0.6) s += Math.round(40 * title);
  else return -Infinity;

  const want = versions(target.name);
  const got = versions(candidate.name);
  for (const v of new Set([...want, ...got])) if (want.has(v) !== got.has(v)) s -= 40;

  const names = (song: Song) => song.artists.map((x) => normalize(x.name)).filter(Boolean);
  const theirs = names(candidate);
  const shared = names(target).some((n) => theirs.some((m) => m === n || (n.length > 1 && (m.includes(n) || n.includes(m)))));
  if (shared) s += 30;

  if (target.duration > 0 && candidate.duration > 0) {
    const off = Math.abs(target.duration - candidate.duration) / 1000;
    if (off <= 2) s += 30;
    else if (off <= 5) s += 20;
    else if (off <= 10) s += 5;
    else if (off <= 30) s -= 30;
    else return -Infinity;
  }
  if (candidate.unavailable) s -= 25;
  return s;
}

export const ACCEPT = 60;

// best is the candidate most likely target, if any is likely enough.
export function best<T extends Song>(target: Song, candidates: T[]): Scored<T> | null {
  let top: Scored<T> | null = null;
  for (const song of candidates) {
    const s = score(target, song);
    if (s >= ACCEPT && (!top || s > top.score)) top = { song, score: s };
  }
  return top;
}

// queries are what to search for target with, most precise first.
export function queries(target: Song) {
  const title = target.name.replace(/\s[-–—]\s.*$/, "").trim();
  const artist = target.artists[0]?.name ?? "";
  return [...new Set([artist ? `${title} ${artist}` : title, title])];
}
