// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import test from "node:test";
import { bareTitle, best, queries, type Song } from "../src/match.ts";

const song = (id: string, name: string, artist: string, seconds: number, unavailable = false): Song => ({
  id,
  name,
  artists: [{ name: artist }],
  duration: seconds * 1000,
  unavailable,
});

test("the original is chosen over covers, live and instrumental recordings", () => {
  const target = song("sp", "晴天", "周杰倫", 269);
  const found = best(target, [
    song("cover", "晴天 (原唱 周杰伦)", "RyaVocal", 270),
    song("live", "晴天 (Live)", "周杰伦", 300),
    song("inst", "晴天 (伴奏)", "周杰伦", 269),
    song("orig", "晴天", "周杰伦", 269),
  ]);
  assert.equal(found?.song.id, "orig");
});

test("a title that matches with the same length is enough, whatever the artist is written as", () => {
  const found = best(song("sp", "晴天", "Jay Chou", 269), [song("ne", "晴天", "周杰伦", 270)]);
  assert.equal(found?.song.id, "ne");
});

test("remaster suffixes and featured artists don't stand in the way", () => {
  assert.equal(bareTitle("Yesterday - Remastered 2009"), "yesterday");
  assert.equal(bareTitle("Stay (with Justin Bieber)"), "stay");
  assert.equal(bareTitle("Ｈｅｌｌｏ， World!"), "helloworld");
  const found = best(song("ne", "Yesterday", "The Beatles", 125), [
    song("sp", "Yesterday - Remastered 2009", "The Beatles", 125),
  ]);
  assert.equal(found?.song.id, "sp");
});

test("nothing is chosen when nothing is the song", () => {
  const target = song("sp", "晴天", "周杰伦", 269);
  assert.equal(best(target, [song("x", "雨天", "孙燕姿", 269)]), null);
  assert.equal(best(target, [song("y", "晴天", "周杰伦", 400)]), null);
  assert.equal(best(target, [song("z", "晴天 (原唱 周杰伦)", "Someone", 270)]), null);
});

test("a playable match is preferred to one that can't be played", () => {
  const target = song("sp", "七里香", "周杰伦", 299);
  const found = best(target, [song("a", "七里香", "周杰伦", 299, true), song("b", "七里香", "周杰伦", 300)]);
  assert.equal(found?.song.id, "b");
});

test("queries try the title with its first artist, then the title alone", () => {
  assert.deepEqual(queries(song("x", "Yesterday - Remastered 2009", "The Beatles", 1)), [
    "Yesterday The Beatles",
    "Yesterday",
  ]);
});
