export const LIMITS = Object.freeze({
  rgb: [0, 60, 0],
  tear: [0, 100, 0],
  grain: [0, 100, 0],
  pixel: [1, 32, 1],
  scan: [0, 100, 0],
  hue: [-180, 180, 0],
  saturation: [0, 200, 100],
  contrast: [0, 200, 100],
  posterize: [0, 16, 0],
  echo: [0, 90, 0],
  bitrot: [0, 100, 0],
  spam: [0, 100, 0],
  replicas: [1, 20, 6],
  motion: [0, 100, 30],
  path: [0, 5, 0],
  sync: [0, 100, 0],
  solarize: [0, 100, 0],
});
export const DEFAULTS = Object.fromEntries(
  Object.entries(LIMITS).map(([k, v]) => [k, v[2]]),
);
export const PRESETS = [
  {
    id: "vhs-haunt",
    name: "VHS HAUNT",
    tag: "ANALOG / AFTER HOURS",
    color: "#bdc884",
    params: {
      rgb: 12,
      tear: 18,
      grain: 24,
      scan: 30,
      saturation: 70,
      contrast: 116,
      echo: 24,
    },
  },
  {
    id: "neon-bleed",
    name: "NEON BLEED",
    tag: "CHROMATIC / ELECTRIC",
    color: "#f769cf",
    params: {
      rgb: 24,
      tear: 8,
      grain: 12,
      hue: 36,
      saturation: 165,
      contrast: 120,
    },
  },
  {
    id: "pixel-riot",
    name: "PIXEL RIOT",
    tag: "LOW RES / HIGH VOLTAGE",
    color: "#a3e657",
    params: {
      rgb: 14,
      tear: 28,
      pixel: 9,
      grain: 10,
      posterize: 5,
      saturation: 145,
      contrast: 125,
    },
  },
  {
    id: "signal-loss",
    name: "SIGNAL LOSS",
    tag: "TRANSMISSION / BROKEN",
    color: "#92c2e8",
    params: {
      rgb: 32,
      tear: 68,
      grain: 45,
      scan: 52,
      saturation: 35,
      contrast: 135,
      echo: 38,
    },
  },
  {
    id: "acid-bloom",
    name: "ACID BLOOM",
    tag: "CHEMICAL / COLOR COLLAPSE",
    color: "#e2b660",
    params: {
      rgb: 8,
      tear: 10,
      hue: 110,
      saturation: 200,
      contrast: 150,
      posterize: 7,
    },
  },
  {
    id: "ghost-machine",
    name: "GHOST MACHINE",
    tag: "MONOCHROME / MEMORY",
    color: "#a6a0d6",
    params: {
      rgb: 9,
      tear: 32,
      grain: 28,
      scan: 26,
      saturation: 0,
      contrast: 162,
      echo: 65,
    },
  },
  {
    id: "spamware",
    name: "SPAMWARE",
    tag: "POPUP FLOOD / 1999",
    params: {
      tear: 24,
      grain: 15,
      scan: 18,
      bitrot: 12,
      spam: 85,
      replicas: 8,
      motion: 40,
      path: 0,
    },
  },
  {
    id: "bit-rot",
    name: "BIT ROT",
    tag: "MEMORY / DECAY",
    params: {
      tear: 55,
      grain: 22,
      pixel: 4,
      bitrot: 65,
      posterize: 4,
      saturation: 0,
      contrast: 145,
    },
  },
  {
    id: "circuit-bent",
    name: "CIRCUIT BENT",
    tag: "SYNC DRIFT / VOLTAGE",
    params: {
      rgb: 22,
      tear: 37,
      grain: 20,
      sync: 65,
      solarize: 62,
      contrast: 145,
      saturation: 120,
      echo: 45,
    },
  },
  {
    id: "crt-burn",
    name: "CRT BURN",
    tag: "PHOSPHOR / AFTERIMAGE",
    params: {
      rgb: 4,
      tear: 12,
      grain: 30,
      scan: 66,
      sync: 22,
      contrast: 170,
      saturation: 0,
      echo: 78,
    },
  },
];

