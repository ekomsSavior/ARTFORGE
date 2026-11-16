// Source-over compositing and standard blend functions follow W3C Compositing 1.
// https://www.w3.org/TR/compositing-1/#blending
export const BLEND_MODES = [
  "normal",
  "multiply",
  "darken",
  "color-burn",
  "linear-burn",
  "darker-color",
  "lighten",
  "screen",
  "color-dodge",
  "add",
  "overlay",
  "soft-light",
  "hard-light",
  "vivid-light",
  "pin-light",
  "hard-mix",
  "difference",
  "exclusion",
  "subtract",
  "divide",
  "hue",
  "saturation",
  "color",
  "luminosity",
];
const clamp = (x) => Math.max(0, Math.min(1, x));
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const sat = (c) => Math.max(...c) - Math.min(...c);
function setLum(c, l) {
  let d = l - lum(c),
    r = c.map((v) => v + d),
    n = Math.min(...r),
    x = Math.max(...r);
  if (n < 0) r = r.map((v) => l + ((v - l) * l) / (l - n));
  if (x > 1) r = r.map((v) => l + ((v - l) * (1 - l)) / (x - l));
  return r.map(clamp);
}
function setSat(c, s) {
  const ids = [0, 1, 2].sort((a, b) => c[a] - c[b]),
    out = [0, 0, 0];
  if (c[ids[2]] > c[ids[0]]) {
    out[ids[1]] = ((c[ids[1]] - c[ids[0]]) * s) / (c[ids[2]] - c[ids[0]]);
    out[ids[2]] = s;
  }
  return out;
}
const burn = (b, s) =>
  b === 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
const dodge = (b, s) => (b === 0 ? 0 : s === 1 ? 1 : Math.min(1, b / (1 - s)));
const hard = (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s));
const vivid = (b, s) => (s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * s - 1));
export function blendColor(b, s, mode = "normal") {
  switch (mode) {
    case "hue":
      return setLum(setSat(s, sat(b)), lum(b));
    case "saturation":
      return setLum(setSat(b, sat(s)), lum(b));
    case "color":
      return setLum(s, lum(b));
    case "luminosity":
      return setLum(b, lum(s));
    case "darker-color":
      return b.reduce((a, v) => a + v, 0) <= s.reduce((a, v) => a + v, 0)
        ? b
        : s;
  }
  return b.map((v, i) => {
    const a = s[i];
    switch (mode) {
      case "normal":
        return a;
      case "multiply":
        return v * a;
      case "darken":
        return Math.min(v, a);
      case "color-burn":
        return burn(v, a);
      case "linear-burn":
        return Math.max(0, v + a - 1);
      case "lighten":
        return Math.max(v, a);
      case "screen":
        return v + a - v * a;
      case "color-dodge":
        return dodge(v, a);
      case "add":
        return Math.min(1, v + a);
      case "overlay":
        return hard(a, v);
      case "hard-light":
        return hard(v, a);
      case "soft-light": {
        const d = v <= 0.25 ? ((16 * v - 12) * v + 4) * v : Math.sqrt(v);
        return a <= 0.5
          ? v - (1 - 2 * a) * v * (1 - v)
          : v + (2 * a - 1) * (d - v);
      }
      case "vivid-light":
        return vivid(v, a);
      case "pin-light":
        return a <= 0.5 ? Math.min(v, 2 * a) : Math.max(v, 2 * a - 1);
      case "hard-mix":
        return vivid(v, a) < 0.5 ? 0 : 1;
      case "difference":
        return Math.abs(v - a);
      case "exclusion":
        return v + a - 2 * v * a;
      case "subtract":
        return Math.max(0, v - a);
      case "divide":
        return a === 0 ? 1 : Math.min(1, v / a);
      default:
        throw new Error("Unknown blend mode.");
    }
  });
}
// Straight RGBA input/output; blend only where the two layers overlap.
export function composite(back, front, mode = "normal", opacity = 1) {
  if (back.length !== front.length || back.length % 4)
    throw new Error("Layer sizes differ.");
  if (!BLEND_MODES.includes(mode) || !Number.isFinite(opacity))
    throw new Error("Invalid layer blend.");
  const out = new Uint8ClampedArray(back.length);
  opacity = clamp(opacity);
  for (let i = 0; i < back.length; i += 4) {
    const as = (front[i + 3] / 255) * opacity,
      ab = back[i + 3] / 255,
      ao = as + ab * (1 - as);
    if (!as) {
      out.set(back.subarray(i, i + 4), i);
      continue;
    }
    const b = [back[i] / 255, back[i + 1] / 255, back[i + 2] / 255],
      s = [front[i] / 255, front[i + 1] / 255, front[i + 2] / 255];
    const mixed = blendColor(b, s, mode);
    for (let c = 0; c < 3; c++)
      out[i + c] = ao
        ? Math.round(
            ((as * (1 - ab) * s[c] +
              as * ab * mixed[c] +
              (1 - as) * ab * b[c]) /
              ao) *
              255,
          )
        : 0;
    out[i + 3] = Math.round(ao * 255);
  }
  return out;
}
