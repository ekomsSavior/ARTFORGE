import { test } from "node:test";
import assert from "node:assert/strict";
import { BLEND_MODES, blendColor, composite } from "../web/blend.mjs";
import { validateLayer, validateStyle, motionOffset } from "../web/layers.mjs";
const px = (v) => new Uint8ClampedArray(v);
const near = (a, b) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${v} != ${b[i]}`));
test("every requested blend has finite bounded output at black, white and color extremes", () => {
  assert.equal(BLEND_MODES.length, 24);
  for (const mode of BLEND_MODES)
    for (const b of [
      [0, 0, 0],
      [1, 1, 1],
      [0.2, 0.5, 0.8],
    ])
      for (const s of [
        [0, 0, 0],
        [1, 1, 1],
        [0.8, 0.1, 0.3],
      ]) {
        const c = blendColor(b, s, mode);
        assert.equal(c.length, 3);
        assert.ok(
          c.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
          mode,
        );
      }
});
test("burn, divide, subtract and hard mix retain their distinct channel arithmetic", () => {
  near(
    blendColor([0.2, 0.5, 0.8], [0.5, 0.5, 0.5], "linear-burn"),
    [0, 0, 0.3],
  );
  near(blendColor([0.2, 0.5, 0.8], [0.5, 0.5, 0.5], "divide"), [0.4, 1, 1]);
  near(blendColor([0.2, 0.5, 0.8], [0.5, 0.5, 0.5], "subtract"), [0, 0, 0.3]);
  near(blendColor([0.2, 0.5, 0.8], [0.5, 0.5, 0.5], "hard-mix"), [0, 1, 1]);
  near(blendColor([0.2, 0.5, 0.8], [0.5, 0.5, 0.5], "color-burn"), [0, 0, 0.6]);
});
test("zero opacity and transparent overlay preserve the backdrop in every mode", () => {
  const b = px([12, 80, 240, 93]);
  for (const mode of BLEND_MODES) {
    assert.deepEqual(composite(b, px([255, 20, 13, 0]), mode), b);
    assert.deepEqual(composite(b, px([255, 20, 13, 255]), mode, 0), b);
    assert.deepEqual(
      composite(px([0, 0, 0, 0]), px([80, 140, 210, 255]), mode),
      px([80, 140, 210, 255]),
    );
  }
});
test("source-over alpha is independent from blending and opacity is applied once", () => {
  assert.deepEqual(
    composite(px([0, 0, 255, 255]), px([255, 0, 0, 255]), "normal", 0.5),
    px([128, 0, 128, 255]),
  );
  assert.deepEqual(
    composite(px([255, 255, 255, 128]), px([0, 0, 0, 128]), "normal"),
    px([85, 85, 85, 192]),
  );
});
test("non-separable modes preserve intended luminance and neutral saturation", () => {
  const b = [0.2, 0.7, 0.4],
    s = [0.8, 0.2, 0.6],
    lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  for (const mode of ["hue", "saturation", "color"])
    assert.ok(Math.abs(lum(blendColor(b, s, mode)) - lum(b)) < 1e-6);
  assert.ok(Math.abs(lum(blendColor(b, s, "luminosity")) - lum(s)) < 1e-6);
  const gray = blendColor(b, [0.5, 0.5, 0.5], "saturation");
  near(gray, [lum(b), lum(b), lum(b)]);
});
test("layer validation rejects external media, unbounded numbers and unknown blend modes", () => {
  const good = validateLayer({
    type: "text",
    text: "A\nB",
    font: "IBM Plex Mono",
    opacity: 40,
    blend: "vivid-light",
    x: 0.8,
    width: 0.1,
    color: "#abcdef",
  });
  assert.equal(good.text, "A\nB");
  assert.equal(good.opacity, 40);
  for (const bad of [
    { type: "text", blend: "evil" },
    { type: "text", opacity: NaN },
    { type: "text", width: -1 },
    { type: "image", asset: "https://example.com/private.png" },
    { type: "text", color: "url(x)" },
    { type: "text", filters: { blur: 1000 } },
  ])
    assert.throws(() => validateLayer(bad));
  assert.equal(validateStyle({ opacity: 0 }).opacity, 0);
});
test("all motion paths freeze at zero speed and keep original motion options", () => {
  for (const mode of [
    "static",
    "drift",
    "orbit",
    "bounce",
    "snake",
    "horizontal",
    "vertical",
  ])
    assert.deepEqual(motionOffset(mode, 3, 0), [0, 0]);
  assert.deepEqual(motionOffset("static", 3, 100), [0, 0]);
  assert.equal(motionOffset("horizontal", 3, 50)[1], 0);
  assert.equal(motionOffset("vertical", 3, 50)[0], 0);
  assert.notDeepEqual(
    motionOffset("snake", 2, 50),
    motionOffset("snake", 3, 50),
  );
});

import { recordingFormats, MP4_TYPES } from "../web/export.mjs";
test("phone export prefers explicit AVC/AAC and never mislabels WebM as MP4", () => {
  const both = recordingFormats(() => true);
  assert.equal(both.mp4, MP4_TYPES[0]);
  assert.ok(both.mp4.includes("mp4a.40.2"));
  const webm = recordingFormats((t) => t.startsWith("video/webm"));
  assert.equal(webm.mp4, null);
  assert.ok(webm.webm.startsWith("video/webm"));
});

import { recipeFromPreset } from "../web/recipe.mjs";
test("saved module layers preserve their independent recipe and selected preset", () => {
  const layer = validateLayer({
    type: "module",
    recipe: recipeFromPreset("crt-burn", 77),
    preset: "crt-burn",
    blend: "divide",
    opacity: 31,
  });
  assert.equal(layer.preset, "crt-burn");
  assert.equal(layer.recipe.seed, 77);
  assert.equal(layer.recipe.params.echo, 78);
  const replay = validateLayer(JSON.parse(JSON.stringify(layer)));
  assert.deepEqual(replay.recipe, layer.recipe);
  assert.equal(replay.blend, "divide");
});