export function validateRecipe(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== 1 ||
    value.app !== "ARTFORGE"
  )
    throw new Error("This is not an ARTFORGE v1 recipe.");
  if (
    !Number.isInteger(value.seed) ||
    value.seed < 0 ||
    value.seed > 2147483647
  )
    throw new Error("Recipe seed must be an integer from 0 to 2147483647.");
  if (
    !value.params ||
    typeof value.params !== "object" ||
    Array.isArray(value.params)
  )
    throw new Error("Recipe controls are missing.");
  const params = { ...DEFAULTS };
  for (const [key, v] of Object.entries(value.params)) {
    if (!Object.hasOwn(LIMITS, key)) throw new Error(`Unknown control: ${key}`);
    const [min, max] = LIMITS[key];
    if (!Number.isInteger(v) || v < min || v > max)
      throw new Error(`${key} must be an integer from ${min} to ${max}.`);
    params[key] = v;
  }
  const messages = value.messages ?? [];
  if (
    !Array.isArray(messages) ||
    messages.length > 12 ||
    messages.some(
      (s) =>
        typeof s !== "string" ||
        !s.trim() ||
        s.length > 80 ||
        /[\x00-\x1f]/.test(s),
    )
  )
    throw new Error(
      "Use up to 12 popup messages, 1–80 characters each, without control characters.",
    );
  return {
    app: "ARTFORGE",
    version: 1,
    name:
      typeof value.name === "string"
        ? value.name.slice(0, 80)
        : "Custom mutation",
    seed: value.seed,
    params,
    messages,
  };
}

export function stackPresets(ids, seed = 404, messages = []) {
  let params = { ...DEFAULTS };
  const names = [];
  for (const id of ids) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) throw new Error("Unknown preset.");
    Object.assign(params, preset.params);
    names.push(preset.name);
  }
  return validateRecipe({
    app: "ARTFORGE",
    version: 1,
    name: names.join(" + ") || "CLEAN SIGNAL",
    seed,
    params,
    messages,
  });
}

export function recipeFromPreset(id, seed = 404) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error("Unknown preset.");
  return validateRecipe({
    app: "ARTFORGE",
    version: 1,
    name: preset.name,
    seed,
    params: preset.params,
  });
}

export function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function mutate(recipe, seed) {
  let n = seed;
  const rand = () => (n = hash(n + 1)) / 4294967296;
  const params = { ...recipe.params };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (["echo", "replicas", "motion", "path"].includes(key)) continue;
    params[key] = Math.max(
      min,
      Math.min(
        max,
        Math.round(params[key] + (rand() - 0.5) * (max - min) * 0.5),
      ),
    );
  }
  return validateRecipe({ ...recipe, name: "CUSTOM MUTATION", seed, params });
}

