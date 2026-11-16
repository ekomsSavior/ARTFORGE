import { generateSource } from "./sources.mjs";
import {
  DEFAULTS,
  PRESETS,
  recipeFromPreset,
  validateRecipe,
  mutate,
  renderPixels,
  drawSpam,
  hash,
  stackPresets,
} from "./recipe.mjs";
const $ = (id) => document.getElementById(id),
  canvas = $("canvas"),
  ctx = canvas.getContext("2d", { willReadFrequently: true });
const sourceCanvas = document.createElement("canvas"),
  sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const video = $("video"),
  audio = $("audio");
let recipe = recipeFromPreset("ghost-machine"),
  media = null,
  kind = "image",
  sourceWidth = 960,
  sourceHeight = 720;
let customOverlay = null,
  overlayUrl = null,
  overlayLoadId = 0,
  selectedPresets = ["ghost-machine"];
let sourcePixels = null,
  previous = null,
  playing = false,
  elapsed = 0,
  lastTick = 0,
  lastRender = 0,
  comparing = false;
let mediaUrl = null,
  audioUrl = null,
  mediaLoadId = 0,
  audioLoadId = 0,
  recording = null,
  recordTimer = null,
  toastTimer = null;
let soundContext = null,
  analyser = null,
  mixDestination = null,
  videoSource = null,
  audioSource = null,
  videoGain = null,
  musicGain = null;
