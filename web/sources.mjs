import { hash } from "./recipe.mjs";
export function generateSource(kind, seed = 404) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 720;
  const d = canvas.getContext("2d");
  let n = seed;
  const rand = () => {
    n = hash(n + 1);
    return n / 4294967296;
  };
  const hex = (digits) =>
    Math.floor(rand() * 16 ** digits)
      .toString(16)
      .toUpperCase()
      .padStart(digits, "0");
  d.fillStyle = "#111";
  d.fillRect(0, 0, 960, 720);
  d.textBaseline = "top";
  d.font = "12px monospace";
  const text = (value, x, y, color = "#ccc", size = 12) => {
    d.fillStyle = color;
    d.font = `${size}px monospace`;
    d.fillText(value, x, y);
  };
  const frame = (x, y, w, h, title) => {
    d.strokeStyle = "#777";
    d.lineWidth = 1;
    d.strokeRect(x, y, w, h);
    d.fillStyle = "#bcbcbc";
    d.fillRect(x, y, w, 25);
    text(title, x + 8, y + 6, "#111", 11);
  };
  if (kind === "memory") {
    text("ARTFORGE / VOLATILE MEMORY", 30, 27, "#eee", 24);
    text(`SEGMENT 0x${hex(6)}  /  SEED ${seed}`, 30, 65, "#999");
    frame(28, 104, 904, 517, "MEMORY INSPECTOR — RAW BYTE VIEW");
    text(
      "OFFSET      00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F      DECODED",
      42,
      143,
      "#eee",
    );
    for (let row = 0; row < 25; row++) {
      const y = 170 + row * 17;
      let bytes = [],
        ascii = "";
      for (let col = 0; col < 16; col++) {
        const b = Math.floor(rand() * 256);
        bytes.push(b.toString(16).toUpperCase().padStart(2, "0"));
        ascii += b > 32 && b < 127 ? String.fromCharCode(b) : ".";
      }
      if (row % 7 === 0) {
        d.fillStyle = "#c4c4c4";
        d.fillRect(37, y - 1, 885, 16);
      }
      text(
        (row * 16).toString(16).toUpperCase().padStart(8, "0"),
        42,
        y,
        row % 7 === 0 ? "#111" : "#888",
      );
      text(bytes.join(" "), 145, y, row % 7 === 0 ? "#111" : "#ddd");
      text(ascii, 715, y, row % 7 === 0 ? "#111" : "#999", 10);
    }
    text("READ / WRITE / DECAY", 30, 653, "#eee", 18);
    text("SIMULATED DATA. REAL DAMAGE.", 30, 686, "#888", 10);
  } else if (kind === "circuit") {
    d.fillStyle = "#151515";
    d.fillRect(0, 0, 960, 720);
    d.strokeStyle = "#252525";
    for (let x = 0; x < 960; x += 20)
      for (let y = 0; y < 720; y += 20) {
        d.strokeRect(x, y, 1, 1);
      }
    for (let i = 0; i < 70; i++) {
      const x = Math.round(rand() * 44) * 20 + 20,
        y = Math.round(rand() * 29) * 20 + 80,
        dx = Math.round(rand() * 8 - 4) * 20,
        dy = Math.round(rand() * 8 - 4) * 20;
      d.strokeStyle = i % 4 === 0 ? "#aaa" : "#555";
      d.lineWidth = i % 5 === 0 ? 3 : 1;
      d.beginPath();
      d.moveTo(x, y);
      d.lineTo(x + dx, y);
      d.lineTo(x + dx, y + dy);
      d.lineTo(x + dx + 20, y + dy);
      d.stroke();
      d.strokeRect(x - 3, y - 3, 6, 6);
    }
    for (let i = 0; i < 12; i++) {
      const x = 70 + (i % 4) * 225 + rand() * 20,
        y = 120 + Math.floor(i / 4) * 180 + rand() * 20;
      d.fillStyle = "#090909";
      d.fillRect(x, y, 122, 85);
      d.strokeStyle = "#b0b0b0";
      d.lineWidth = 1;
      d.strokeRect(x, y, 122, 85);
      for (let pin = 0; pin < 10; pin++) {
        d.fillStyle = "#a8a8a8";
        d.fillRect(x + 8 + pin * 11, y - 9, 5, 9);
        d.fillRect(x + 8 + pin * 11, y + 85, 5, 9);
      }
      text(`AF-${hex(4)}`, x + 15, y + 20, "#eee", 15);
      text(`U${i + 1} / ${hex(6)}`, x + 15, y + 46, "#888", 10);
    }
    text("AF-01 / SIGNAL PROCESSOR", 28, 26, "#eee", 24);
    text(
      "EXPERIMENTAL BOARD / REV " + hex(2) + " / SIMULATED HARDWARE",
      30,
      66,
      "#888",
    );
    text("NO SERVICEABLE PARTS. ONLY POSSIBILITIES.", 30, 675, "#aaa");
  } else {
    text("ARTFORGE SYSTEM BIOS", 35, 30, "#eee", 28);
    text("COPYRIGHT (C) THE BROKEN SIGNAL", 35, 76, "#999");
    const lines = [
      "CPU ............. SIGNAL PROCESSOR / 404 MHz",
      "MEMORY .......... " + (64 + Math.floor(rand() * 256)) + " MB / UNSTABLE",
      "VIDEO ........... ANALOG OUT / SYNC LOST",
      "INPUT ........... ARTIST PRESENT",
      "BUS ............. OPEN CIRCUIT",
      "CACHE ........... " + hex(8),
      "CHECKSUM ........ " + hex(8) + " / MISMATCH",
      "RESTORING PREVIOUS BEAUTIFUL FAILURE...",
    ];
    lines.forEach((line, i) =>
      text(line, 38, 130 + i * 27, i === 3 ? "#fff" : "#aaa", 15),
    );
    frame(35, 386, 890, 192, "COMPONENT STATUS / DIAGNOSTIC STILL");
    for (let i = 0; i < 5; i++) {
      let x = 53 + i * 172;
      text(
        ["MEMORY", "VIDEO", "AUDIO", "BUS", "VOLTAGE"][i],
        x,
        430,
        "#ccc",
        13,
      );
      for (let j = 0; j < 14; j++) {
        d.fillStyle = rand() > 0.25 ? "#ddd" : "#363636";
        d.fillRect(x, 459 + j * 6, Math.floor(rand() * 130) + 12, 3);
      }
      text(hex(8), x, 558, "#aaa", 11);
    }
    text("PRESS ANYTHING TO MAKE IT WORSE_", 36, 631, "#eee", 19);
    text("GENERATED ARTWORK / NOT A SYSTEM DIAGNOSTIC", 36, 679, "#777", 10);
  }
  return canvas;
}