// Spatial effects share the same integer hash as the Python image renderer.
// Pixel offsets scale with width, so a recipe retains its character on export.
export function renderPixels(
  source,
  width,
  height,
  recipe,
  phase = 0,
  energy = 0,
) {
  const p = recipe.params,
    result = new Uint8ClampedArray(source.length);
  const scale = width / 960,
    block = Math.max(1, Math.round(p.pixel * scale));
  const shift = Math.round(p.rgb * scale * (1 + energy)),
    band = Math.max(2, Math.round(18 * scale));
  const seed = (recipe.seed + phase) >>> 0;
  const angle = (p.hue * Math.PI) / 180,
    co = Math.cos(angle),
    si = Math.sin(angle);
  const matrix = [
    0.213 + co * 0.787 - si * 0.213,
    0.715 - co * 0.715 - si * 0.715,
    0.072 - co * 0.072 + si * 0.928,
    0.213 - co * 0.213 + si * 0.143,
    0.715 + co * 0.285 + si * 0.14,
    0.072 - co * 0.072 - si * 0.283,
    0.213 - co * 0.213 - si * 0.787,
    0.715 - co * 0.715 + si * 0.715,
    0.072 + co * 0.928 + si * 0.072,
  ];
  const wrap = (x) => ((x % width) + width) % width;
  for (let y = 0; y < height; y++) {
    const h = hash((Math.floor(y / band) + seed) >>> 0);
    let tear =
      h % 100 < p.tear
        ? Math.round(
            (((((h >>> 8) % 201) - 100) * scale * p.tear) / 100) * (1 + energy),
          )
        : 0;
    tear += Math.round(
      p.sync *
        scale *
        1.8 *
        Math.sin((y / height) * 12 + recipe.seed * 0.001 + phase * 0.1),
    );
    const roll = Math.round(
      (p.sync / 100) *
        height *
        0.22 *
        Math.sin(recipe.seed * 0.1 + phase * 0.04),
    );
    const sy =
      (((Math.floor(y / block) * block + roll) % height) + height) % height;
    const scan =
      y % Math.max(2, Math.round(4 * scale)) === 0 ? 1 - p.scan / 140 : 1;
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(wrap(x + tear) / block) * block;
      let r = source[(sy * width + wrap(sx + shift)) * 4],
        g = source[(sy * width + sx) * 4 + 1],
        b = source[(sy * width + wrap(sx - shift)) * 4 + 2];
      const rr = r * matrix[0] + g * matrix[1] + b * matrix[2],
        gg = r * matrix[3] + g * matrix[4] + b * matrix[5],
        bb = r * matrix[6] + g * matrix[7] + b * matrix[8];
      const l = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
      const grain =
        ((hash((x + y * width + seed) >>> 0) % 256) / 255 - 0.5) *
        p.grain *
        1.3;
      const i = (y * width + x) * 4;
      const channels = [rr, gg, bb];
      const rot = hash(
        (Math.floor(x / Math.max(4, block * 4)) +
          Math.floor(y / band) * 131 +
          seed) >>>
          0,
      );
      for (let c = 0; c < 3; c++) {
        let v =
          ((l + ((channels[c] - l) * p.saturation) / 100 - 128) * p.contrast) /
            100 +
          128;
        if (p.posterize >= 2)
          v =
            (Math.round(
              (Math.max(0, Math.min(255, v)) / 255) * (p.posterize - 1),
            ) *
              255) /
            (p.posterize - 1);
        if (rot % 100 < p.bitrot)
          v = Math.max(0, Math.min(255, Math.round(v))) ^ ((rot >>> 8) & 255);
        if (p.solarize) {
          v = Math.max(0, Math.min(255, v));
          if (v > 255 - p.solarize * 2) v = 255 - v;
        }
        result[i + c] = Math.max(
          0,
          Math.min(255, Math.round(v * scan + grain)),
        );
      }
      result[i + 3] = source[(sy * width + sx) * 4 + 3];
    }
  }
  return result;
}

