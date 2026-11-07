// SPDX-FileCopyrightText: 2026 Kaede Akino
// SPDX-FileCopyrightText: 2026 deepfry666 (several plugins, merged locales)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Builds each plugin into dist/<name>/: one self-contained JavaScript module,
// as MyGo Music loads it, with its plugin.json, translations and licence.
//
//   dist/netease/  the NetEase package alone, which its tests run on
//   dist/duet/     Duet (NetEase + Spotify), to install

import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

interface Target {
  name: string;
  entry: string;
  manifest: string;
  locales: string[]; // merged in order, later ones winning
  define?: Record<string, string>;
  exports?: string; // a JSON list the bundle's exports must match
}

const targets: Target[] = [
  {
    name: "netease",
    entry: "packages/netease/src/index.ts",
    manifest: "packages/netease/plugin.json",
    locales: ["packages/netease/locales/zh-CN.json"],
    exports: "packages/netease/tests/fixtures/exports.json",
  },
  {
    name: "duet",
    entry: "plugins/duet/src/index.ts",
    manifest: "plugins/duet/plugin.json",
    locales: ["packages/netease/locales/zh-CN.json", "plugins/duet/locales/zh-CN.json"],
    define: { __NETEASE_NS__: JSON.stringify("ne.") },
  },
];

async function buildTarget(t: Target) {
  const dir = resolve(root, "dist", t.name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(resolve(dir, "locales"), { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: [t.entry],
    outfile: resolve(dir, "index.js"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: false,
    metafile: true,
    legalComments: "inline",
    define: t.define,
    banner: { js: "// SPDX-License-Identifier: AGPL-3.0-or-later\n// Source: see NOTICE.md" },
  });
  const outputs = Object.values(result.metafile.outputs);
  if (outputs.length !== 1 || outputs[0].imports.length !== 0) {
    throw new Error(`${t.name}: the plugin must be a single self-contained module`);
  }
  const exported = [...outputs[0].exports].sort();
  if (t.exports) {
    const expected = JSON.parse(await readFile(resolve(root, t.exports), "utf8"));
    if (JSON.stringify(exported) !== JSON.stringify(expected)) {
      throw new Error(`${t.name}: exports differ from ${t.exports}`);
    }
  }
  const locale: Record<string, string> = {};
  for (const file of t.locales) Object.assign(locale, JSON.parse(await readFile(resolve(root, file), "utf8")));
  await writeFile(resolve(dir, "locales/zh-CN.json"), JSON.stringify(locale, null, 2) + "\n");
  await copyFile(resolve(root, t.manifest), resolve(dir, "plugin.json"));
  for (const file of ["LICENSE", "NOTICE.md"]) await copyFile(resolve(root, file), resolve(dir, file));
  console.log(`built dist/${t.name} (${exported.length} exports)`);
  return exported;
}

for (const t of targets) await buildTarget(t);
