import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = resolve("web"),
  assets = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
async function walk(dir, prefix = "") {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const path = `${dir}/${entry.name}`,
      name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await walk(path, name);
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      assets[name] = {
        type: types[extname(path)] || "text/plain; charset=utf-8",
        data: gzipSync(bytes, { level: 9 }).toString("base64"),
        etag: '"' + createHash("sha256").update(bytes).digest("hex") + '"',
      };
    }
  }
}
await walk(root);
const handler = (await readFile("hosting/handler.mjs", "utf8")).replaceAll(
  "export ",
  "",
);
const output = resolve(process.argv[2] || "dist/server/index.js");
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `${handler}\nconst assets = ${JSON.stringify(assets)};\nexport default createHandler(assets);\n`,
);
console.log(
  `Built ${Object.keys(assets).length} static assets with security headers.`,
);