export const SPAM_TEXT = [
  "ILLEGAL OPERATION",
  "YOU ARE VISITOR 000404",
  "MEMORY COULD NOT BE READ",
  "FREE PIXELS. FOREVER.",
  "SIGNAL NOT FOUND",
  "DOWNLOAD MORE STATIC",
];
export function popupLayout(width, height, recipe, time = 0) {
  if (!recipe.params.spam) return [];
  const { replicas, motion, path } = recipe.params,
    speed = motion / 100;
  const w = Math.min(width * 0.53, Math.max(width * 0.26, (180 * width) / 960)),
    h = w * 0.51;
  return Array.from({ length: replicas }, (_, i) => {
    const a = hash((recipe.seed + i * 71) >>> 0),
      b = hash(a + 1),
      t = time * speed;
    let x = ((a % 1000) / 1000) * (width - w),
      y = ((b % 1000) / 1000) * (height - h);
    if (path === 0) {
      x =
        ((((x + t * width * 0.19 * (i % 2 ? 1 : -1)) % (width + w)) +
          width +
          w) %
          (width + w)) -
        w / 2;
      y = ((y + t * height * 0.11) % (height + h)) - h / 2;
    } else if (path === 1) {
      x += (Math.cos(t * 2 + i) - Math.cos(i)) * width * 0.17;
      y += (Math.sin(t * 2 + i) - Math.sin(i)) * height * 0.17;
    } else if (path === 3) {
      x =
        ((((t * width * 0.23 - i * width * 0.15) % (width + w)) + width + w) %
          (width + w)) -
        w / 2;
      y = (height - h) / 2 + Math.sin(t * 3 - i * 0.65) * (height - h) * 0.35;
    } else if (path === 4) {
      x =
        ((((t * width * 0.3 - i * width * 0.18) % (width + w)) + width + w) %
          (width + w)) -
        w / 2;
      y = (height - h) / 2;
    } else if (path === 5) {
      x = (width - w) / 2;
      y =
        ((((t * height * 0.3 - i * height * 0.18) % (height + h)) +
          height +
          h) %
          (height + h)) -
        h / 2;
    } else {
      const bounce = (v, max) =>
        max - Math.abs((((v % (max * 2)) + max * 2) % (max * 2)) - max);
      x = bounce(x + t * width * 0.3, width - w);
      y = bounce(y + t * height * 0.22, height - h);
    }
    const messages = recipe.messages?.length ? recipe.messages : SPAM_TEXT;
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
      text: messages[i % messages.length],
      index: i,
    };
  });
}

export function drawSpam(
  ctx,
  width,
  height,
  recipe,
  time = 0,
  customImage = null,
) {
  const s = width / 960;
  ctx.save();
  ctx.globalAlpha = 0.45 + recipe.params.spam / 182;
  for (const { x, y, w, h, text, index } of popupLayout(
    width,
    height,
    recipe,
    time,
  )) {
    if (customImage) {
      const ratio = Math.min(w / customImage.width, h / customImage.height);
      ctx.drawImage(
        customImage,
        x,
        y,
        customImage.width * ratio,
        customImage.height * ratio,
      );
      continue;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 5 * s, y + 5 * s, w, h);
    ctx.fillStyle = "#bcbcbc";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(x + 4 * s, y + 4 * s, w - 8 * s, 23 * s);
    ctx.font = `bold ${Math.max(7, 11 * s)}px monospace`;
    ctx.fillStyle = "#fff";
    ctx.fillText(
      "SYSTEM_" + String(index).padStart(2, "0") + ".EXE",
      x + 9 * s,
      y + 19 * s,
    );
    ctx.fillStyle = "#bcbcbc";
    ctx.fillRect(x + w - 22 * s, y + 8 * s, 14 * s, 14 * s);
    ctx.fillStyle = "#000";
    ctx.fillText("x", x + w - 18 * s, y + 19 * s);
    ctx.font = `bold ${Math.max(7, 10 * s)}px monospace`;
    ctx.fillText(text, x + 12 * s, y + 48 * s, w - 24 * s);
    ctx.font = `${Math.max(6, 9 * s)}px monospace`;
    ctx.fillText(
      "The image performed an illegal operation.",
      x + 12 * s,
      y + 65 * s,
      w - 24 * s,
    );
    ctx.strokeStyle = "#666";
    ctx.strokeRect(x + w - 78 * s, y + h - 30 * s, 64 * s, 20 * s);
    ctx.fillText("REPEAT", x + w - 65 * s, y + h - 16 * s);
    // Cursor trails are pixels in the artwork, never interactive dialogs.
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.74, y + h * 0.66);
    ctx.lineTo(x + w * 0.74 + 7 * s, y + h * 0.66 + 21 * s);
    ctx.lineTo(x + w * 0.74 + 11 * s, y + h * 0.66 + 13 * s);
    ctx.lineTo(x + w * 0.74 + 20 * s, y + h * 0.66 + 11 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