const LABELS = {
  rgb: ["RGB SEPARATION", "Channel offset"],
  tear: ["SIGNAL TEAR", "Horizontal displacement"],
  grain: ["STATIC", "Signal noise"],
  pixel: ["PIXEL CRUSH", "Block size"],
  scan: ["SCANLINES", "CRT interference"],
  bitrot: ["BIT ROT", "Corrupt pixel blocks"],
  hue: ["HUE DRIFT", "Color rotation"],
  saturation: ["SATURATION", "Zero for monochrome"],
  contrast: ["CONTRAST", "Crush the shadows"],
  posterize: ["COLOR COLLAPSE", "0–1 off / 2–16 levels"],
  echo: ["TEMPORAL ECHO", "Previous-frame feedback"],
  spam: ["SPAMWARE", "Popup intensity"],
  replicas: ["REPLICAS", "Number of windows"],
  motion: ["MOTION SPEED", "Zero freezes the swarm"],
  sync: ["SYNC DRIFT", "Circuit-bent scan & roll"],
  solarize: ["SOLARIZATION", "Voltage-like tonal inversion"],
};
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 5000);
}
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] & 2147483647;
}
function formatTime(t) {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
}
function loopBounds() {
  return [Number($("loopIn").value), Number($("loopOut").value)];
}
function setRecipe(next, activeId = null) {
  recipe = validateRecipe(next);
  previous = null;
  for (const key of Object.keys(LABELS)) {
    const el = $(`control-${key}`);
    if (el) {
      el.value = recipe.params[key];
      $(`value-${key}`).value = recipe.params[key];
    }
  }
  $("spamMessages").value = (recipe.messages || []).join("\n");
  $("seed").value = recipe.seed;
  $("motionPath").value = recipe.params.path;
  $("lookName").textContent = recipe.name;
  $("editedLabel").textContent = "";
  if (activeId) selectedPresets = [activeId];
  else selectedPresets = [];
  document
    .querySelectorAll(".preset")
    .forEach((b) =>
      b.classList.toggle("active", selectedPresets.includes(b.dataset.id)),
    );
  draw();
}
function controlChanged() {
  const params = { ...recipe.params };
  for (const key of Object.keys(LABELS))
    params[key] = Number($(`control-${key}`).value);
  params.path = Number($("motionPath").value);
  recipe = { ...recipe, name: "CUSTOM SIGNAL", params };
  for (const key of Object.keys(LABELS)) $(`value-${key}`).value = params[key];
  $("lookName").textContent = recipe.name;
  document
    .querySelectorAll(".preset")
    .forEach((b) => b.classList.remove("active"));
  previous = null;
  draw();
}
const ranges = {
  rgb: [0, 60],
  tear: [0, 100],
  grain: [0, 100],
  pixel: [1, 32],
  scan: [0, 100],
  bitrot: [0, 100],
  hue: [-180, 180],
  saturation: [0, 200],
  contrast: [0, 200],
  posterize: [0, 16],
  echo: [0, 90],
  spam: [0, 100],
  replicas: [1, 20],
  motion: [0, 100],
  sync: [0, 100],
  solarize: [0, 100],
};
for (const [key, [label, description]] of Object.entries(LABELS)) {
  const row = document.createElement("div");
  row.className = "control";
  row.innerHTML = `<div class="control-head"><label for="control-${key}">${label}</label><output id="value-${key}" for="control-${key}">0</output></div><input id="control-${key}" type="range" min="${ranges[key][0]}" max="${ranges[key][1]}" step="1"><small>${description}</small>`;
  (["spam", "replicas", "motion"].includes(key)
    ? $("spamControls")
    : $("controls")
  ).append(row);
  row.querySelector("input").addEventListener("input", controlChanged);
}
$("motionPath").addEventListener("change", controlChanged);
function makeDemo() {
  const c = document.createElement("canvas");
  c.width = 960;
  c.height = 720;
  const d = c.getContext("2d");
  const bg = d.createLinearGradient(0, 0, 960, 720);
  bg.addColorStop(0, "#b1b1b1");
  bg.addColorStop(0.45, "#d7d7d7");
  bg.addColorStop(1, "#858585");
  d.fillStyle = bg;
  d.fillRect(0, 0, 960, 720);
  d.strokeStyle = "#1112";
  d.lineWidth = 1;
  for (let x = 40; x < 960; x += 40) {
    d.beginPath();
    d.moveTo(x, 0);
    d.lineTo(x, 720);
    d.stroke();
  }
  for (let y = 40; y < 720; y += 40) {
    d.beginPath();
    d.moveTo(0, y);
    d.lineTo(960, y);
    d.stroke();
  }
  d.save();
  d.translate(490, 360);
  d.rotate(-0.25);
  // A chrome knot drawn from layered, shaded contours. The demo is generated locally.
  d.shadowColor = "#0008";
  d.shadowBlur = 24;
  d.shadowOffsetY = 24;
  for (let i = 56; i >= 0; i--) {
    const t = i / 56;
    d.beginPath();
    d.moveTo(-180 + t * 38, -170 + t * 40);
    d.bezierCurveTo(200 + t * 50, -310, 310 - t * 25, -110, -30 + t * 15, 45);
    d.bezierCurveTo(-270 + t * 20, 180, -90, 320, 165 - t * 40, 155 - t * 30);
    d.bezierCurveTo(330 - t * 30, 40, 80, -165, -180 + t * 38, -170 + t * 40);
    d.lineWidth = 3.3;
    const v = Math.round(30 + 205 * Math.abs(Math.sin(t * 5.8 + 0.4)) ** 5);
    d.strokeStyle = `rgb(${v},${v},${v})`;
    d.stroke();
    d.shadowBlur = 0;
    d.shadowOffsetY = 0;
  }
  d.restore();
  d.fillStyle = "#222";
  d.font = "bold 13px monospace";
  d.fillText("ARTFORGE / SPECIMEN 001", 35, 40);
  d.font = "11px monospace";
  d.fillText("SYNTHETIC MATERIAL / DO NOT REPAIR", 35, 682);
  d.fillText("960 × 720", 815, 682);
  d.strokeStyle = "#222";
  for (const [x, y] of [
    [35, 70],
    [925, 70],
    [35, 650],
    [925, 650],
  ]) {
    d.beginPath();
    d.moveTo(x - 9, y);
    d.lineTo(x + 9, y);
    d.moveTo(x, y - 9);
    d.lineTo(x, y + 9);
    d.stroke();
  }
  return c;
}
const demo = makeDemo();
for (const [i, preset] of PRESETS.entries()) {
  const b = document.createElement("button");
  b.className = "preset";
  b.dataset.id = preset.id;
  b.innerHTML = `<canvas width="96" height="72" aria-hidden="true"></canvas><span><strong>${preset.name}</strong><small>${preset.tag}</small></span><span class="preset-num">${String(i + 1).padStart(2, "0")}</span>`;
  b.addEventListener("click", () => {
    if ($("stackMode").checked) {
      let ids = selectedPresets.includes(preset.id)
        ? selectedPresets.filter((id) => id !== preset.id)
        : [...selectedPresets, preset.id];
      const combined = selectedPresets.includes(preset.id)
        ? stackPresets(ids, recipe.seed, recipe.messages)
        : {
            ...recipe,
            name: (recipe.name + " + " + preset.name).slice(0, 80),
            params: { ...recipe.params, ...preset.params },
          };
      setRecipe(combined);
      selectedPresets = ids;
      document
        .querySelectorAll(".preset")
        .forEach((button) =>
          button.classList.toggle("active", ids.includes(button.dataset.id)),
        );
    } else
      setRecipe(
        {
          ...recipeFromPreset(preset.id, recipe.seed),
          messages: recipe.messages,
        },
        preset.id,
      );
  });
  $("presets").append(b);
  const c = b.querySelector("canvas"),
    d = c.getContext("2d");
  d.drawImage(demo, 0, 0, 96, 72);
  const pixels = d.getImageData(0, 0, 96, 72);
  pixels.data.set(
    renderPixels(pixels.data, 96, 72, recipeFromPreset(preset.id)),
  );
  d.putImageData(pixels, 0, 0);
  if (preset.id === "spamware")
    drawSpam(d, 96, 72, recipeFromPreset(preset.id));
}
function resizePreview() {
  const ratio = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
  canvas.width = sourceCanvas.width = Math.max(
    1,
    Math.round(sourceWidth * ratio),
  );
  canvas.height = sourceCanvas.height = Math.max(
    1,
    Math.round(sourceHeight * ratio),
  );
  sourcePixels = null;
  previous = null;
  $("dimensions").textContent = `${canvas.width} × ${canvas.height}`;
}
function updateSource() {
  sourceCtx.clearRect(0, 0, canvas.width, canvas.height);
  sourceCtx.drawImage(media, 0, 0, canvas.width, canvas.height);
  sourcePixels = sourceCtx.getImageData(0, 0, canvas.width, canvas.height);
}
function audioEnergy() {
  if (!analyser || !$("reactive").checked || !playing) return 0;
  const values = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(values);
  let sum = 0;
  for (let i = 0; i < values.length / 3; i++) sum += values[i];
  return Math.min(
    2,
    (sum / (values.length / 3) / 180) * Number($("audioGain").value),
  );
}
function draw(forceTime = null) {
  if (!media) return;
  if (kind === "video" && video.readyState < 2) return;
  if (!sourcePixels || kind === "video") updateSource();
  if (comparing) {
    ctx.putImageData(sourcePixels, 0, 0);
    return;
  }
  const time = forceTime ?? elapsed,
    energy = audioEnergy();
  const result = renderPixels(
    sourcePixels.data,
    canvas.width,
    canvas.height,
    recipe,
    Math.floor(time * 12),
    energy,
  );
  if (previous && playing && recipe.params.echo) {
    const mix = recipe.params.echo / 100;
    for (let i = 0; i < result.length; i += 4)
      for (let c = 0; c < 3; c++)
        result[i + c] = Math.round(
          result[i + c] * (1 - mix) + previous[i + c] * mix,
        );
  }
  ctx.putImageData(new ImageData(result, canvas.width, canvas.height), 0, 0);
  drawSpam(ctx, canvas.width, canvas.height, recipe, time, customOverlay);
  if (playing)
    previous = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const level = Math.min(8, Math.round(energy * 8));
  $("audioMeter").textContent = "▇".repeat(level) + "▁".repeat(8 - level);
}
function updateTransport() {
  $("seek").value = elapsed;
  $("timeReadout").textContent = formatTime(elapsed);
  $("renderState").textContent = recording
    ? "RECORDING / LIVE"
    : playing
      ? "LIVE / LOOPING"
      : "STILL / PAUSED";
}
async function setupSound() {
  if (!soundContext) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    soundContext = new Audio();
    analyser = soundContext.createAnalyser();
    analyser.fftSize = 256;
    mixDestination = soundContext.createMediaStreamDestination();
    analyser.connect(soundContext.destination);
    analyser.connect(mixDestination);
    videoGain = soundContext.createGain();
    musicGain = soundContext.createGain();
    videoSource = soundContext.createMediaElementSource(video);
    audioSource = soundContext.createMediaElementSource(audio);
    videoSource.connect(videoGain);
    audioSource.connect(musicGain);
    videoGain.connect(analyser);
    musicGain.connect(analyser);
  }
  videoGain.gain.value = audioUrl ? 0 : 1;
  musicGain.gain.value = 1;
  await soundContext.resume();
}
async function setPlaying(value) {
  if (value === playing) return;
  if (value) {
    try {
      await setupSound();
      if (kind === "video") {
        const [start, end] = loopBounds();
        if (video.currentTime < start || video.currentTime >= end)
          video.currentTime = start;
        await video.play();
      }
      if (audioUrl) {
        audio.currentTime = audio.duration ? elapsed % audio.duration : 0;
        await audio.play();
      }
      playing = true;
      lastTick = performance.now();
    } catch (e) {
      video.pause();
      audio.pause();
      toast(`Playback unavailable: ${e.message}`);
      return;
    }
  } else {
    playing = false;
    video.pause();
    audio.pause();
    previous = null;
  }
  $("play").textContent = playing ? "Ⅱ" : "▶";
  $("play").setAttribute(
    "aria-label",
    playing ? "Pause animation" : "Play animation",
  );
  $("play").setAttribute("aria-pressed", String(playing));
  updateTransport();
}
function tick(now) {
  requestAnimationFrame(tick);
  if (!playing) return;
  const [start, end] = loopBounds();
  const dt = Math.min((now - lastTick) / 1000, 0.25);
  lastTick = now;
  if (kind === "video") {
    if (video.ended || video.currentTime >= end) {
      video.currentTime = start;
      video.play().catch(() => setPlaying(false));
      previous = null;
    }
    elapsed = Math.max(start, video.currentTime);
  } else {
    elapsed += dt;
    if (elapsed >= end) {
      elapsed = start + ((elapsed - start) % (end - start));
      previous = null;
    }
  }
  if (now - lastRender >= 1000 / 24) {
    lastRender = now;
    draw();
    updateTransport();
  }
}
function stopRecord() {
  if (recording && recording.state !== "inactive") recording.stop();
}
function resetTimeline(duration) {
  $("loopIn").value = 0;
  $("loopOut").value = Number(duration.toFixed(1));
  $("loopOut").max = kind === "video" ? duration : 600;
  $("seek").min = 0;
  $("seek").max = duration;
  $("durationReadout").textContent = formatTime(duration);
  elapsed = 0;
  updateTransport();
}
function updateLoop() {
  let start = Number($("loopIn").value),
    end = Number($("loopOut").value);
  const max = kind === "video" ? video.duration : 600;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > max
  ) {
    toast(
      `Set a loop between 0 and ${max.toFixed(1)} seconds, with OUT after IN.`,
    );
    return false;
  }
  $("seek").min = start;
  $("seek").max = end;
  $("durationReadout").textContent = formatTime(end);
  elapsed = Math.max(start, Math.min(elapsed, end));
  if (kind === "video") video.currentTime = elapsed;
  previous = null;
  draw();
  updateTransport();
  return true;
}
let validBounds = [0, 8];
for (const id of ["loopIn", "loopOut"])
  $(id).addEventListener("change", () => {
    if (updateLoop()) validBounds = loopBounds();
    else {
      [$("loopIn").value, $("loopOut").value] = validBounds;
    }
  });
