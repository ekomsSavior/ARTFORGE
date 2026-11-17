import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync, crc32 } from "node:zlib";
import {
  sanitizeRaster,
  embeddedImageBlob,
  checkMediaFile,
  checkDimensions,
  safeImage,
} from "../web/media-safety.mjs";
import { validateLayer } from "../web/layers.mjs";
import { createHandler, CSP } from "../hosting/handler.mjs";
const fixture = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(new URL("fixtures/raster.json", import.meta.url))),
  ).map(([k, v]) => [k, Buffer.from(v, "base64")]),
);

for (const [kind, original] of Object.entries(fixture)) {
  test(`${kind}: real pixels survive, metadata and appended payload bytes do not`, () => {
    const input = Buffer.concat([
      original,
      Buffer.from("<script>TRAILING_PAYLOAD</script>PK\x03\x04"),
    ]);
    const result = sanitizeRaster(input);
    assert.equal(result.width, 24);
    assert.equal(result.height, 18);
    assert.ok(!Buffer.from(result.bytes).includes("PAYLOAD_MARKER"));
    assert.ok(!Buffer.from(result.bytes).includes("TRAILING_PAYLOAD"));
    assert.deepEqual(sanitizeRaster(result.bytes).bytes, result.bytes);
  });
}
test("SVG/HTML, executable signatures, XML entities and filenames cannot select a decoder", () => {
  for (const content of [
    '<svg onload="alert(1)"><script>1</script></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    '<html><img onerror="1" src="x"></html>',
    "MZ\0\0fake.png",
    "%PDF-1.7",
  ])
    assert.throws(() => sanitizeRaster(Buffer.from(content)), /raster/);
});
test("PNG validates chunk length/checksum and rejects huge dimensions before decoding", () => {
  const corrupt = Buffer.from(fixture.png);
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => sanitizeRaster(corrupt));
  const huge = Buffer.from(fixture.png);
  huge.writeUInt32BE(0x7fffffff, 16);
  huge.writeUInt32BE(crc32(huge.subarray(12, 29)), 29);
  assert.throws(() => sanitizeRaster(huge), /megapixel/);
  const length = Buffer.from(fixture.png);
  length.writeUInt32BE(0xffffffff, 8);
  assert.throws(() => sanitizeRaster(length));
});
test("Truncated raster headers and invalid dimensions are rejected", () => {
  for (const b of Object.values(fixture))
    for (const n of [0, 1, 2, 7, 12])
      assert.throws(() => sanitizeRaster(b.subarray(0, n)));
  for (const [w, h] of [
    [0, 20],
    [8193, 1],
    [8000, 8000],
    [NaN, 10],
    [1.5, 2],
  ])
    assert.throws(() => checkDimensions(w, h));
});
test("GIF imports only one frame and WebP animation is explicitly rejected", () => {
  const gif = sanitizeRaster(fixture.gif).bytes;
  assert.equal(gif.at(-1), 0x3b);
  assert.ok(gif.length < fixture.gif.length);
  const animated = Buffer.from(fixture.webp);
  assert.equal(animated.toString("ascii", 12, 16), "VP8X");
  animated[20] |= 2;
  assert.throws(() => sanitizeRaster(animated), /Animated/);
});
test("JPEG keeps reconstructed orientation while discarding original EXIF text", () => {
  const result = Buffer.from(sanitizeRaster(fixture.jpeg).bytes);
  assert.ok(result.includes(Buffer.from("Exif\0\0")));
  assert.ok(!result.includes("PAYLOAD_MARKER"));
  assert.equal(result[30], 6);
});
test("Embedded project images reject URLs, SVG, invalid padding and oversized strings", async () => {
  for (const value of [
    "https://attacker.invalid/x.png",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/png;base64,AAAA===",
    "data:image/png;base64,AAA",
    "data:image/png;base64," + "A".repeat(12000000),
  ])
    assert.throws(() => embeddedImageBlob(value));
  const blob = embeddedImageBlob(
    "data:image/png;base64," + fixture.png.toString("base64"),
  );
  assert.equal(sanitizeRaster(await blob.arrayBuffer()).mime, "image/png");
  const spoof = embeddedImageBlob(
    "data:image/png;base64," +
      Buffer.from('<svg onload="1"/>').toString("base64"),
  );
  await assert.rejects(safeImage(spoof), /raster/);
});
test("Size limits run before reading a file into memory", async () => {
  const file = {
    size: 300000000,
    arrayBuffer() {
      throw new Error("Must not read");
    },
    slice() {
      throw new Error("Must not read");
    },
  };
  await assert.rejects(safeImage(file), /24 MB/);
  await assert.rejects(checkMediaFile(file), /200 MB/);
  await assert.rejects(checkMediaFile(file, "audio"), /50 MB/);
});
test("Video import rejects playlists and renamed scripts regardless of MIME", async () => {
  for (const text of [
    "#EXTM3U\nhttps://attacker.invalid/track",
    '<svg onload="1"/>',
    "<script>1</script>",
  ])
    await assert.rejects(
      checkMediaFile(new Blob([text], { type: "video/mp4" })),
      /real MP4/,
    );
});
test("Layer validation keeps markup as literal text and does not merge prototypes", () => {
  const value = JSON.parse(
    '{"type":"text","text":"<img src=x onerror=alert(1)>","__proto__":{"polluted":true}}',
  );
  const layer = validateLayer(value);
  assert.equal(layer.text, value.text);
  assert.equal(layer.polluted, undefined);
  assert.equal({}.polluted, undefined);
  assert.throws(() =>
    validateLayer({ type: "text", filters: JSON.parse('{"__proto__":1}') }),
  );
});
const worker = createHandler({
  "/index.html": {
    type: "text/html",
    data: gzipSync("<!doctype html><p>ARTFORGE</p>").toString("base64"),
    etag: '"sample"',
  },
});
test("Host serves only known static assets, with strict browser headers", async () => {
  const r = await worker.fetch(new Request("https://artforge.test/"));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /ARTFORGE/);
  assert.equal(r.headers.get("Content-Security-Policy"), CSP);
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(r.headers.get("X-Frame-Options"), "DENY");
  assert.match(CSP, /connect-src 'none'/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.doesNotMatch(CSP, /'unsafe-inline'|'unsafe-eval'/);
});
test("There is no server upload, URL proxy, traversal, or reflected error response", async () => {
  for (const path of [
    "/api/upload",
    "/.git/config",
    "/%2e%2e/secret",
    "/?url=https://attacker.invalid",
  ]) {
    const r = await worker.fetch(
      new Request("https://artforge.test" + path, {
        method: "POST",
        body: "<script>payload</script>",
      }),
    );
    assert.equal(r.status, 405);
    assert.doesNotMatch(await r.text(), /payload/);
  }
  for (const path of [
    "/__proto__",
    "/constructor",
    "/%3Cscript%3E",
    "/does-not-exist",
  ]) {
    const r = await worker.fetch(new Request("https://artforge.test" + path));
    assert.equal(r.status, 404);
    assert.equal(await r.text(), "Not found");
  }
});
test("HEAD and conditional responses retain hardening headers", async () => {
  const head = await worker.fetch(
    new Request("https://artforge.test/", { method: "HEAD" }),
  );
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("X-Frame-Options"), "DENY");
  const cached = await worker.fetch(
    new Request("https://artforge.test/", {
      headers: { "If-None-Match": '"sample"' },
    }),
  );
  assert.equal(cached.status, 304);
  assert.equal(cached.headers.get("Content-Security-Policy"), CSP);
});
