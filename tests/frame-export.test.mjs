import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encodeFrameSequence } from "../web/frame-export.mjs";

test("slow encoding receives every frame in order on an exact looping timeline", async () => {
  const times = [],
    encoded = [];
  let busy = false;
  const frames = await encodeFrameSequence({
    seconds: 2,
    start: 3,
    loopEnd: 4,
    renderFrame: (time, index) => {
      assert.equal(busy, false);
      times.push(time);
      return index;
    },
    addFrame: async (index) => {
      busy = true;
      await new Promise((r) => setTimeout(r, 1));
      encoded.push(index);
      busy = false;
    },
  });
  assert.equal(frames, 48);
  assert.deepEqual(
    encoded,
    Array.from({ length: 48 }, (_, i) => i),
  );
  assert.equal(times[0], 3);
  assert.equal(times[24], 3);
  assert.ok(Math.abs(times[47] - (3 + 23 / 24)) < 1e-10);
});

test("cancellation stops before another frame is encoded", async () => {
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(
    encodeFrameSequence({
      seconds: 8,
      start: 0,
      loopEnd: 8,
      signal: controller.signal,
      renderFrame: () => new ArrayBuffer(4),
      addFrame: async () => {
        if (++count === 3) controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(count, 3);
});

test("frame exports reject invalid or excessive durations", async () => {
  for (const seconds of [NaN, Infinity, -1, 0, 61])
    await assert.rejects(
      encodeFrameSequence({ seconds, start: 0, loopEnd: 8 }),
      /duration/,
    );
});

test("software H.264 encodes pixels without native recorder or dynamic JavaScript", async () => {
  const source = await readFile(
    new URL("../web/vendor/software-h264.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /new Function|\beval\(|=Function;/);
  const { createH264MP4Encoder } = await import(
    "../web/vendor/software-h264.mjs"
  );
  const encoder = await createH264MP4Encoder();
  try {
    encoder.width = 32;
    encoder.height = 32;
    encoder.frameRate = 24;
    encoder.initialize();
    for (let i = 0; i < 24; i++)
      encoder.addFrameRgba(new Uint8Array(32 * 32 * 4).fill(i * 10));
    encoder.finalize();
    const bytes = encoder.FS.readFile(encoder.outputFilename);
    assert.equal(new TextDecoder().decode(bytes.slice(4, 8)), "ftyp");
    assert.ok(bytes.length > 1000);
    assert.match(new TextDecoder().decode(bytes), /avc1/);
  } finally {
    encoder.delete();
  }
});