function unloadMedia() {
  stopRecord();
  setPlaying(false);
  video.removeAttribute("src");
  video.load();
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = null;
}
function loadDemo() {
  mediaLoadId++;
  unloadMedia();
  media = demo;
  kind = "image";
  sourceWidth = 960;
  sourceHeight = 720;
  resizePreview();
  resetTimeline(8);
  validBounds = [0, 8];
  $("sourceName").textContent = "SIGNAL_GARDEN / DEMO";
  if (!audioUrl)
    $("audioLabel").textContent = "Add a soundtrack. Let the signal follow.";
  draw();
}
async function loadMedia(file) {
  if (!file) return;
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    toast("Choose an image or a browser-playable video, including MP4.");
    return;
  }
  const token = ++mediaLoadId;
  unloadMedia();
  const url = URL.createObjectURL(file);
  mediaUrl = url;
  try {
    if (file.type.startsWith("video/")) {
      video.src = url;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () =>
          reject(
            new Error(
              "This video codec is not supported by your browser. Try an H.264 MP4 or WebM.",
            ),
          );
      });
      if (token !== mediaLoadId) return;
      if (!Number.isFinite(video.duration) || video.duration <= 0)
        throw new Error("This video has no readable duration.");
      kind = "video";
      media = video;
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
      resetTimeline(Math.min(video.duration, 8));
      if (!audioUrl)
        $("audioLabel").textContent = "Using video soundtrack, when present.";
    } else {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (token !== mediaLoadId) return;
      kind = "image";
      media = image;
      sourceWidth = image.naturalWidth;
      sourceHeight = image.naturalHeight;
      resetTimeline(8);
      if (!audioUrl)
        $("audioLabel").textContent =
          "Add a soundtrack. Let the signal follow.";
    }
    validBounds = loopBounds();
    resizePreview();
    $("sourceName").textContent = file.name;
    draw();
    toast(`${file.name} loaded locally.`);
  } catch (e) {
    if (token !== mediaLoadId) return;
    loadDemo();
    toast(e.message);
  }
}
for (const button of document.querySelectorAll("[data-source]"))
  button.onclick = () => {
    if (recording) {
      toast("Finish the recording before generating a new source.");
      return;
    }
    mediaLoadId++;
    unloadMedia();
    kind = "image";
    media = generateSource(button.dataset.source, recipe.seed);
    sourceWidth = media.width;
    sourceHeight = media.height;
    resizePreview();
    resetTimeline(8);
    validBounds = [0, 8];
    $("sourceName").textContent =
      button.dataset.source.toUpperCase() + " / GENERATED";
    if (!audioUrl)
      $("audioLabel").textContent = "Add a soundtrack. Let the signal follow.";
    draw();
    toast("Generated from your seed. Glitch it, loop it, or export it.");
  };
