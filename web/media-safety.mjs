// Uploaded bytes are data, never markup, code, URLs, or module sources.
export const MEDIA_LIMITS = Object.freeze({
  imageBytes: 24000000,
  pixels: 32000000,
  dimension: 8192,
  videoBytes: 200000000,
  audioBytes: 50000000,
  duration: 3600,
  projectBytes: 64000000,
});
const fail = (
  message = "Invalid or unsupported image. Use PNG, JPEG, GIF, or static WebP.",
) => {
  throw new Error(message);
};
const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
const join = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};
export function checkDimensions(
  width,
  height,
  maxPixels = MEDIA_LIMITS.pixels,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MEDIA_LIMITS.dimension ||
    height > MEDIA_LIMITS.dimension ||
    width * height > maxPixels
  )
    fail("Image/video exceeds the 8192px edge or 32 megapixel limit.");
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc(b) {
  let n = 0xffffffff;
  for (const v of b) n = (n >>> 8) ^ crcTable[(n ^ v) & 255];
  return (n ^ 0xffffffff) >>> 0;
}
function png(b) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength),
    parts = [b.subarray(0, 8)];
  let width,
    height,
    image = false,
    ended = false,
    chunks = 0;
  for (let p = 8; p < b.length; ) {
    if (++chunks > 100000 || p + 12 > b.length) fail("Truncated PNG.");
    const n = view.getUint32(p),
      type = ascii(b, p + 4, 4),
      end = p + 12 + n;
    if (
      end > b.length ||
      !/^[A-Za-z]{4}$/.test(type) ||
      crc(b.subarray(p + 4, end - 4)) !== view.getUint32(end - 4)
    )
      fail("Invalid PNG chunk or checksum.");
    if (p === 8 && (type !== "IHDR" || n !== 13)) fail();
    if (type === "IHDR") {
      if (width !== undefined) fail();
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      checkDimensions(width, height);
    }
    if (type === "IDAT") image = true;
    if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type))
      parts.push(b.subarray(p, end));
    else if (type[0] === type[0].toUpperCase())
      fail("Unsupported critical PNG chunk.");
    // Drop text, EXIF, compressed profiles, animation, and any trailing data.
    if (type === "IEND") {
      if (n !== 0) fail();
      ended = true;
      break;
    }
    p = end;
  }
  if (!image || !ended) fail("Incomplete PNG.");
  return { mime: "image/png", width, height, bytes: join(parts) };
}
function orientation(b) {
  try {
    if (ascii(b, 0, 6) !== "Exif\0\0") return 1;
    const v = new DataView(b.buffer, b.byteOffset + 6, b.length - 6),
      le = v.getUint16(0) === 0x4949;
    if (v.getUint16(2, le) !== 42) return 1;
    const p = v.getUint32(4, le),
      n = v.getUint16(p, le);
    if (n > 512) return 1;
    for (let i = 0; i < n; i++) {
      const q = p + 2 + i * 12;
      if (
        v.getUint16(q, le) === 0x112 &&
        v.getUint16(q + 2, le) === 3 &&
        v.getUint32(q + 4, le) === 1
      ) {
        const x = v.getUint16(q + 8, le);
        return x >= 1 && x <= 8 ? x : 1;
      }
    }
  } catch {
    /* malformed optional metadata is discarded */
  }
  return 1;
}
function jpeg(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.length),
    parts = [b.subarray(0, 2)];
  let p = 2,
    width,
    height,
    scan = false,
    ended = false,
    orient = 1,
    count = 0;
  while (p < b.length) {
    if (++count > 100000 || b[p] !== 255) fail("Invalid JPEG structure.");
    const start = p++;
    while (b[p] === 255) p++;
    const marker = b[p++];
    if (marker === 0xd9) {
      parts.push(Uint8Array.of(255, 0xd9));
      ended = true;
      break;
    }
    if (marker === 0xd8 || marker === 0 || p + 2 > b.length) fail();
    const size = v.getUint16(p),
      end = p + size;
    if (size < 2 || end > b.length) fail("Truncated JPEG.");
    if (marker === 0xe1) orient = orientation(b.subarray(p + 2, end));
    if (marker === 0xc0 || marker === 0xc2) {
      if (width !== undefined || size < 8) fail();
      height = v.getUint16(p + 3);
      width = v.getUint16(p + 5);
      checkDimensions(width, height);
    }
    if ([0xc0, 0xc2, 0xc4, 0xdb, 0xdd, 0xda].includes(marker))
      parts.push(b.subarray(start, end));
    else if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      fail("Unsupported JPEG coding mode.");
    p = end;
    if (marker === 0xda) {
      scan = true;
      const from = p;
      while (p < b.length) {
        if (b[p] !== 255) {
          p++;
          continue;
        }
        let q = p + 1;
        while (b[q] === 255) q++;
        if (b[q] === 0 || (b[q] >= 0xd0 && b[q] <= 0xd7)) p = q + 1;
        else break;
      }
      parts.push(b.subarray(from, p));
    }
  }
  if (!ended || !scan || width === undefined) fail("Incomplete JPEG.");
  // Preserve only orientation, reconstructed without copying the EXIF payload.
  if (orient !== 1) {
    const exif = Uint8Array.from([
      255,
      225,
      0,
      34,
      69,
      120,
      105,
      102,
      0,
      0,
      73,
      73,
      42,
      0,
      8,
      0,
      0,
      0,
      1,
      0,
      18,
      1,
      3,
      0,
      1,
      0,
      0,
      0,
      orient,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    parts.splice(1, 0, exif);
  }
  return { mime: "image/jpeg", width, height, bytes: join(parts) };
}
function gif(b) {
  if (b.length < 13) fail();
  const v = new DataView(b.buffer, b.byteOffset, b.length),
    width = v.getUint16(6, true),
    height = v.getUint16(8, true);
  checkDimensions(width, height);
  let p = 13 + (b[10] & 128 ? 3 * 2 ** ((b[10] & 7) + 1) : 0),
    controls = [],
    count = 0;
  if (p > b.length) fail();
  const header = b.subarray(0, p);
  const blocks = () => {
    while (p < b.length) {
      const n = b[p++];
      if (p + n > b.length) fail();
      p += n;
      if (!n) return;
    }
    fail("Truncated GIF.");
  };
  while (p < b.length && ++count < 100000) {
    const start = p,
      marker = b[p++];
    if (marker === 0x21) {
      const label = b[p++];
      blocks();
      if (label === 0xf9 && p - start === 8 && b[start + 2] === 4)
        controls = [b.subarray(start, p)];
    } else if (marker === 0x2c) {
      if (p + 9 > b.length) fail();
      const x = v.getUint16(p, true),
        y = v.getUint16(p + 2, true),
        w = v.getUint16(p + 4, true),
        h = v.getUint16(p + 6, true);
      checkDimensions(w, h);
      if (x + w > width || y + h > height) fail("Invalid GIF frame bounds.");
      const flags = b[p + 8];
      p += 9 + (flags & 128 ? 3 * 2 ** ((flags & 7) + 1) : 0);
      if (p >= b.length || b[p] < 2 || b[p] > 8) fail();
      p++;
      blocks();
      return {
        mime: "image/gif",
        width,
        height,
        bytes: join([
          header,
          ...controls,
          b.subarray(start, p),
          Uint8Array.of(0x3b),
        ]),
      };
    } else fail("GIF has no readable first frame.");
  }
  fail();
}
function webp(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.length),
    end = v.getUint32(4, true) + 8,
    parts = [];
  if (end > b.length || end < 20) fail("Truncated WebP.");
  let width,
    height,
    extended = null,
    image = false,
    count = 0;
  const u24 = (p) => b[p] + b[p + 1] * 256 + b[p + 2] * 65536;
  for (let p = 12; p < end; ) {
    if (++count > 100000 || p + 8 > end) fail();
    const type = ascii(b, p, 4),
      n = v.getUint32(p + 4, true),
      next = p + 8 + n + (n & 1),
      q = p + 8;
    if (next > end) fail();
    if (type === "VP8X") {
      if (n !== 10 || extended || b[q] & 2)
        fail(
          "Animated WebP is not supported. Export a PNG still or an MP4 loop.",
        );
      extended = [u24(q + 4) + 1, u24(q + 7) + 1];
      checkDimensions(...extended);
      const chunk = Uint8Array.from(b.subarray(p, next));
      chunk[8] &= 16;
      parts.push(chunk);
    } else if (type === "VP8 " || type === "VP8L") {
      if (image) fail();
      image = true;
      if (type === "VP8 ") {
        if (n < 10 || ascii(b, q + 3, 3) !== "\x9d\x01\x2a") fail();
        width = v.getUint16(q + 6, true) & 16383;
        height = v.getUint16(q + 8, true) & 16383;
      } else {
        if (n < 5 || b[q] !== 47) fail();
        const bits = v.getUint32(q + 1, true);
        width = (bits & 16383) + 1;
        height = ((bits >>> 14) & 16383) + 1;
      }
      checkDimensions(width, height);
      parts.push(b.subarray(p, next));
    } else if (type === "ALPH") parts.push(b.subarray(p, next));
    else if (type === "ANIM" || type === "ANMF")
      fail("Use PNG or MP4 for animated WebP.");
    p = next;
  }
  if (!image || (extended && (width !== extended[0] || height !== extended[1])))
    fail();
  const body = join(parts),
    head = Uint8Array.from(b.subarray(0, 12));
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  return { mime: "image/webp", width, height, bytes: join([head, body]) };
}
export function sanitizeRaster(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!b.length || b.length > MEDIA_LIMITS.imageBytes)
    fail("Images must be smaller than 24 MB.");
  if (b.length >= 8 && ascii(b, 0, 8) === "\x89PNG\r\n\x1a\n") return png(b);
  if (b[0] === 255 && b[1] === 216) return jpeg(b);
  if (["GIF87a", "GIF89a"].includes(ascii(b, 0, 6))) return gif(b);
  if (b.length >= 20 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP")
    return webp(b);
  fail(
    "Only raster PNG, JPEG, GIF, and static WebP images are accepted. SVG, HTML, and disguised files are blocked.",
  );
}
export function embeddedImageBlob(value) {
  if (
    typeof value !== "string" ||
    value.length > 12000000 ||
    !/^data:image\/(png|jpeg|webp);base64,/.test(value)
  )
    fail("Invalid embedded image.");
  const encoded = value.slice(value.indexOf(",") + 1);
  if (
    !encoded.length ||
    encoded.length % 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  )
    fail("Invalid image encoding.");
  const binary = atob(encoded);
  return new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))]);
}
export async function safeImage(file, maxEdge = 2560) {
  if (file.size > MEDIA_LIMITS.imageBytes)
    fail("Images must be smaller than 24 MB.");
  const safe = sanitizeRaster(await file.arrayBuffer()),
    image = new Image(),
    url = URL.createObjectURL(new Blob([safe.bytes], { type: safe.mime }));
  let timer;
  try {
    image.src = url;
    await Promise.race([
      image.decode(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Image decoding timed out.")),
          15000,
        );
      }),
    ]);
    checkDimensions(image.naturalWidth, image.naturalHeight);
    const ratio = Math.min(
        1,
        maxEdge / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    clearTimeout(timer);
    image.src = "";
    URL.revokeObjectURL(url);
  }
}
export async function checkMediaFile(file, kind = "video") {
  const max =
    kind === "video" ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.audioBytes;
  if (!file.size || file.size > max)
    throw new Error(
      `${kind === "video" ? "Video" : "Audio"} exceeds the ${max / 1000000} MB limit.`,
    );
  const b = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const mp4 =
    b.length >= 16 &&
    ascii(b, 4, 4) === "ftyp" &&
    new DataView(b.buffer).getUint32(0) >= 16;
  const webm =
    b[0] === 0x1a &&
    b[1] === 0x45 &&
    b[2] === 0xdf &&
    b[3] === 0xa3 &&
    ascii(b, 0, b.length).includes("webm");
  const audio =
    ascii(b, 0, 3) === "ID3" ||
    (b[0] === 255 && (b[1] & 0xe0) === 0xe0) ||
    ascii(b, 0, 4) === "OggS" ||
    ascii(b, 0, 4) === "fLaC" ||
    (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE");
  if (!mp4 && !webm && !(kind === "audio" && audio))
    throw new Error(
      kind === "video"
        ? "Use a real MP4 or WebM file; renamed files and playlists are blocked."
        : "Unsupported audio. Use MP3, WAV, Ogg, FLAC, or M4A.",
    );
}
export function waitForMedia(element, event = "loadedmetadata") {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(event, success);
      element.removeEventListener("error", error);
    };
    const success = () => {
        cleanup();
        resolve();
      },
      error = () => {
        cleanup();
        reject(new Error("The browser could not decode this media."));
      };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Media loading timed out."));
    }, 15000);
    element.addEventListener(event, success, { once: true });
    element.addEventListener("error", error, { once: true });
  });
}
