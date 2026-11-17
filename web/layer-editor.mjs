import {
  newLayer,
  validateLayer,
  validateStyle,
  BLEND_MODES,
  FONTS,
  FILTERS,
  FILTER_DEFAULTS,
  serializeLayers,
  renderStack,
  renderSpamLayer,
  compositeCanvas,
  applyLayerFilters,
} from "./layers.mjs";
import { PRESETS, recipeFromPreset } from "./recipe.mjs";
import { safeImage, embeddedImageBlob } from "./media-safety.mjs";
const $ = (id) => document.getElementById(id);
const label = (s) => s.replaceAll("-", " ").toUpperCase();
export function createLayerEditor({
  canvas,
  onChange,
  toast,
  getRecipe,
  getFrame,
  isRecording,
}) {
  const state = {
    layers: [],
    selected: "base",
    editing: false,
    base: { opacity: 100, blend: "normal", filters: { ...FILTER_DEFAULTS } },
    spam: { opacity: 100, blend: "normal", filters: { ...FILTER_DEFAULTS } },
  };
  const host = $("layerEditor");
  host.innerHTML = `<div class="section-head"><span>04 / LAYERS & TYPE</span><span class="tiny">COMPOSE THE DAMAGE</span></div>
  <div class="layer-toolbar"><button id="addText">+ TEXT</button><button id="addImage">+ IMAGE</button><button id="freezeFrame">+ FRAME</button><button id="addModule">+ MODULE</button></div>
  <input id="layerImageInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
  <div class="layer-workspace"><div><div id="layerList" class="layer-list" role="group" aria-label="Artwork layers"></div><div class="layer-actions"><button id="layerUp" title="Move selected layer forward">FORWARD</button><button id="layerDown" title="Move selected layer backward">BACK</button><button id="duplicateLayer">COPY</button><button id="deleteLayer">DELETE</button></div><p class="layer-hint">Top of the list = front of the artwork.<br>Drag text or images on the canvas. Resize with the corner handle. Done editing, Escape, or an empty-canvas click hides the handles.</p><div class="layer-project"><button id="saveProject">SAVE LAYERS</button><button id="loadProject">LOAD LAYERS</button><input id="projectInput" type="file" accept=".json" hidden></div><p class="layer-hint">Layer files include text and overlay images. Reimport your base video and audio separately.</p></div>
  <div class="layer-inspector"><button id="finishLayerInspector" class="done-editing" hidden>DONE EDITING</button><label>SELECTED LAYER<input id="layerName" maxlength="80" aria-label="Layer name"></label><label>BLEND MODE<select id="layerBlend">${BLEND_MODES.map((v) => `<option value="${v}">${label(v)}</option>`).join("")}</select></label>
  <label class="layer-slider">OPACITY <output id="layerOpacityValue"></output><input id="layerOpacity" aria-label="Layer opacity" type="range" min="0" max="100" value="100"></label>
  <div id="textSettings"><label>TEXT<textarea id="layerText" rows="3" maxlength="2000" placeholder="Write your signal"></textarea></label><div class="layer-pair"><label>FONT<select id="layerFont">${FONTS.map((f) => `<option>${f}</option>`).join("")}</select></label><label>INK<input id="layerColor" type="color" value="#ffffff" aria-label="Text color"></label></div><div class="layer-pair"><label>SIZE<input id="layerFontSize" aria-label="Text size" type="number" min="8" max="400" step=".1"></label><label>ALIGN<select id="layerAlign"><option value="left">LEFT</option><option value="center">CENTER</option><option value="right">RIGHT</option></select></label></div><div class="type-toggles"><label><input id="layerBold" type="checkbox">BOLD</label><label><input id="layerItalic" type="checkbox">ITALIC</label><label><input id="layerUnderline" type="checkbox">UNDERLINE</label></div><div class="layer-pair"><label>OUTLINE<input id="layerOutline" aria-label="Text outline" type="range" min="0" max="12"></label><label>SHADOW<input id="layerShadow" aria-label="Text shadow" type="range" min="0" max="40"></label></div></div>
  <div id="moduleSettings"><label>MODULE PRESET<select id="modulePreset"><option value="">CURRENT SIGNAL SNAPSHOT</option>${PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}</select></label><p class="layer-hint">Processes the layers beneath it. Blend and fade each module independently.</p></div>
  <div id="placementSettings"><div class="layer-pair"><label>X %<input id="layerX" aria-label="Layer horizontal position" type="number" min="-100" max="200" step=".1"></label><label>Y %<input id="layerY" aria-label="Layer vertical position" type="number" min="-100" max="200" step=".1"></label></div><div class="layer-pair"><label>WIDTH %<input id="layerWidth" aria-label="Layer width" type="range" min="2" max="200" step=".1"></label><label>ROTATION<input id="layerRotation" aria-label="Layer rotation" type="range" min="-180" max="180"></label></div><label>MOTION<select id="layerMotion"><option value="static">STATIC / PINNED</option><option value="drift">DRIFT</option><option value="orbit">ORBIT</option><option value="bounce">BOUNCE</option><option value="snake">SNAKE</option><option value="horizontal">LINE / HORIZONTAL</option><option value="vertical">LINE / VERTICAL</option></select></label><label>SPEED<input id="layerSpeed" aria-label="Layer motion speed" type="range" min="0" max="100"></label></div>
  <details class="layer-filters"><summary>FILTER THIS LAYER</summary><div id="layerFilters"></div><button id="resetLayerFilters">RESET LAYER FILTERS</button></details></div></div><p class="layer-help">Text and image layers stay pinned by default, including over video. + FRAME captures the current video frame as a movable still. Downloads include all visible layers.</p>`;
  document
    .querySelector(".canvas-tools")
    .insertAdjacentHTML(
      "afterbegin",
      '<button id="finishLayerEdit" class="done-editing" title="Finish placing this layer (Escape)" hidden>DONE EDITING</button>',
    );
  function finishEditing() {
    state.editing = false;
    drag = null;
    updateSelection();
  }
  $("finishLayerEdit").onclick = finishEditing;
  $("finishLayerInspector").onclick = finishEditing;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("guide").open) {
      finishEditing();
    }
  });
  $("stage").addEventListener("pointerdown", (e) => {
    if (e.target === $("stage")) finishEditing();
  });
  $("stage").insertAdjacentHTML(
    "beforeend",
    '<div id="layerSelection" class="layer-selection" hidden><button id="resizeLayer" aria-label="Resize selected layer" title="Drag to resize"></button></div>',
  );
  for (const [k, [min, max, def]] of Object.entries(FILTERS)) {
    const row = document.createElement("label");
    row.className = "layer-slider";
    row.innerHTML = `${label(k)} <output id="lf-value-${k}">${def}</output><input id="lf-${k}" aria-label="Layer ${k}" type="range" min="${min}" max="${max}" value="${def}">`;
    $("layerFilters").append(row);
    $(`lf-${k}`).oninput = (e) => {
      selected().filters[k] = Number(e.target.value);
      $(`lf-value-${k}`).value = e.target.value;
      changed();
    };
  }
  function selected() {
    return state.selected === "base"
      ? state.base
      : state.selected === "spam"
        ? state.spam
        : state.layers.find((l) => l.id === state.selected);
  }
  function changed() {
    state.editing = ["text", "image"].includes(selected()?.type);
    onChange();
    updateSelection();
  }
  function refreshList() {
    $("layerList").replaceChildren();
    const items = [...state.layers]
      .reverse()
      .map((l) => ({ id: l.id, name: l.name, visible: l.visible }));
    items.push(
      { id: "spam", name: "SPAM SWARM / BUILT-IN" },
      { id: "base", name: "SOURCE / SIGNAL CHAIN" },
    );
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "layer-row";
      if (item.visible !== undefined) {
        const eye = document.createElement("button");
        eye.textContent = item.visible ? "ON" : "OFF";
        eye.setAttribute("aria-label", `Toggle visibility of ${item.name}`);
        eye.setAttribute("aria-pressed", item.visible);
        eye.onclick = () => {
          state.layers.find((l) => l.id === item.id).visible = !item.visible;
          refreshList();
          changed();
        };
        row.append(eye);
      }
      const b = document.createElement("button");
      b.textContent = item.name;
      b.className = "layer-select";
      b.setAttribute("aria-pressed", state.selected === item.id);
      b.onclick = () => select(item.id);
      row.append(b);
      $("layerList").append(row);
    }
  }
  function select(id) {
    state.selected = id;
    state.editing = ["text", "image"].includes(selected()?.type);
    refreshList();
    refreshInspector();
    updateSelection();
  }
  function refreshInspector() {
    const l = selected(),
      free = !!l?.type;
    $("layerName").value = free
      ? l.name
      : state.selected === "spam"
        ? "SPAM SWARM"
        : "SOURCE / SIGNAL CHAIN";
    $("layerName").disabled = !free;
    $("layerBlend").value = l.blend;
    $("layerOpacity").value = l.opacity;
    $("layerOpacityValue").value = l.opacity + "%";
    $("textSettings").hidden = l.type !== "text";
    $("moduleSettings").hidden = l.type !== "module";
    $("placementSettings").hidden = !["text", "image"].includes(l.type);
    for (const id of ["layerUp", "layerDown", "duplicateLayer", "deleteLayer"])
      $(id).disabled = !free;
    if (free) {
      const index = state.layers.indexOf(l);
      $("layerUp").disabled = index === state.layers.length - 1;
      $("layerDown").disabled = index === 0;
    }
    if (l.type === "text")
      for (const [id, key] of Object.entries({
        layerText: "text",
        layerFont: "font",
        layerColor: "color",
        layerFontSize: "fontSize",
        layerAlign: "align",
        layerOutline: "outline",
        layerShadow: "shadow",
      }))
        $(id).value = l[key];
    if (l.type === "text")
      for (const k of ["bold", "italic", "underline"])
        $("layer" + k[0].toUpperCase() + k.slice(1)).checked = l[k];
    if (["text", "image"].includes(l.type)) {
      for (const [id, key] of Object.entries({
        layerX: "x",
        layerY: "y",
        layerWidth: "width",
      }))
        $(id).value = Number((l[key] * 100).toFixed(1));
      $("layerRotation").value = l.rotation;
      $("layerMotion").value = l.motion;
      $("layerSpeed").value = l.speed;
    }
    if (l.type === "module") $("modulePreset").value = l.preset || "";
    for (const k of Object.keys(FILTERS)) {
      $(`lf-${k}`).value = l.filters[k];
      $(`lf-value-${k}`).value = l.filters[k];
    }
  }
  function add(l) {
    if (state.layers.length >= 16) {
      toast("Maximum 16 layers per composition.");
      return;
    }
    state.layers.push(l);
    select(l.id);
    changed();
  }
  $("addText").onclick = () =>
    add(
      newLayer(
        "text",
        "TEXT " + (state.layers.filter((l) => l.type === "text").length + 1),
      ),
    );
  $("addModule").onclick = () => {
    const l = newLayer("module", "GLITCH MODULE");
    l.recipe = structuredClone(getRecipe());
    l.preset = PRESETS.find((p) => p.name === l.recipe.name)?.id || "";
    add(l);
  };
  $("modulePreset").onchange = (e) => {
    if (!e.target.value) return;
    const l = selected();
    l.recipe = recipeFromPreset(e.target.value, getRecipe().seed);
    l.preset = e.target.value;
    l.name = l.recipe.name;
    refreshList();
    refreshInspector();
    changed();
  };
  async function addImage(fileOrCanvas, name) {
    try {
      if (state.layers.length >= 16)
        throw new Error("Maximum 16 layers per composition.");
      let source = fileOrCanvas;
      if (fileOrCanvas instanceof File) {
        source = await safeImage(fileOrCanvas, 1920);
      }
      const ratio = Math.min(1, 1920 / Math.max(source.width, source.height)),
        c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(source.width * ratio));
      c.height = Math.max(1, Math.round(source.height * ratio));
      c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
      const l = newLayer("image", name.slice(0, 80));
      l.asset = c.toDataURL("image/png");
      l.image = c;
      l.width = 0.45;
      add(l);
    } catch (e) {
      toast("Could not add this image layer: " + e.message);
    }
  }
  $("addImage").onclick = () => $("layerImageInput").click();
  $("layerImageInput").onchange = (e) => {
    if (e.target.files[0]) addImage(e.target.files[0], e.target.files[0].name);
    e.target.value = "";
  };
  $("freezeFrame").onclick = () => addImage(getFrame(), "FROZEN FRAME");
  $("duplicateLayer").onclick = () => {
    const old = selected(),
      l = {
        ...structuredClone(serializeLayers([old])[0]),
        id: crypto.randomUUID(),
        name: (old.name + " COPY").slice(0, 80),
        x: Math.min(2, old.x + 0.03),
        y: Math.min(2, old.y + 0.03),
      };
    l.image = old.image;
    add(l);
  };
  $("deleteLayer").onclick = () => {
    state.layers = state.layers.filter((l) => l.id !== state.selected);
    select("base");
    changed();
  };
  for (const [id, delta] of [
    ["layerUp", 1],
    ["layerDown", -1],
  ])
    $(id).onclick = () => {
      const i = state.layers.findIndex((l) => l.id === state.selected),
        j = i + delta;
      if (j < 0 || j >= state.layers.length) return;
      [state.layers[i], state.layers[j]] = [state.layers[j], state.layers[i]];
      refreshList();
      refreshInspector();
      changed();
    };
  $("layerName").oninput = (e) => {
    selected().name = e.target.value;
    refreshList();
  };
  $("layerBlend").onchange = (e) => {
    selected().blend = e.target.value;
    changed();
  };
  $("layerOpacity").oninput = (e) => {
    selected().opacity = Number(e.target.value);
    $("layerOpacityValue").value = e.target.value + "%";
    changed();
  };
  for (const [id, key] of Object.entries({
    layerText: "text",
    layerFont: "font",
    layerColor: "color",
    layerAlign: "align",
    layerMotion: "motion",
  }))
    $(id).oninput = (e) => {
      selected()[key] = e.target.value;
      changed();
    };
  for (const [id, key] of Object.entries({
    layerFontSize: "fontSize",
    layerOutline: "outline",
    layerShadow: "shadow",
    layerRotation: "rotation",
    layerSpeed: "speed",
    layerX: "x",
    layerY: "y",
    layerWidth: "width",
  }))
    $(id).oninput = (e) => {
      if (!e.target.value || !e.target.checkValidity()) return;
      selected()[key] =
        Number(e.target.value) / (["x", "y", "width"].includes(key) ? 100 : 1);
      changed();
    };
  for (const k of ["bold", "italic", "underline"])
    $("layer" + k[0].toUpperCase() + k.slice(1)).onchange = (e) => {
      selected()[k] = e.target.checked;
      changed();
    };
  $("resetLayerFilters").onclick = () => {
    selected().filters = { ...FILTER_DEFAULTS };
    refreshInspector();
    changed();
  };
  function updateSelection() {
    const box = $("layerSelection"),
      l = selected();
    box.hidden = !state.editing || !l?.bounds || !l.visible || isRecording();
    $("finishLayerEdit").hidden = box.hidden;
    $("finishLayerInspector").hidden = box.hidden;
    if (box.hidden) return;
    const rect = canvas.getBoundingClientRect(),
      stage = $("stage").getBoundingClientRect(),
      b = l.bounds;
    box.style.left = rect.left - stage.left + b.x * rect.width + "px";
    box.style.top = rect.top - stage.top + b.y * rect.height + "px";
    box.style.width = b.width * rect.width + "px";
    box.style.height = b.height * rect.height + "px";
    box.style.transform = `rotate(${l.rotation}deg)`;
  }
  let drag = null;
  function startDrag(e, resize = false) {
    if (isRecording()) return;
    const rect = canvas.getBoundingClientRect(),
      px = (e.clientX - rect.left) / rect.width,
      py = (e.clientY - rect.top) / rect.height;
    if (!resize) {
      const found = [...state.layers].reverse().find((l) => {
        if (!l.visible || !l.opacity || !l.bounds) return false;
        const b = l.bounds,
          a = (-l.rotation * Math.PI) / 180,
          cx = (px - b.x - b.width / 2) * rect.width,
          cy = (py - b.y - b.height / 2) * rect.height;
        return (
          Math.abs(cx * Math.cos(a) - cy * Math.sin(a)) <=
            (b.width * rect.width) / 2 &&
          Math.abs(cx * Math.sin(a) + cy * Math.cos(a)) <=
            (b.height * rect.height) / 2
        );
      });
      if (!found) {
        finishEditing();
        return;
      }
      select(found.id);
    }
    const l = selected();
    if (!l.type || l.type === "module") return;
    // Freeze moving layers at their current position before manual placement.
    if (l.motion !== "static") {
      l.x = l.bounds.x;
      l.y = l.bounds.y;
      l.motion = "static";
    }
    drag = {
      id: e.pointerId,
      target: e.currentTarget,
      resize,
      startX: e.clientX,
      startY: e.clientY,
      x: l.x,
      y: l.y,
      width: l.width,
      size: l.fontSize,
      rotation: l.rotation,
      rect,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    refreshInspector();
  }
  canvas.addEventListener("pointerdown", (e) => startDrag(e));
  $("resizeLayer").addEventListener("pointerdown", (e) => startDrag(e, true));
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const l = selected(),
      dx = e.clientX - drag.startX,
      dy = e.clientY - drag.startY;
    if (drag.resize) {
      const a = (-drag.rotation * Math.PI) / 180,
        local = dx * Math.cos(a) - dy * Math.sin(a);
      l.width = Math.max(
        0.02,
        Math.min(2, drag.width + local / drag.rect.width),
      );
      if (l.type === "text")
        l.fontSize =
          Math.round(
            Math.max(8, Math.min(400, (drag.size * l.width) / drag.width)) * 10,
          ) / 10;
    } else {
      l.x = Math.max(-1, Math.min(2, drag.x + dx / drag.rect.width));
      l.y = Math.max(-1, Math.min(2, drag.y + dy / drag.rect.height));
    }
    refreshInspector();
    changed();
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", () => {
    drag = null;
  });
  document.addEventListener("pointercancel", () => {
    drag = null;
  });
  window.addEventListener("resize", updateSelection);
  new ResizeObserver(updateSelection).observe(canvas);
  function exportProject() {
    return {
      app: "ARTFORGE",
      type: "layer-project",
      version: 1,
      recipe: getRecipe(),
      base: state.base,
      spam: state.spam,
      layers: serializeLayers(state.layers),
    };
  }
  async function importProject(data, stillCurrent = () => true) {
    if (
      !data ||
      data.app !== "ARTFORGE" ||
      data.type !== "layer-project" ||
      data.version !== 1 ||
      !Array.isArray(data.layers) ||
      data.layers.length > 16
    )
      throw new Error("Invalid layer project.");
    const base = validateStyle(data.base || {}),
      spam = validateStyle(data.spam || {}),
      layers = data.layers.map(validateLayer);
    let pixels = 0;
    for (const l of layers)
      if (l.type === "image") {
        if (!stillCurrent()) return;
        l.image = await safeImage(embeddedImageBlob(l.asset), 1920);
        pixels += l.image.width * l.image.height;
        if (pixels > 24000000)
          throw new Error(
            "Combined image layers exceed 24 megapixels. Use smaller overlays.",
          );
        l.asset = l.image.toDataURL("image/png");
      }
    if (!stillCurrent()) return;
    state.base = base;
    state.spam = spam;
    state.layers = layers;
    select(layers.at(-1)?.id || "base");
    changed();
  }
  select("base");
  return {
    state,
    exportProject,
    importProject,
    updateSelection,
    selectSpam: () => {
      select("spam");
      host.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    renderBase(ctx, source, seed, time) {
      const c = applyLayerFilters(source, state.base.filters, seed, time);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      compositeCanvas(ctx, c, state.base.blend, state.base.opacity);
    },
    render(ctx, recipe, time, spamImage) {
      renderSpamLayer(ctx, recipe, time, spamImage, state.spam);
      renderStack(ctx, state.layers, recipe.seed, time);
    },
  };
}