$("importBtn").onclick = () => $("mediaInput").click();
$("mediaInput").onchange = (e) => {
  loadMedia(e.target.files[0]);
  e.target.value = "";
};
$("demoBtn").onclick = loadDemo;
let dragDepth = 0;
document.addEventListener("dragenter", (e) => {
  if (e.dataTransfer?.types.includes("Files")) {
    e.preventDefault();
    dragDepth++;
    $("stage").classList.add("dragging");
  }
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $("stage").classList.remove("dragging");
  }
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("stage").classList.remove("dragging");
  const file = e.dataTransfer.files[0];
  if (recording) {
    toast("Finish recording before replacing the source.");
    return;
  }
  if (file?.name.endsWith(".json")) readRecipe(file);
  else loadMedia(file);
});
$("applyMessages").onclick = () => {
  try {
    const messages = $("spamMessages")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setRecipe({
      ...recipe,
      messages,
      params: { ...recipe.params, spam: recipe.params.spam || 85 },
    });
    toast(
      messages.length
        ? "Custom popup messages applied."
        : "Preset popup messages restored.",
    );
  } catch (e) {
    toast(e.message);
  }
};
$("overlayBtn").onclick = () => $("overlayInput").click();
$("overlayInput").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const token = ++overlayLoadId;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (token !== overlayLoadId) {
      URL.revokeObjectURL(url);
      return;
    }
    if (overlayUrl) URL.revokeObjectURL(overlayUrl);
    overlayUrl = url;
    customOverlay = img;
    $("overlayName").textContent = file.name;
    $("clearOverlay").hidden = false;
    setRecipe({
      ...recipe,
      params: { ...recipe.params, spam: recipe.params.spam || 85 },
    });
    toast("Your image is now the replicated overlay.");
  } catch (e) {
    URL.revokeObjectURL(url);
    toast("Could not read that overlay image.");
  }
};
$("clearOverlay").onclick = () => {
  overlayLoadId++;
  if (overlayUrl) URL.revokeObjectURL(overlayUrl);
  overlayUrl = null;
  customOverlay = null;
  $("overlayName").textContent = "Or replicate your own image / screenshot.";
  $("clearOverlay").hidden = true;
  previous = null;
  draw();
};
$("play").onclick = () => setPlaying(!playing);
$("seek").addEventListener("input", () => {
  elapsed = Number($("seek").value);
  previous = null;
  if (kind === "video") video.currentTime = elapsed;
  if (audioUrl && Number.isFinite(audio.duration))
    audio.currentTime = elapsed % audio.duration;
  draw();
  updateTransport();
});
video.addEventListener("seeked", () => draw());
$("setIn").onclick = () => {
  const old = $("loopIn").value;
  $("loopIn").value = elapsed.toFixed(1);
  if (!updateLoop()) $("loopIn").value = old;
  else validBounds = loopBounds();
};
$("setOut").onclick = () => {
  const old = $("loopOut").value;
  $("loopOut").value = elapsed.toFixed(1);
  if (!updateLoop()) $("loopOut").value = old;
  else validBounds = loopBounds();
};
function toggleCompare() {
  comparing = !comparing;
  $("compare").setAttribute("aria-pressed", String(comparing));
  previous = null;
  draw();
}
$("compare").onclick = toggleCompare;
$("fullscreen").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else
    $("stage")
      .requestFullscreen?.()
      .catch(() => toast("Fullscreen is unavailable in this browser."));
};
$("mutateBtn").onclick = () => {
  setRecipe(mutate(recipe, randomSeed()));
  toast("New mutation. Save the recipe if it speaks to you.");
};
$("randomSeed").onclick = () => setRecipe({ ...recipe, seed: randomSeed() });
$("seed").onchange = () => {
  const seed = Number($("seed").value);
  try {
    setRecipe({ ...recipe, seed });
  } catch (e) {
    $("spamMessages").value = (recipe.messages || []).join("\n");
    $("seed").value = recipe.seed;
    toast(e.message);
  }
};
$("resetBtn").onclick = () =>
  setRecipe({ ...recipe, name: "CLEAN SIGNAL", params: { ...DEFAULTS } });
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$("saveRecipe").onclick = () => {
  download(
    new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }),
    `artforge-${recipe.seed}.json`,
  );
  toast(
    customOverlay
      ? "Recipe saved. Reimport your custom overlay image when loading it."
      : "Recipe saved. Load it here or in the terminal.",
  );
};
async function readRecipe(file) {
  try {
    if (file.size > 65536)
      throw new Error("Recipe is too large (64 KB maximum).");
    setRecipe(validateRecipe(JSON.parse(await file.text())));
    toast("Recipe loaded.");
  } catch (e) {
    toast(`Cannot load recipe: ${e.message}`);
  }
}
$("loadRecipe").onclick = () => $("recipeInput").click();
$("recipeInput").onchange = (e) => {
  if (e.target.files[0]) readRecipe(e.target.files[0]);
  e.target.value = "";
};
$("audioBtn").onclick = () => $("audioInput").click();
$("audioInput").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const token = ++audioLoadId;
  audio.pause();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(file);
  audio.src = audioUrl;
  audio.loop = true;
  try {
    await new Promise((resolve, reject) => {
      audio.onloadedmetadata = resolve;
      audio.onerror = () =>
        reject(new Error("This audio format could not be decoded."));
    });
    if (token !== audioLoadId) return;
    await setupSound();
    $("audioLabel").textContent = file.name;
    $("clearAudio").hidden = false;
    $("reactive").checked = true;
    if (playing) await audio.play();
    toast("Soundtrack loaded. Reactivity is on.");
  } catch (err) {
    if (token === audioLoadId) {
      clearAudio();
      toast(err.message);
    }
  }
};
function clearAudio() {
  audioLoadId++;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  $("clearAudio").hidden = true;
  $("audioLabel").textContent =
    kind === "video"
      ? "Using video soundtrack, when present."
      : "Add a soundtrack. Let the signal follow.";
  if (videoGain) videoGain.gain.value = 1;
}
$("clearAudio").onclick = clearAudio;
$("exportPng").onclick = async () => {
  const btn = $("exportPng");
  btn.disabled = true;
  toast("Rendering your still…");
  await new Promise((r) => setTimeout(r, 30));
  try {
    const out = document.createElement("canvas");
    const max = $("exportSize").value === "preview" ? 960 : 2560,
      ratio = Math.min(1, max / Math.max(sourceWidth, sourceHeight));
    out.width = Math.max(1, Math.round(sourceWidth * ratio));
    out.height = Math.max(1, Math.round(sourceHeight * ratio));
    const d = out.getContext("2d");
    if ($("exportSize").value === "preview") {
      d.drawImage(canvas, 0, 0, out.width, out.height);
    } else {
      d.drawImage(media, 0, 0, out.width, out.height);
      if (!comparing) {
        const pixels = d.getImageData(0, 0, out.width, out.height);
        pixels.data.set(
          renderPixels(
            pixels.data,
            out.width,
            out.height,
            recipe,
            Math.floor(elapsed * 12),
            audioEnergy(),
          ),
        );
        d.putImageData(pixels, 0, 0);
        drawSpam(d, out.width, out.height, recipe, elapsed, customOverlay);
      }
    }
    const blob = await new Promise((resolve) =>
      out.toBlob(resolve, "image/png"),
    );
    if (!blob)
      throw new Error("Could not encode this image. Try preview size.");
    download(blob, `artforge-${recipe.seed}.png`);
    toast("PNG exported. Preview-size exports also capture temporal feedback.");
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
};
const mimeTypes = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];
const recordingType =
  typeof MediaRecorder !== "undefined"
    ? mimeTypes.find((t) => MediaRecorder.isTypeSupported(t))
    : null;
