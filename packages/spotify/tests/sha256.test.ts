// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { base64url, sha256 } from "../src/sha256.ts";

test("sha256 agrees with Node's at every padding boundary", () => {
  for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
    assert.equal(Buffer.from(sha256(data)).toString("hex"), createHash("sha256").update(data).digest("hex"), `${n} bytes`);
  }
});

test("base64url has no padding and URL-safe letters", () => {
  for (const n of [1, 2, 3, 31, 32, 33]) {
    const data = new Uint8Array(n).map((_, i) => (i * 97 + 250) & 255);
    assert.equal(base64url(data), Buffer.from(data).toString("base64url"), `${n} bytes`);
  }
});
