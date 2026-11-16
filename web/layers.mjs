import {
  DEFAULTS,
  PRESETS,
  renderPixels,
  drawSpam,
  validateRecipe,
} from "./recipe.mjs";
import { BLEND_MODES, composite } from "./blend.mjs";
export { BLEND_MODES };
export const FONTS = [
  "Barlow Condensed",
  "IBM Plex Mono",
  "Inter",
  "serif",
  "monospace",
];
export const FILTERS = {
  brightness: [0, 200, 100],
  contrast: [0, 200, 100],
  saturation: [0, 200, 100],
  hue: [-180, 180, 0],
  blur: [0, 20, 0],
  invert: [0, 100, 0],
  grain: [0, 100, 0],
  tear: [0, 100, 0],
  rgb: [0, 60, 0],
  pixel: [1, 32, 1],
  scan: [0, 100, 0],
  bitrot: [0, 100, 0],
  solarize: [0, 100, 0],
};
export const FILTER_DEFAULTS = Object.fromEntries(
  Object.entries(FILTERS).map(([k, v]) => [k, v[2]]),
);
export function newLayer(type, name = type.toUpperCase()) {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    visible: true,
    opacity: 100,
    blend: "normal",
    x: 0.15,
    y: 0.15,
    width: 0.65,
    rotation: 0,
    filters: { ...FILTER_DEFAULTS },
    text: "YOUR SIGNAL HERE",
    font: "Barlow Condensed",
    fontSize: 80,
    color: "#ffffff",
    bold: true,
    italic: false,
    underline: false,
    outline: 0,
    shadow: 0,
    align: "left",
    motion: "static",
    speed: 30,
    asset: null,
  };
}
export function validateLayer(value) {
  if (!value || !["text", "image", "module"].includes(value.type))
    throw new Error("Unknown project layer.");
  const l = newLayer(value.type);
  const ranges = {
    opacity: [0, 100],
    x: [-1, 2],
    y: [-1, 2],
    width: [0.02, 2],
    rotation: [-180, 180],
    fontSize: [8, 400],
    outline: [0, 12],
    shadow: [0, 40],
    speed: [0, 100],
  };
  for (const [k, [min, max]] of Object.entries(ranges))
    if (value[k] !== undefined) {
      if (
        typeof value[k] !== "number" ||
        !Number.isFinite(value[k]) ||
        value[k] < min ||
        value[k] > max
      )
        throw new Error(`Invalid layer ${k}.`);
      l[k] = value[k];
    }
  for (const k of ["name", "text"])
    if (value[k] !== undefined) {
      if (
        typeof value[k] !== "string" ||
        value[k].length > (k === "text" ? 2000 : 80)
      )
        throw new Error(`Invalid layer ${k}.`);
      l[k] = value[k];
    }
  for (const k of ["visible", "bold", "italic", "underline"])
    if (value[k] !== undefined) {
      if (typeof value[k] !== "boolean") throw new Error(`Invalid layer ${k}.`);
      l[k] = value[k];
    }
  for (const [k, options] of Object.entries({
    blend: BLEND_MODES,
    font: FONTS,
    align: ["left", "center", "right"],
    motion: [
      "static",
      "drift",
      "orbit",
      "bounce",
      "snake",
      "horizontal",
      "vertical",
    ],
  }))
    if (value[k] !== undefined) {
      if (!options.includes(value[k])) throw new Error(`Invalid layer ${k}.`);
      l[k] = value[k];
    }
  if (value.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(value.color))
      throw new Error("Invalid text color.");
    l.color = value.color;
  }
  for (const [k, v] of Object.entries(value.filters || {})) {
    if (
      !Object.hasOwn(FILTERS, k) ||
      !Number.isFinite(v) ||
      v < FILTERS[k][0] ||
      v > FILTERS[k][1]
    )
      throw new Error("Invalid layer filter.");
    l.filters[k] = v;
  }
  if (value.type === "module") {
    l.recipe = validateRecipe(value.recipe);
    if (PRESETS.some((p) => p.id === value.preset)) l.preset = value.preset;
  }
  if (value.type === "image") {
    if (
      typeof value.asset !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
        value.asset,
      ) ||
      value.asset.length > 12000000
    )
      throw new Error("Invalid embedded image.");
    l.asset = value.asset;
  }
  return l;
}
export function motionOffset(mode, time, speed = 30, phase = 0) {
  const t = (time * speed) / 100;
  if (mode === "static" || !t) return [0, 0];
  if (mode === "drift") return [t * 0.08, t * 0.05];
  if (mode === "orbit")
    return [
      (Math.cos(t * 2 + phase) - Math.cos(phase)) * 0.16,
      (Math.sin(t * 2 + phase) - Math.sin(phase)) * 0.16,
    ];
  if (mode === "snake")
    return [t * 0.11, (Math.sin(t * 4 + phase) - Math.sin(phase)) * 0.18];
  if (mode === "horizontal") return [t * 0.15, 0];
  if (mode === "vertical") return [0, t * 0.15];
  return [t * 0.3, t * 0.22];
}
function position(layer, w, h, bw, bh, time) {
  const [dx, dy] = motionOffset(layer.motion, time, layer.speed),
    x = layer.x * w + dx * w,
    y = layer.y * h + dy * h;
  const wrap = (v, max, size) =>
    ((((v + size) % (max + size)) + (max + size)) % (max + size)) - size;
  const bounce = (v, max) =>
    max <= 0
      ? 0
      : max - Math.abs((((v % (max * 2)) + max * 2) % (max * 2)) - max);
  if (layer.motion === "bounce") return [bounce(x, w - bw), bounce(y, h - bh)];
  if (["drift", "snake", "horizontal", "vertical"].includes(layer.motion))
    return [wrap(x, w, bw), wrap(y, h, bh)];
  return [x, y];
}
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function textLines(ctx, text, width) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    // Character wrapping also supports long unbroken words and non-Latin text.
    for (const ch of paragraph) {
      if (line && ctx.measureText(line + ch).width > width) {
        lines.push(line);
        line = "";
      }
      line += ch;
    }
    lines.push(line);
  }
  return lines;
}
export function rasterLayer(layer, w, h, time = 0) {
  const c = makeCanvas(w, h),
    d = c.getContext("2d", { willReadFrequently: true }),
    bw = layer.width * w;
  let bh = bw * 0.5,
    lines = [],
    size = (layer.fontSize * w) / 960;
  if (layer.type === "text") {
    d.font = `${layer.italic ? "italic " : ""}${layer.bold ? "900" : "400"} ${size}px "${layer.font}"`;
    lines = textLines(d, layer.text, bw);
    bh = Math.max(size * 1.3, lines.length * size * 1.3);
  } else if (layer.image) bh = (bw * layer.image.height) / layer.image.width;
  const [x, y] = position(layer, w, h, bw, bh, time);
  layer.bounds = { x: x / w, y: y / h, width: bw / w, height: bh / h };
  d.translate(x + bw / 2, y + bh / 2);
  d.rotate((layer.rotation * Math.PI) / 180);
  d.translate(-bw / 2, -bh / 2);
  if (layer.type === "text") {
    d.fillStyle = layer.color;
    d.strokeStyle = "#111111";
    d.lineJoin = "round";
    d.lineWidth = (layer.outline * w) / 960;
    d.shadowColor = "#000000";
    d.shadowBlur = (layer.shadow * w) / 960;
    d.shadowOffsetX = (layer.shadow * w) / 1920;
    d.shadowOffsetY = (layer.shadow * w) / 1920;
    d.textBaseline = "top";
    d.textAlign = layer.align;
    const tx =
      layer.align === "left" ? 0 : layer.align === "center" ? bw / 2 : bw;
    lines.forEach((line, i) => {
      if (layer.outline) d.strokeText(line, tx, i * size * 1.3);
      d.fillText(line, tx, i * size * 1.3);
      if (layer.underline) {
        const tw = d.measureText(line).width;
        d.fillRect(
          tx -
            (layer.align === "center"
              ? tw / 2
              : layer.align === "right"
                ? tw
                : 0),
          i * size * 1.3 + size,
          tw,
          Math.max(1, size / 20),
        );
      }
    });
  } else if (layer.image) d.drawImage(layer.image, 0, 0, bw, bh);
  return c;
}
export function applyLayerFilters(c, settings, seed, time) {
  const f = { ...FILTER_DEFAULTS, ...settings };
  if (Object.keys(FILTER_DEFAULTS).every((k) => f[k] === FILTER_DEFAULTS[k]))
    return c;
  const d = c.getContext("2d", { willReadFrequently: true });
  let img = d.getImageData(0, 0, c.width, c.height);
  if (
    [
      "contrast",
      "saturation",
      "hue",
      "grain",
      "tear",
      "rgb",
      "pixel",
      "scan",
      "bitrot",
      "solarize",
    ].some((k) => f[k] !== FILTER_DEFAULTS[k])
  ) {
    const params = { ...DEFAULTS };
    for (const k of Object.keys(params)) if (k in f) params[k] = f[k];
    img.data.set(
      renderPixels(
        img.data,
        c.width,
        c.height,
        { seed, params },
        Math.floor(time * 12),
      ),
    );
  }
  if (f.brightness !== 100 || f.invert)
    for (let i = 0; i < img.data.length; i += 4)
      for (let k = 0; k < 3; k++) {
        const v = (img.data[i + k] * f.brightness) / 100;
        img.data[i + k] =
          v * (1 - f.invert / 100) + ((255 - v) * f.invert) / 100;
      }
  d.putImageData(img, 0, 0);
  if (f.blur) {
    const b = makeCanvas(c.width, c.height),
      bd = b.getContext("2d");
    bd.filter = `blur(${(f.blur * c.width) / 960}px)`;
    bd.drawImage(c, 0, 0);
    return b;
  }
  return c;
}
export function compositeCanvas(ctx, front, blend = "normal", opacity = 100) {
  if (opacity <= 0) return;
  // Native standard modes avoid allocating a full-frame JS array in the common case.
  const native = [
    "normal",
    "multiply",
    "darken",
    "color-burn",
    "lighten",
    "screen",
    "color-dodge",
    "overlay",
    "soft-light",
    "hard-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
  ];
  if (native.includes(blend)) {
    ctx.save();
    ctx.globalCompositeOperation = blend === "normal" ? "source-over" : blend;
    ctx.globalAlpha = opacity / 100;
    ctx.drawImage(front, 0, 0);
    ctx.restore();
    return;
  }
  const w = ctx.canvas.width,
    h = ctx.canvas.height,
    back = ctx.getImageData(0, 0, w, h),
    top = front.getContext("2d").getImageData(0, 0, w, h);
  back.data.set(composite(back.data, top.data, blend, opacity / 100));
  ctx.putImageData(back, 0, 0);
}
export function renderStack(ctx, layers, seed, time = 0) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  for (const layer of layers) {
    if (!layer.visible || !layer.opacity) continue;
    let c;
    if (layer.type === "module") {
      c = makeCanvas(w, h);
      const d = c.getContext("2d", { willReadFrequently: true }),
        src = ctx.getImageData(0, 0, w, h);
      src.data.set(
        renderPixels(src.data, w, h, layer.recipe, Math.floor(time * 12)),
      );
      d.putImageData(src, 0, 0);
      drawSpam(d, w, h, layer.recipe, time);
    } else c = rasterLayer(layer, w, h, time);
    c = applyLayerFilters(c, layer.filters, seed, time);
    compositeCanvas(ctx, c, layer.blend, layer.opacity);
  }
}
export function renderSpamLayer(ctx, recipe, time, image, style) {
  if (!recipe.params.spam || style.opacity <= 0) return;
  let c = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  drawSpam(c.getContext("2d"), c.width, c.height, recipe, time, image);
  c = applyLayerFilters(c, style.filters, recipe.seed, time);
  compositeCanvas(ctx, c, style.blend, style.opacity);
}
export function serializeLayers(layers) {
  return layers.map(({ image, bounds, ...layer }) => layer);
}
export function validateStyle(style) {
  const l = validateLayer({ type: "text", ...style });
  return { opacity: l.opacity, blend: l.blend, filters: l.filters };
}