if (!recordingType || !canvas.captureStream) {
  $("record").disabled = true;
  $("recordFormat").textContent = "RECORDING NOT SUPPORTED";
} else
  $("recordFormat").textContent =
    `${recordingType.includes("mp4") ? "MP4" : "WEBM"} / 24 FPS`;
function lockRecording(lock) {
  for (const id of [
    "importBtn",
    "demoBtn",
    "audioBtn",
    "clearAudio",
    "loopIn",
    "loopOut",
    "setIn",
    "setOut",
    "recordDuration",
    "seek",
    "play",
    "overlayBtn",
    "clearOverlay",
  ])
    $(id).disabled = lock;
}
$("record").onclick = async () => {
  if (recording) {
    stopRecord();
    return;
  }
  if (!updateLoop()) return;
  const [start, end] = loopBounds();
  const seconds =
    $("recordDuration").value === "loop"
      ? Math.min(60, end - start)
      : Number($("recordDuration").value);
  try {
    await setPlaying(false);
    elapsed = start;
    if (kind === "video") {
      video.currentTime = start;
      await new Promise((resolve) => {
        if (!video.seeking) resolve();
        else video.addEventListener("seeked", resolve, { once: true });
      });
    }
    previous = null;
    await setupSound();
    if (audioUrl && Number.isFinite(audio.duration))
      audio.currentTime = start % audio.duration;
    draw();
    const stream = canvas.captureStream(24);
    if ((audioUrl || kind === "video") && mixDestination)
      for (const track of mixDestination.stream.getAudioTracks())
        stream.addTrack(track.clone());
    const recorder = new MediaRecorder(stream, {
      mimeType: recordingType,
      videoBitsPerSecond: 6000000,
    });
    recording = recorder;
    const chunks = [];
    const started = performance.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      clearInterval(recordTimer);
      stream.getTracks().forEach((t) => t.stop());
      recording = null;
      lockRecording(false);
      $("record").classList.remove("recording");
      $("record").innerHTML = "RECORD LOOP <span>↗</span>";
      setPlaying(false);
      if (chunks.length) {
        download(
          new Blob(chunks, { type: recorder.mimeType }),
          `artforge-loop-${recipe.seed}.${recorder.mimeType.includes("mp4") ? "mp4" : "webm"}`,
        );
        toast("Loop exported with the active soundtrack.");
      } else toast("The browser produced no recording. Try a shorter loop.");
      updateTransport();
    };
    recorder.onerror = () => {
      toast("Recording failed in this browser.");
      stopRecord();
    };
    recorder.start(250);
    lockRecording(true);
    $("record").classList.add("recording");
    await setPlaying(true);
    if (!playing) {
      stopRecord();
      return;
    }
    recordTimer = setInterval(() => {
      const remaining = seconds - (performance.now() - started) / 1000;
      $("record").textContent = `STOP / ${Math.max(0, remaining).toFixed(1)}s`;
      if (remaining <= 0) stopRecord();
    }, 100);
  } catch (e) {
    stopRecord();
    recording = null;
    lockRecording(false);
    toast(`Recording unavailable: ${e.message}`);
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (recording) {
      stopRecord();
      toast("Recording stopped when the tab became hidden.");
    }
    setPlaying(false);
  }
});
function showGuide() {
  if (!$("guide").open) $("guide").showModal();
}
for (const id of ["helpBtn", "shortcuts"]) $(id).onclick = showGuide;
$("closeGuide").onclick = () => $("guide").close();
$("guide").addEventListener("click", (e) => {
  if (e.target === $("guide")) {
    const r = $("guide").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("guide").close();
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName) ||
    $("guide").open
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!recording) setPlaying(!playing);
  } else if (e.key.toLowerCase() === "m") $("mutateBtn").click();
  else if (e.key.toLowerCase() === "c") toggleCompare();
  else if (e.key === "?") showGuide();
});
window.addEventListener("beforeunload", () => {
  stopRecord();
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  if (overlayUrl) URL.revokeObjectURL(overlayUrl);
});
loadDemo();
setRecipe(recipe, "ghost-machine");
requestAnimationFrame(tick);
