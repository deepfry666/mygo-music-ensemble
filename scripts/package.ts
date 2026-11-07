// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// Packs dist/duet into dist/release/duet.zip, with plugin.json at the top of
// the zip, for a GitHub release: MyGo Music installs a repository from the zip
// asset of its latest release that names no platform, and the source of this
// repository, with several packages and no plugin.json at its top, isn't one.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const plugin = resolve(root, "dist/duet");
const out = resolve(root, "dist/release/duet.zip");

const manifest = JSON.parse(await readFile(resolve(plugin, "plugin.json"), "utf8"));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
if (manifest.version !== pkg.version) {
  throw new Error(`plugin.json is ${manifest.version} but package.json is ${pkg.version}`);
}

await mkdir(resolve(root, "dist/release"), { recursive: true });
await rm(out, { force: true });
execFileSync("zip", ["-r", "-X", "-q", out, "."], { cwd: plugin, stdio: "inherit" });
const listing = execFileSync("unzip", ["-Z1", out], { encoding: "utf8" }).trim().split("\n");
for (const file of ["plugin.json", "index.js", "locales/zh-CN.json", "LICENSE", "NOTICE.md"]) {
  if (!listing.includes(file)) throw new Error(`${file} is missing from the zip`);
}
console.log(`packed dist/release/duet.zip (Duet ${manifest.version}, ${listing.length} entries)`);
